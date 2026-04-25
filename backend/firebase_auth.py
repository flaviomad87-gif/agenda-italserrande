"""Firebase Admin SDK initialization and FastAPI dependency for token verification."""
import os
from pathlib import Path

import firebase_admin
from firebase_admin import auth as fb_auth
from firebase_admin import credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ROOT_DIR = Path(__file__).parent
_cred_path = ROOT_DIR / os.environ['FIREBASE_CREDENTIALS_PATH']

# Singleton init (avoid duplicate-app errors in hot-reload)
if not firebase_admin._apps:
    cred = credentials.Certificate(str(_cred_path))
    firebase_admin.initialize_app(cred)

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
