"""Contratti di manutenzione con promemoria delle visite periodiche (in app + email)."""
import asyncio
import calendar
import hmac
import logging
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import List, Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError

from db import db
from email_service import send_email
from firebase_auth import get_current_user
from routes.documenti import _next_number

router = APIRouter()
logger = logging.getLogger(__name__)
ROME = ZoneInfo("Europe/Rome")
PREAVVISO_GIORNI = 15


class Impianto(BaseModel):
    model_config = ConfigDict(extra="ignore")
    descrizione: str = ""
    matricola: str = ""


class Visita(BaseModel):
    model_config = ConfigDict(extra="ignore")
    data: str
    nota: str = ""


class ContrattoIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = None
    cliente: str = ""
    indirizzo: str = ""
    comune: str = ""
    telefono: str = ""
    email_cliente: str = ""
    cf_piva: str = ""
    impianti: List[Impianto] = Field(default_factory=list)
    data_inizio: str
    durata_mesi: int = Field(12, ge=1, le=120)
    frequenza_mesi: int = Field(6, ge=1, le=24)
    rinnovo_tacito: bool = True
    canone: str = ""
    pagamento: str = ""
    sconto_interventi: str = ""
    note: str = ""
    visite: List[Visita] = Field(default_factory=list)
    stato: Literal["attivo", "disdetto"] = "attivo"


def _today() -> date:
    return datetime.now(ROME).date()


