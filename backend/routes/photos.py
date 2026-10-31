"""Foto dei lavori (per ricordare il luogo). File su Object Storage, riferimenti su Mongo."""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from db import db
from firebase_auth import get_current_user
from storage import APP_NAME, get_object, put_object

router = APIRouter()
log = logging.getLogger(__name__)

ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}
MAX_BYTES = 12 * 1024 * 1024


def _public(doc: dict) -> dict:
    return {k: doc.get(k) for k in ("id", "client_id", "content_type", "size", "created_at")}


@router.get("/clients/{client_id}/photos")
async def list_photos(client_id: str, user=Depends(get_current_user)):
    docs = await db.job_photos.find(
        {"user_id": user["uid"], "client_id": client_id, "is_deleted": False}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return [_public(d) for d in docs]


@router.post("/clients/{client_id}/photos")
async def upload_photo(client_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED:
        raise HTTPException(400, "Formato immagine non supportato")
    data = await file.read()
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(400, "Immagine vuota o troppo grande (max 12 MB)")
    photo_id = str(uuid.uuid4())
    path = f"{APP_NAME}/job-photos/{user['uid']}/{photo_id}.{ALLOWED[ctype]}"
    if not os.environ.get("EMERGENT_LLM_KEY"):
        raise HTTPException(503, "Foto non attive: manca EMERGENT_LLM_KEY nelle impostazioni del server")
    try:
        result = await asyncio.to_thread(put_object, path, data, ctype)
    except Exception as e:
        log.exception("Upload foto fallito: %s", e)
        raise HTTPException(502, f"Caricamento foto non riuscito ({type(e).__name__}), riprova")
    doc = {
        "id": photo_id,
        "user_id": user["uid"],
        "client_id": client_id,
        "storage_path": result["path"],
        "content_type": ctype,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.job_photos.insert_one(doc)
    return _public(doc)


@router.get("/photos/{photo_id}/file")
async def photo_file(photo_id: str, user=Depends(get_current_user)):
    doc = await db.job_photos.find_one({"id": photo_id, "user_id": user["uid"], "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Foto non trovata")
    try:
        data, _ = await asyncio.to_thread(get_object, doc["storage_path"])
    except Exception as e:
        log.exception("Download foto fallito: %s", e)
        raise HTTPException(502, "Foto non disponibile al momento")
    return Response(content=data, media_type=doc["content_type"], headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str, user=Depends(get_current_user)):
    res = await db.job_photos.update_one(
        {"id": photo_id, "user_id": user["uid"], "is_deleted": False}, {"$set": {"is_deleted": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Foto non trovata")
    return {"ok": True}


@router.delete("/clients/{client_id}/photos")
async def delete_job_photos(client_id: str, user=Depends(get_current_user)):
    res = await db.job_photos.update_many(
        {"user_id": user["uid"], "client_id": client_id, "is_deleted": False}, {"$set": {"is_deleted": True}}
    )
    return {"ok": True, "deleted": res.modified_count}
