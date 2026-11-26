"""Accesso dedicato per assistenti IA (Claude, ChatGPT...): token OAuth separati dal login Firebase."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request

from db import db

ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=90)


def now() -> datetime:
    return datetime.now(timezone.utc)


def sha(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host.split(',')[0].strip()}"


async def issue_tokens(uid: str, email: str, client_id: str, client_name: str, conn_id: Optional[str] = None) -> dict:
    access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(40)
    t = now()
    fields = {
        "access_hash": sha(access),
        "access_exp": (t + ACCESS_TTL).isoformat(),
        "refresh_hash": sha(refresh),
        "refresh_exp": (t + REFRESH_TTL).isoformat(),
    }
    if conn_id:
        await db.ai_tokens.update_one({"id": conn_id}, {"$set": fields})
    else:
        await db.ai_tokens.insert_one({
            "id": secrets.token_hex(8), "uid": uid, "email": email, "client_id": client_id,
            "client_name": client_name, "created_at": t.isoformat(), "last_used": None, "revoked": False, **fields,
        })
    return {
        "access_token": access, "token_type": "Bearer", "expires_in": int(ACCESS_TTL.total_seconds()),
        "refresh_token": refresh, "scope": "agenda offline_access",
    }


async def user_from_bearer(request: Request) -> Optional[dict]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    doc = await db.ai_tokens.find_one({"access_hash": sha(auth[7:].strip()), "revoked": False}, {"_id": 0})
    if not doc or doc["access_exp"] < now().isoformat():
        return None
    await db.ai_tokens.update_one({"id": doc["id"]}, {"$set": {"last_used": now().isoformat()}})
    return {"uid": doc["uid"], "email": doc.get("email", ""), "conn": doc["id"], "client_name": doc.get("client_name", "")}