def _d(s: Optional[str]) -> Optional[date]:
    try:
        return date.fromisoformat((s or "")[:10])
    except ValueError:
        return None


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def compute(c: dict, today: Optional[date] = None) -> dict:
    """Aggiunge prossima visita, fine contratto e scadenze imminenti."""
    today = today or _today()
    start = _d(c.get("data_inizio")) or today
    visits = sorted(filter(None, (_d(v.get("data")) for v in c.get("visite", []))))
    last = visits[-1] if visits else None
    prossima = add_months(last or start, c.get("frequenza_mesi", 6))
    fine = add_months(start, c.get("durata_mesi", 12))
    if c.get("rinnovo_tacito", True):
        while fine < today:
            fine = add_months(fine, c.get("durata_mesi", 12))
    limit = today + timedelta(days=PREAVVISO_GIORNI)
    attivo = c.get("stato", "attivo") == "attivo"
    scadenze = []
    if attivo and prossima <= limit:
        scadenze.append({"tipo": "visita", "data": prossima.isoformat(), "key": f"visita:{prossima.isoformat()}"})
    if attivo and not c.get("rinnovo_tacito", True) and fine <= limit:
        scadenze.append({"tipo": "fine", "data": fine.isoformat(), "key": f"fine:{fine.isoformat()}"})
    return {
        **c,
        "ultima_visita": last.isoformat() if last else None,
        "prossima_visita": prossima.isoformat(),
        "data_fine": fine.isoformat(),
        "giorni_alla_visita": (prossima - today).days,
        "scadenze": scadenze,
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


ACTIVE = {"is_deleted": {"$ne": True}}
PROJ = {"_id": 0, "user_id": 0, "reminded": 0}


@router.get("/contratti")
async def list_contratti(user=Depends(get_current_user)):
    docs = await db.contratti.find({"user_id": user["uid"], **ACTIVE}, PROJ).to_list(5000)
    return sorted((compute(d) for d in docs), key=lambda c: c["prossima_visita"])


@router.get("/contratti/in-scadenza")
async def in_scadenza(user=Depends(get_current_user)):
    docs = await db.contratti.find({"user_id": user["uid"], "stato": "attivo", **ACTIVE}, PROJ).to_list(5000)
    return [c for c in (compute(d) for d in docs) if c["scadenze"]]


@router.post("/contratti")
async def create_contratto(payload: ContrattoIn, user=Depends(get_current_user)):
    uid = user["uid"]
    if payload.id:
        existing = await db.contratti.find_one({"id": payload.id, "user_id": uid, **ACTIVE}, PROJ)
        if existing:
            return compute(existing)
    year = payload.data_inizio[:4]
    doc = {
        **payload.model_dump(),
        "id": payload.id or str(uuid.uuid4()),
        "user_id": uid,
        "owner_email": user.get("email") or "",
        "anno": year,
        "numero": await _next_number(uid, "contratto", year),
        "reminded": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.contratti.insert_one(doc)
    for k in ("_id", "user_id", "reminded"):
        doc.pop(k, None)
    return compute(doc)


@router.put("/contratti/{cid}")
async def update_contratto(cid: str, payload: ContrattoIn, user=Depends(get_current_user)):
    patch = payload.model_dump(exclude={"id"})
    patch["updated_at"] = _now()
    if user.get("email"):
        patch["owner_email"] = user["email"]
    res = await db.contratti.find_one_and_update(
        {"id": cid, "user_id": user["uid"], **ACTIVE}, {"$set": patch}, return_document=True, projection=PROJ
    )
    if not res:
        raise HTTPException(404, "Contratto non trovato")
    return compute(res)


@router.post("/contratti/{cid}/visite")
async def add_visita(cid: str, visita: Visita, user=Depends(get_current_user)):
    if not _d(visita.data):
        raise HTTPException(422, "Data non valida")
    res = await db.contratti.find_one_and_update(
        {"id": cid, "user_id": user["uid"], **ACTIVE},
        {"$push": {"visite": visita.model_dump()}, "$set": {"updated_at": _now()}},
        return_document=True,
        projection=PROJ,
    )
    if not res:
        raise HTTPException(404, "Contratto non trovato")
    return compute(res)


@router.delete("/contratti/{cid}")
async def delete_contratto(cid: str, user=Depends(get_current_user)):
    res = await db.contratti.update_one(
        {"id": cid, "user_id": user["uid"]}, {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Contratto non trovato")
    return {"ok": True}


def _fmt(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def _email_html(items: list) -> str:
    rows = "".join(
        f'<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>{escape(c["cliente"] or "Cliente")}</strong><br>'
        f'<span style="color:#555">{escape(", ".join(filter(None, [c["indirizzo"], c["comune"]])))}</span></td>'
        f'<td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">'
        f'{"Visita di manutenzione" if s["tipo"] == "visita" else "Fine contratto"}<br><strong>{_fmt(s["data"])}</strong></td></tr>'
        for c, s in items
    )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111">'
        '<h2 style="color:#0047ab;margin:0 0 12px">Manutenzioni in scadenza</h2>'
        f"<p>Nei prossimi {PREAVVISO_GIORNI} giorni hai queste scadenze dei contratti di manutenzione:</p>"
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">{rows}</table>'
        "<p>Apri l'Agenda, sezione Contratti manutenzione, per vedere i dettagli e registrare le visite.</p>"
        f'<p style="font-size:12px;color:#888">Promemoria automatico di {escape(os.environ.get("EMAIL_FROM_NAME", "Agenda"))}.</p>'
        "</td></tr></table>"
    )


async def send_reminders(uid: Optional[str] = None) -> int:
    """Invia un'email riepilogativa per utente con le scadenze non ancora notificate."""
    q = {"stato": "attivo", **ACTIVE}
    if uid:
        q["user_id"] = uid
    by_user: dict = {}
    async for d in db.contratti.find(q, {"_id": 0}):
        c = compute(d)
        todo = [s for s in c["scadenze"] if s["key"] not in (d.get("reminded") or [])]
        if todo and d.get("owner_email"):
            by_user.setdefault((d["user_id"], d["owner_email"]), []).extend((c, s) for s in todo)
    sent = 0
    for (_, email), items in by_user.items():
        n = len(items)
        subject = f"Promemoria: {n} manutenzion{'e' if n == 1 else 'i'} in scadenza"
        if await send_email(to=email, subject=subject, html=_email_html(items)):
            sent += 1
            for c, s in items:
                await db.contratti.update_one({"id": c["id"]}, {"$addToSet": {"reminded": s["key"]}})
    return sent


async def maybe_run_daily():
    """Esegue i promemoria al massimo una volta al giorno, dopo le 7 ora italiana."""
    now = datetime.now(ROME)
    if now.hour < 7:
        return
    today = now.date().isoformat()
    try:
        await db.jobs.update_one(
            {"_id": "promemoria_manutenzioni", "date": {"$ne": today}}, {"$set": {"date": today}}, upsert=True
        )
    except DuplicateKeyError:
        return
    try:
        await send_reminders()
    except Exception as e:
        logger.error("Promemoria manutenzioni falliti: %s", e)
        await db.jobs.update_one({"_id": "promemoria_manutenzioni"}, {"$set": {"date": ""}})


_tasks: set = set()


def _spawn(coro):
    t = asyncio.create_task(coro)
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


def trigger_daily():
    _spawn(maybe_run_daily())


@router.post("/contratti/invia-promemoria")
async def invia_promemoria(user=Depends(get_current_user)):
    return {"inviati": await send_reminders(user["uid"])}


@router.post("/cron/manutenzioni")
async def cron_manutenzioni(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secret or not token or not hmac.compare_digest(token, secret):
        raise HTTPException(401, "Non autorizzato")
    raw = await request.body()
    if raw.strip():
        try:
            await request.json()
        except Exception:
            raise HTTPException(400, "Corpo non valido")
    run_id = request.headers.get("x-webhook-id") or ""
    if run_id:
        try:
            await db.cron_runs.insert_one({"_id": run_id, "at": _now()})
        except Exception:
            return {"ok": True, "duplicate": True}
    _spawn(send_reminders())
    return {"ok": True}
