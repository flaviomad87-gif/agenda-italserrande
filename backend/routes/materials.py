"""Endpoint Magazzino: lista materiale presente in officina.

Modello semplice: nome + quantità + note. L'utente aggiorna la quantità
con pulsanti +/− dalla UI. Scope: per utente autenticato.
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from db import db
from firebase_auth import get_current_user
from models import StockItem, StockItemCreate, StockItemUpdate

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/materials", response_model=List[StockItem])
async def list_materials(user=Depends(get_current_user)):
    docs = await db.materials.find(
        {"user_id": user["uid"]}, {"_id": 0}
    ).sort("name", 1).to_list(2000)
    return docs


@router.post("/materials", response_model=StockItem)
async def create_material(payload: StockItemCreate, user=Depends(get_current_user)):
    data = payload.model_dump()
    provided_id = data.pop("id", None)
    if provided_id:
        existing = await db.materials.find_one(
            {"id": provided_id, "user_id": user["uid"]}, {"_id": 0}
        )
        if existing:
            return existing
    obj = StockItem(**data, user_id=user["uid"])
    if provided_id:
        obj.id = provided_id
    await db.materials.insert_one(obj.model_dump())
    return obj


@router.put("/materials/{material_id}", response_model=StockItem)
async def update_material(
    material_id: str,
    payload: StockItemUpdate,
    user=Depends(get_current_user),
):
    patch = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not patch:
        existing = await db.materials.find_one(
            {"id": material_id, "user_id": user["uid"]}, {"_id": 0}
        )
        if not existing:
            raise HTTPException(404, "Materiale non trovato")
        return existing
    patch["updated_at"] = _now_iso()
    res = await db.materials.find_one_and_update(
        {"id": material_id, "user_id": user["uid"]},
        {"$set": patch},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Materiale non trovato")
    return res


@router.post("/materials/{material_id}/adjust", response_model=StockItem)
async def adjust_material_quantity(
    material_id: str,
    delta: float,
    user=Depends(get_current_user),
):
    """Incrementa/decrementa la quantita' di `delta` in modo ATOMICO.

    Usa una pipeline update MongoDB (singola operazione) cosi' due dispositivi
    o la replay della coda offline non perdono aggiornamenti. Clamp a 0.
    """
    res = await db.materials.find_one_and_update(
        {"id": material_id, "user_id": user["uid"]},
        [
            {
                "$set": {
                    "quantity": {
                        "$max": [
                            0.0,
                            {"$add": [{"$ifNull": ["$quantity", 0.0]}, float(delta or 0.0)]},
                        ]
                    },
                    "updated_at": _now_iso(),
                }
            }
        ],
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Materiale non trovato")
    return res


@router.delete("/materials/{material_id}")
async def delete_material(material_id: str, user=Depends(get_current_user)):
    res = await db.materials.delete_one({"id": material_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Materiale non trovato")
    return {"ok": True}
