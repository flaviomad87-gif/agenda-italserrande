"""Documenti tecnici: Dichiarazione CE di Conformita' e Registro di Manutenzione."""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError

from db import db
from firebase_auth import get_current_user

router = APIRouter()

Kind = Literal["pratica", "ce", "manutenzione", "verifica"]


class DocumentoIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: Optional[str] = None
    kind: Kind
    cliente: str = ""
    indirizzo: str = ""
    data: str = ""
    fields: dict = Field(default_factory=dict)


class DocumentoPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cliente: Optional[str] = None
    indirizzo: Optional[str] = None
    data: Optional[str] = None
    fields: Optional[dict] = None


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
    return res


@router.delete("/documenti/{doc_id}")
async def delete_documento(doc_id: str, user=Depends(get_current_user)):
    res = await db.documenti.update_one(
        {"id": doc_id, "user_id": user["uid"]}, {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Documento non trovato")
    return {"ok": True}
