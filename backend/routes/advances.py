"""Endpoint acconti operai (advances)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from firebase_auth import get_current_user
from models import Advance, AdvanceCreate

router = APIRouter()


@router.post("/advances", response_model=Advance)
async def create_advance(payload: AdvanceCreate, user=Depends(get_current_user)):
    data = payload.model_dump()
    provided_id = data.pop("id", None)
    if provided_id:
        existing = await db.advances.find_one({"id": provided_id, "user_id": user["uid"]}, {"_id": 0})
        if existing:
            return existing
    obj = Advance(**data, user_id=user["uid"])
    if provided_id:
        obj.id = provided_id
    await db.advances.insert_one(obj.model_dump())
    return obj


@router.get("/advances", response_model=List[Advance])
async def list_advances(
    date: Optional[str] = None,
    month: Optional[str] = None,
    worker: Optional[str] = None,
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["uid"]}
    if date:
        q["date"] = date
    elif month:
        q["date"] = {"$regex": f"^{month}"}
    if worker:
        q["worker_name"] = worker
    docs = await db.advances.find(q, {"_id": 0}).sort("date", 1).to_list(2000)
    return docs


@router.get("/advances/by-worker")
async def advances_by_worker(month: str, user=Depends(get_current_user)):
    """Aggregazione mensile degli acconti per operaio.
    Si 'resetta' naturalmente all'inizio di ogni nuovo mese perché filtra per mese."""
    pipeline = [
        {"$match": {"user_id": user["uid"], "date": {"$regex": f"^{month}"}}},
        {
            "$group": {
                "_id": "$worker_name",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1},
                "last_date": {"$max": "$date"},
            }
        },
        {"$sort": {"total": -1}},
    ]
    rows = await db.advances.aggregate(pipeline).to_list(500)
    return [
        {
            "worker_name": r["_id"],
            "total": float(r.get("total") or 0),
            "count": int(r.get("count") or 0),
            "last_date": r.get("last_date"),
        }
        for r in rows
    ]


@router.delete("/advances/{advance_id}")
async def delete_advance(advance_id: str, user=Depends(get_current_user)):
    res = await db.advances.delete_one({"id": advance_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Acconto non trovato")
    return {"ok": True}
