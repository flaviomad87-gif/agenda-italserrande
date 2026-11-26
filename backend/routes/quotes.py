"""Preventivi dentro l'agenda (ex app Preventivi). Campi uguali all'app originale per import 1:1."""
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from firebase_auth import get_current_user

router = APIRouter()

DEFAULT_PAYMENT = (
    "Per l'attivazione del preventivo è richiesto il versamento di un acconto pari al 50% del totale.\n"
    "Il saldo del restante 50% dovrà essere corrisposto al termine dei lavori tramite contanti o POS direttamente ai "
    "tecnici incaricati. In alternativa, è possibile procedere via bonifico bancario anticipato, che dovrà risultare "
    "accreditato presso il nostro istituto prima della data dell'appuntamento."
)
DEFAULT_COMPANY = {
    "name": "Italserrande S.r.l.", "address": "Via Castino 29 - 00166 - Roma (RM)", "vat": "09270881007",
    "fiscalCode": "09270881007", "reaNumber": "1152580", "shareCapital": "10.000,00€", "phone": "337743730",
    "office": "06-6240259", "email": "italserrande@libero.it", "logoDataUrl": "", "phrases": [], "templateLayout": {},
}


class LineItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str = ""
    amount: float = 0
    vatRate: float = 22


class QuoteIn(BaseModel):
    id: Optional[str] = None
    number: Optional[str] = None
    date: Optional[str] = None
    status: str = "draft"
    clientName: str = ""
    clientAddress: str = ""
    subject: str = "OFFERTA"
    lineItems: List[LineItem] = Field(default_factory=lambda: [LineItem()])
    paymentTerms: str = DEFAULT_PAYMENT
    footerNote: str = "Firma e timbro per accettazione."
    notes: str = ""
    client_id: Optional[str] = None
    source_id: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class ImportIn(BaseModel):
    quotes: List[QuoteIn]
    company: Optional[dict] = None
    counter: Optional[int] = None


def _num(n) -> int:
    d = re.sub(r"\D", "", str(n or ""))
    return int(d) if d else 0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _settings(uid: str) -> dict:
    s = await db.quote_settings.find_one({"user_id": uid}, {"_id": 0})
    return s or {"user_id": uid, "counter": 0, "company": DEFAULT_COMPANY}


async def _top_number(uid: str) -> int:
    nums = await db.quotes.find({"user_id": uid, "is_deleted": {"$ne": True}}, {"_id": 0, "number": 1}).to_list(10000)
    return max([_num(q.get("number")) for q in nums] + [0])


async def _next_number(uid: str) -> str:
    # Allinea il contatore al numero più alto esistente, poi incremento atomico
    top = await _top_number(uid)
    await db.quote_settings.update_one({"user_id": uid}, {"$max": {"counter": top}}, upsert=True)
    res = await db.quote_settings.find_one_and_update({"user_id": uid}, {"$inc": {"counter": 1}}, return_document=True)
    return str(res["counter"]).zfill(3)


def _out(doc: dict) -> dict:
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


@router.get("/quotes")
async def list_quotes(user=Depends(get_current_user)):
    docs = await db.quotes.find({"user_id": user["uid"], "is_deleted": {"$ne": True}}, {"_id": 0, "user_id": 0}).to_list(10000)
    return sorted(docs, key=lambda q: (q.get("date") or "", _num(q.get("number"))), reverse=True)


