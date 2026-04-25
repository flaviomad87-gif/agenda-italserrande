"""Firebase Admin SDK initialization and FastAPI dependency for token verification.

Credentials are loaded with the following priority:
  1. env var ``FIREBASE_CREDENTIALS_JSON`` (full JSON content as string) — used in production (Render, Vercel functions, etc.)
  2. env var ``FIREBASE_CREDENTIALS_PATH`` (file path, relative to backend dir) — used in local development
"""
import json
import os
from pathlib import Path

import firebase_admin
from firebase_admin import auth as fb_auth
from firebase_admin import credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ROOT_DIR = Path(__file__).parent


def _load_credentials() -> credentials.Certificate:
    raw_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")
    if raw_json:
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"FIREBASE_CREDENTIALS_JSON non è un JSON valido: {e}")
        return credentials.Certificate(data)

    cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH")
    if not cred_path:
        raise RuntimeError(
            "Configura FIREBASE_CREDENTIALS_JSON (consigliato in produzione) "
            "oppure FIREBASE_CREDENTIALS_PATH (per sviluppo locale)."
        )
    full_path = Path(cred_path)
    if not full_path.is_absolute():
        full_path = ROOT_DIR / full_path
    if not full_path.exists():
        raise RuntimeError(f"File credenziali Firebase non trovato: {full_path}")
    return credentials.Certificate(str(full_path))


# Singleton init (avoid duplicate-app errors in hot-reload)
if not firebase_admin._apps:
    firebase_admin.initialize_app(_load_credentials())

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """FastAPI dependency: verifies Firebase ID token and returns decoded claims."""
    token = credentials.credentials
    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token non valido: {e}",
        )
    return {
        "uid": decoded["uid"],
        "email": decoded.get("email"),
    }
