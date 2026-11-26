"""Foto dei lavori (per ricordare il luogo). File nel MongoDB dell'utente (GridFS); le vecchie su Emergent vengono copiate."""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from db import db
from firebase_auth import get_current_user

router = APIRouter()
log = logging.getLogger(__name__)

ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}
MAX_BYTES = 12 * 1024 * 1024
_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="photo_files")


async def _legacy_bytes(path: str) -> bytes:
    # Foto caricate quando l'archivio era su Emergent
    if not os.environ.get("EMERGENT_LLM_KEY"):
        raise RuntimeError("archivio Emergent non configurato")
    from storage import get_object

    data, _ = await asyncio.to_thread(get_object, path)
    return data


async def _copy_legacy(doc: dict) -> bytes:
    data = await _legacy_bytes(doc["storage_path"])
    fid = await _bucket.upload_from_stream(f"{doc['id']}", data, metadata={"content_type": doc["content_type"]})
    res = await db.job_photos.update_one({"id": doc["id"], "file_id": {"$exists": False}}, {"$set": {"file_id": fid}})
    if res.modified_count == 0:
        await _bucket.delete(fid)
    return data


async def photo_bytes(doc: dict) -> bytes:
    if doc.get("file_id"):
        stream = await _bucket.open_download_stream(ObjectId(doc["file_id"]))
        return await stream.read()
    return await _copy_legacy(doc)


async def _drop_files(docs: list):
    # Libera lo spazio nel database: il file vero viene cancellato
    for d in docs:
        if d.get("file_id"):
            try:
                await _bucket.delete(d["file_id"])
            except Exception as e:
                log.warning("File foto %s non eliminato: %s", d["file_id"], e)


async def migrate_legacy_photos() -> int:
    """Copia nel MongoDB le foto ancora su Emergent. Idempotente."""
    moved = 0
    async for doc in db.job_photos.find({"file_id": {"$exists": False}, "storage_path": {"$exists": True}}, {"_id": 0}):
        try:
            await _copy_legacy(doc)
            moved += 1
        except Exception as e:
            log.warning("Foto %s non copiata: %s", doc.get("id"), e)
    if moved:
        log.info("Foto copiate nel database: %d", moved)
    return moved


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
    try:
        fid = await _bucket.upload_from_stream(f"{photo_id}.{ALLOWED[ctype]}", data, metadata={"content_type": ctype})
    except Exception as e:
        log.exception("Upload foto fallito: %s", e)
        raise HTTPException(502, f"Caricamento foto non riuscito ({type(e).__name__}), riprova")
    doc = {
        "id": photo_id,
        "user_id": user["uid"],
        "client_id": client_id,
        "file_id": fid,
        "content_type": ctype,
        "size": len(data),
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
        data = await photo_bytes(doc)
    except Exception as e:
        log.exception("Download foto fallito: %s", e)
        raise HTTPException(502, "Foto non disponibile al momento")
    return Response(content=data, media_type=doc["content_type"], headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str, user=Depends(get_current_user)):
    doc = await db.job_photos.find_one_and_update(
        {"id": photo_id, "user_id": user["uid"], "is_deleted": False}, {"$set": {"is_deleted": True}}
    )
    if not doc:
        raise HTTPException(404, "Foto non trovata")
    await _drop_files([doc])
    return {"ok": True}


@router.delete("/clients/{client_id}/photos")
async def delete_job_photos(client_id: str, user=Depends(get_current_user)):
    q = {"user_id": user["uid"], "client_id": client_id, "is_deleted": False}
    docs = await db.job_photos.find(q, {"_id": 0, "file_id": 1}).to_list(500)
    res = await db.job_photos.update_many(q, {"$set": {"is_deleted": True}})
    await _drop_files(docs)
    return {"ok": True, "deleted": res.modified_count}