@router.get("/quotes/{quote_id}")
async def get_quote(quote_id: str, user=Depends(get_current_user)):
    q = {"user_id": user["uid"], "is_deleted": {"$ne": True}}
    doc = await db.quotes.find_one({**q, "id": quote_id}, {"_id": 0, "user_id": 0})
    if not doc:  # lavoro collegato con l'id della vecchia app Preventivi
        doc = await db.quotes.find_one({**q, "source_id": quote_id}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(404, "Preventivo non trovato")
    return doc


@router.post("/quotes")
async def create_quote(payload: QuoteIn, user=Depends(get_current_user)):
    uid = user["uid"]
    doc = payload.model_dump()
    doc["id"] = doc.get("id") or str(uuid.uuid4())
    existing = await db.quotes.find_one({"id": doc["id"], "user_id": uid}, {"_id": 0, "user_id": 0})
    if existing:
        return existing
    doc["number"] = doc.get("number") or await _next_number(uid)
    doc["date"] = doc.get("date") or datetime.now().strftime("%Y-%m-%d")
    doc["clientName"] = doc["clientName"].strip().upper()
    doc["clientAddress"] = doc["clientAddress"].strip().upper()
    doc["createdAt"] = doc["updatedAt"] = _now()
    await db.quotes.insert_one({**doc, "user_id": uid})
    return _out(doc)


@router.put("/quotes/{quote_id}")
async def update_quote(quote_id: str, payload: QuoteIn, user=Depends(get_current_user)):
    patch = payload.model_dump(exclude_unset=True, exclude={"id", "source_id", "createdAt"})
    patch["updatedAt"] = _now()
    if not patch.get("number"):
        patch.pop("number", None)
    for k in ("clientName", "clientAddress"):
        if k in patch:
            patch[k] = (patch[k] or "").strip().upper()
    res = await db.quotes.find_one_and_update(
        {"id": quote_id, "user_id": user["uid"], "is_deleted": {"$ne": True}}, {"$set": patch}, return_document=True, projection={"_id": 0, "user_id": 0}
    )
    if not res:
        raise HTTPException(404, "Preventivo non trovato")
    return res


class LinkIn(BaseModel):
    lavoro_id: str


async def link_quote(uid: str, q: dict, job_id: str) -> dict:
    """Collega il preventivo a un lavoro: il lavoro mostra 'Apri preventivo N°'."""
    job = await db.clients.find_one({"id": job_id, "user_id": uid}, {"_id": 0, "id": 1, "name": 1})
    if not job:
        raise HTTPException(404, "Lavoro non trovato")
    await db.clients.update_many({"user_id": uid, "quote_ref": q["id"], "id": {"$ne": job_id}}, {"$set": {"quote_ref": "", "quote_number": ""}})
    await db.clients.update_one({"id": job_id, "user_id": uid}, {"$set": {"quote_ref": q["id"], "quote_number": q.get("number", "")}})
    await db.quotes.update_one({"id": q["id"], "user_id": uid}, {"$set": {"client_id": job_id, "updatedAt": _now()}})
    return {"ok": True, "lavoro_id": job_id, "lavoro_nome": job.get("name", "")}


@router.post("/quotes/{quote_id}/collega")
async def collega_quote(quote_id: str, p: LinkIn, user=Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id, "user_id": user["uid"], "is_deleted": {"$ne": True}}, {"_id": 0, "id": 1, "number": 1})
    if not q:
        raise HTTPException(404, "Preventivo non trovato")
    return await link_quote(user["uid"], q, p.lavoro_id)


@router.get("/quotes/{quote_id}/lavoro")
async def quote_job(quote_id: str, user=Depends(get_current_user)):
    job = await db.clients.find_one({"user_id": user["uid"], "quote_ref": quote_id}, {"_id": 0, "id": 1, "name": 1, "address": 1})
    return job or {}


@router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user=Depends(get_current_user)):
    res = await db.quotes.update_one({"id": quote_id, "user_id": user["uid"]}, {"$set": {"is_deleted": True, "updatedAt": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Preventivo non trovato")
    await db.clients.update_many({"user_id": user["uid"], "quote_ref": quote_id}, {"$set": {"quote_ref": "", "quote_number": ""}})
    # Se era l'ultimo numero, il prossimo preventivo lo riprende (niente buchi in coda)
    top = await _top_number(user["uid"])
    await db.quote_settings.update_one({"user_id": user["uid"], "counter": {"$gt": top}}, {"$set": {"counter": top}})
    return {"ok": True}


@router.post("/quotes/import")
async def import_quotes(payload: ImportIn, user=Depends(get_current_user)):
    """Importa dall'app Preventivi: idempotente per source_id, ricollega i lavori che puntavano al vecchio id."""
    uid = user["uid"]
    imported = 0
    for q in payload.quotes:
        doc = q.model_dump()
        src = doc.get("source_id") or doc.get("id")
        if await db.quotes.find_one({"user_id": uid, "source_id": src}):
            continue
        doc.update({"id": str(uuid.uuid4()), "source_id": src, "user_id": uid})
        doc["clientName"] = (doc.get("clientName") or "").strip().upper()
        doc["clientAddress"] = (doc.get("clientAddress") or "").strip().upper()
        doc["createdAt"] = doc.get("createdAt") or _now()
        doc["updatedAt"] = doc.get("updatedAt") or doc["createdAt"]
        await db.quotes.insert_one(doc)
        await db.clients.update_many({"user_id": uid, "quote_ref": src}, {"$set": {"quote_ref": doc["id"]}})
        imported += 1
    s = await _settings(uid)
    nums = [_num(q.number) for q in payload.quotes]
    counter = max([s.get("counter", 0), payload.counter or 0] + nums)
    update = {"counter": counter}
    if payload.company:
        update["company"] = {**DEFAULT_COMPANY, **payload.company}
    await db.quote_settings.update_one({"user_id": uid}, {"$set": update}, upsert=True)
    return {"imported": imported, "counter": counter}


@router.get("/quote-settings")
async def get_settings(user=Depends(get_current_user)):
    s = await _settings(user["uid"])
    return {"counter": s.get("counter", 0), "company": {**DEFAULT_COMPANY, **(s.get("company") or {})}}


class SettingsIn(BaseModel):
    company: dict


@router.put("/quote-settings")
async def put_settings(payload: SettingsIn, user=Depends(get_current_user)):
    await db.quote_settings.update_one(
        {"user_id": user["uid"]}, {"$set": {"company": {**DEFAULT_COMPANY, **payload.company}}}, upsert=True
    )
    return await get_settings(user)
