"""Endpoint Rilievi Porte Sezionali.

Modulo compilato in loco dal rilievista per ordinare porte sezionali al fornitore.
CRUD completo, filtro per cliente, isolamento per utente autenticato.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from firebase_auth import get_current_user
from models import SezionaleRilievo, SezionaleRilievoCreate, SezionaleRilievoUpdate

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/rilievi-sezionali", response_model=List[SezionaleRilievo])
async def list_rilievi(
    client_id: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["uid"]}
    if client_id:
        q["client_id"] = client_id
    docs = await db.rilievi_sezionali.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return docs


@router.get("/rilievi-sezionali/{rilievo_id}", response_model=SezionaleRilievo)
async def get_rilievo(rilievo_id: str, user=Depends(get_current_user)):
    doc = await db.rilievi_sezionali.find_one(
        {"id": rilievo_id, "user_id": user["uid"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Rilievo non trovato")
    return doc


@router.post("/rilievi-sezionali", response_model=SezionaleRilievo)
async def create_rilievo(payload: SezionaleRilievoCreate, user=Depends(get_current_user)):
    data = payload.model_dump()
    provided_id = data.pop("id", None)
    if provided_id:
        existing = await db.rilievi_sezionali.find_one(
            {"id": provided_id, "user_id": user["uid"]}, {"_id": 0}
        )
        if existing:
            return existing
    obj = SezionaleRilievo(**data, user_id=user["uid"])
    if provided_id:
        obj.id = provided_id
    await db.rilievi_sezionali.insert_one(obj.model_dump())
    return obj


@router.put("/rilievi-sezionali/{rilievo_id}", response_model=SezionaleRilievo)
async def update_rilievo(
    rilievo_id: str,
    payload: SezionaleRilievoUpdate,
    user=Depends(get_current_user),
):
    patch = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not patch:
        existing = await db.rilievi_sezionali.find_one(
            {"id": rilievo_id, "user_id": user["uid"]}, {"_id": 0}
        )
        if not existing:
            raise HTTPException(404, "Rilievo non trovato")
        return existing
    patch["updated_at"] = _now_iso()
    res = await db.rilievi_sezionali.find_one_and_update(
        {"id": rilievo_id, "user_id": user["uid"]},
        {"$set": patch},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Rilievo non trovato")
    return res


@router.delete("/rilievi-sezionali/{rilievo_id}")
async def delete_rilievo(rilievo_id: str, user=Depends(get_current_user)):
    res = await db.rilievi_sezionali.delete_one(
        {"id": rilievo_id, "user_id": user["uid"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Rilievo non trovato")
    return {"ok": True}
