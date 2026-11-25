"""Health / whoami endpoints."""
from fastapi import APIRouter, Depends

from firebase_auth import get_current_user
from routes.contratti import trigger_daily

router = APIRouter()


@router.get("/")
async def root():
    # Il ping keep-alive avvia anche i promemoria giornalieri delle manutenzioni
    trigger_daily()
    return {"message": "Agenda Italserrande API"}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user
