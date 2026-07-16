"""Firebase Admin SDK initialization and FastAPI dependency for token verification.

**Nota architetturale**: verifichiamo i JWT Firebase con PyJWT direttamente,
scaricando i certificati pubblici con ``requests``. Questo evita il bug
osservato su Render free tier dove ``firebase_admin.verify_id_token``
fallisce con *"Could not fetch certificates"* per problemi di rete
persistenti nella libreria interna. Cache 6h in memoria dei certificati.
"""
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Dict

import jwt as pyjwt
import requests
import firebase_admin
from firebase_admin import credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ROOT_DIR = Path(__file__).parent
log = logging.getLogger(__name__)

_FIREBASE_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)
# Firebase Auth: issuer + audience validi per un progetto.
# Auto-detect dal file di credenziali o env var (fallback).
_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "")
_ISSUER = None

# Cache in-memory dei certificati (kid → PEM). Refresh se >6h.
_certs_cache: Dict[str, str] = {}
_certs_last_fetch: float = 0.0
_certs_lock = threading.Lock()


def _load_credentials() -> credentials.Certificate:
    global _PROJECT_ID, _ISSUER
    raw_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")
    if raw_json:
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"FIREBASE_CREDENTIALS_JSON non è un JSON valido: {e}")
        if not _PROJECT_ID:
            _PROJECT_ID = data.get("project_id", "")
        _ISSUER = f"https://securetoken.google.com/{_PROJECT_ID}" if _PROJECT_ID else None
        return credentials.Certificate(data)

    cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH")
    if not cred_path:
        raise RuntimeError(
            "Configura FIREBASE_CREDENTIALS_JSON (produzione) oppure "
            "FIREBASE_CREDENTIALS_PATH (sviluppo)."
        )
    full_path = Path(cred_path)
    if not full_path.is_absolute():
        full_path = ROOT_DIR / full_path
    if not full_path.exists():
        raise RuntimeError(f"File credenziali Firebase non trovato: {full_path}")
    # Auto-detect project_id from file
    try:
        with open(full_path) as f:
            file_data = json.load(f)
        if not _PROJECT_ID:
            _PROJECT_ID = file_data.get("project_id", "")
        _ISSUER = f"https://securetoken.google.com/{_PROJECT_ID}" if _PROJECT_ID else None
    except Exception:
        pass
    return credentials.Certificate(str(full_path))


def _fetch_certs(force: bool = False) -> Dict[str, str]:
    """Scarica (o restituisce dalla cache) i certificati x509 di Firebase.
    Cache 6h. Thread-safe. Solleva se anche 3 tentativi falliscono."""
    global _certs_cache, _certs_last_fetch
    now = time.time()
    with _certs_lock:
        if not force and _certs_cache and (now - _certs_last_fetch) < 21600:
            return _certs_cache
    last_err = None
    for attempt in range(3):
        try:
            resp = requests.get(_FIREBASE_CERTS_URL, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict) or not data:
                raise RuntimeError("Risposta certificati vuota")
            with _certs_lock:
                _certs_cache = data
                _certs_last_fetch = now
            log.info("Firebase certs fetched: %d keys", len(data))
            return data
        except Exception as e:  # pragma: no cover
            last_err = e
            log.warning("Fetch certs attempt %d failed: %s", attempt + 1, e)
            time.sleep(1.0 * (attempt + 1))
    # Se avevamo una cache anche vecchia, meglio usarla che fallire
    if _certs_cache:
        log.warning("Using stale cache: %s", last_err)
        return _certs_cache
    raise RuntimeError(f"Impossibile scaricare certificati Firebase: {last_err}")


def _verify_id_token_manual(token: str) -> dict:
    """Verifica JWT Firebase con PyJWT + certificati cachati.
    Solleva ``jwt.InvalidTokenError`` se il token è invalido."""
    header = pyjwt.get_unverified_header(token)
    kid = header.get("kid")
    if not kid:
        raise pyjwt.InvalidTokenError("Token senza kid header")
    certs = _fetch_certs()
    pem = certs.get(kid)
    if not pem:
        # kid non trovato → refresh forzato (rotazione chiavi Google)
        certs = _fetch_certs(force=True)
        pem = certs.get(kid)
        if not pem:
            raise pyjwt.InvalidTokenError(f"Chiave pubblica '{kid}' non trovata")
    if not _PROJECT_ID:
        raise RuntimeError("FIREBASE_PROJECT_ID non configurato")
    decoded = pyjwt.decode(
        token,
        pem,
        algorithms=["RS256"],
        audience=_PROJECT_ID,
        issuer=_ISSUER,
        options={"require": ["exp", "iat", "sub"]},
    )
    if not decoded.get("sub"):
        raise pyjwt.InvalidTokenError("Token senza subject")
    return {"uid": decoded["sub"], "email": decoded.get("email")}


# Singleton init (per emettere token custom / altre operazioni admin)
if not firebase_admin._apps:
    firebase_admin.initialize_app(_load_credentials())
    # Pre-warm certificati in background (non blocca l'avvio)
    try:
        _fetch_certs()
    except Exception as e:
        log.warning("Prewarm certs failed at startup: %s", e)

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """Verifica il JWT Firebase e restituisce {uid, email}.

    Usa PyJWT + certificati cachati (non firebase_admin.verify_id_token)
    per evitare bug di rete su Render free tier.
    """
    token = credentials.credentials
    try:
        return _verify_id_token_manual(token)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token scaduto. Effettua di nuovo il login.",
        )
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token non valido: {e}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Servizio auth temporaneamente non disponibile. ({e})",
        )
