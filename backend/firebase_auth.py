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
    """FastAPI dependency: verifies Firebase ID token and returns decoded claims.

    Retry con backoff sui fallimenti di rete verso googleapis.com (comune
    dopo cold start di Render: la prima chiamata per scaricare i certificati
    JWT può fallire per timeout/DNS)."""
    token = credentials.credentials
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            decoded = fb_auth.verify_id_token(token)
            return {"uid": decoded["uid"], "email": decoded.get("email")}
        except fb_auth.InvalidIdTokenError as e:
            # Token davvero non valido / scaduto → non ritentare
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token non valido: {e}",
            )
        except Exception as e:
            # Errori di rete / cache certificati / cold start → retry
            last_err = e
            msg = str(e).lower()
            transient = (
                "could not fetch" in msg
                or "certificate" in msg
                or "timeout" in msg
                or "connection" in msg
                or "temporarily" in msg
                or "network" in msg
                or "read timed out" in msg
            )
            if not transient or attempt == 2:
                break
            import asyncio as _asyncio
            await _asyncio.sleep(0.5 * (attempt + 1))
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Servizio auth temporaneamente non disponibile. Riprova tra qualche secondo. ({last_err})",
    )
