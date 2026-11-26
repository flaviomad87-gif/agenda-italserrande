"""Documenti tecnici: Dichiarazione CE di Conformita' e Registro di Manutenzione."""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo.errors import DuplicateKeyError

from db import db
from firebase_auth import get_current_user
from models import iso_date

router = APIRouter()

Kind = Literal["pratica", "ce", "manutenzione", "verifica"]


def _opt_date(v):
    return iso_date(v) if v else v


class DocumentoIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = None
    kind: Kind
    cliente: str = ""
    indirizzo: str = ""
    data: str = ""
    fields: dict = Field(default_factory=dict)

    @field_validator("data")
    @classmethod
    def _valid_data(cls, v):
        return _opt_date(v)


class DocumentoPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cliente: Optional[str] = None
    indirizzo: Optional[str] = None
    data: Optional[str] = None
    fields: Optional[dict] = None

    @field_validator("data")
    @classmethod
    def _valid_data(cls, v):
        return _opt_date(v)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


ACTIVE = {"is_deleted": {"$ne": True}}
PROJ = {"_id": 0, "user_id": 0}


async def _next_number(uid: str, kind: str, year: str) -> int:
    key = {"user_id": uid, "kind": kind, "anno": year}
    if not await db.documenti_counters.find_one(key):
        # Primo uso del contatore: riparte dall'ultimo numero gia' assegnato
        last = await db.documenti.find_one(key, {"_id": 0, "numero": 1}, sort=[("numero", -1)])
        try:
            await db.documenti_counters.insert_one({**key, "n": (last or {}).get("numero", 0)})
        except DuplicateKeyError:
            pass
    res = await db.documenti_counters.find_one_and_update(key, {"$inc": {"n": 1}}, return_document=True)
    return res["n"]


@router.get("/documenti")
async def list_documenti(kind: Optional[Kind] = Query(None), user=Depends(get_current_user)):
    q = {"user_id": user["uid"], **ACTIVE}
    if kind:
        q["kind"] = kind
    return await db.documenti.find(q, PROJ).sort([("anno", -1), ("numero", -1)]).to_list(5000)


@router.post("/documenti")
async def create_documento(payload: DocumentoIn, user=Depends(get_current_user)):
    uid = user["uid"]
    if payload.id:
        existing = await db.documenti.find_one({"id": payload.id, "user_id": uid, **ACTIVE}, PROJ)
        if existing:
            return existing
    year = (payload.data or _now())[:4]
    doc = {
        **payload.model_dump(),
        "id": payload.id or str(uuid.uuid4()),
        "user_id": uid,
        "anno": year,
        "numero": await _next_number(uid, payload.kind, year),
        **({"public_token": uuid.uuid4().hex} if payload.kind == "pratica" else {}),
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.documenti.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


@router.put("/documenti/{doc_id}")
async def update_documento(doc_id: str, payload: DocumentoPatch, user=Depends(get_current_user)):
    patch = payload.model_dump(exclude_none=True)
    patch["updated_at"] = _now()
    res = await db.documenti.find_one_and_update(
        {"id": doc_id, "user_id": user["uid"], **ACTIVE}, {"$set": patch}, return_document=True, projection=PROJ
    )
    if not res:
        raise HTTPException(404, "Documento non trovato")
    if res.get("kind") == "pratica" and not res.get("public_token"):
        own = {"id": doc_id, "user_id": user["uid"]}
        await db.documenti.update_one({**own, "public_token": {"$exists": False}}, {"$set": {"public_token": uuid.uuid4().hex}})
        res["public_token"] = (await db.documenti.find_one(own, {"_id": 0, "public_token": 1}))["public_token"]
    return res


def _same(a: str, b: str) -> bool:
    return bool(a) and a.strip().lower() == (b or "").strip().lower()


@router.get("/public/impianto/{token}")
async def public_impianto(token: str):
    """Scheda pubblica dell'impianto (QR sulla targhetta): nessun dato personale del cliente."""
    p = await db.documenti.find_one({"public_token": token, "kind": "pratica", **ACTIVE}, {"_id": 0})
    if not p or len(token) < 16:
        raise HTTPException(404, "Impianto non trovato")
    f = p.get("fields") or {}
    matricola = f.get("matricola") or f"{p.get('numero')}/{p.get('anno')}"
    uid = p["user_id"]
    ultima, prossima = None, None
    from routes.contratti import compute
    today = datetime.now(timezone.utc).date().isoformat()
    async for c in db.contratti.find({"user_id": uid, "stato": "attivo", **ACTIVE}, {"_id": 0}).sort("updated_at", -1):
        if _same(c.get("indirizzo"), p.get("indirizzo")) or any(_same(i.get("matricola"), matricola) for i in c.get("impianti", [])):
            cc = compute(c)
            ultima, prossima = cc["ultima_visita"], cc["prossima_visita"]
            break
    async for r in db.documenti.find({"user_id": uid, "kind": "manutenzione", **ACTIVE}, {"_id": 0, "data": 1, "indirizzo": 1}):
        if _same(r.get("indirizzo"), p.get("indirizzo")) and r.get("data") and r["data"] <= today and (not ultima or r["data"] > ultima):
            ultima = r["data"]
    return {
        "tipo_chiusura": f.get("tipo_chiusura"),
        "modello": f.get("modello") or "",
        "matricola": matricola,
        "anno_installazione": f.get("anno_installazione") or (p.get("data") or "")[:4],
        "data_installazione": p.get("data") or "",
        "comune": f.get("comune") or "",
        "ultima_manutenzione": ultima,
        "prossima_manutenzione": prossima,
    }


@router.delete("/documenti/{doc_id}")
async def delete_documento(doc_id: str, user=Depends(get_current_user)):
    res = await db.documenti.update_one(
        {"id": doc_id, "user_id": user["uid"]}, {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Documento non trovato")
    return {"ok": True}
