"""Health / whoami endpoints."""
from fastapi import APIRouter, Depends

from firebase_auth import get_current_user

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Agenda Italserrande API"}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user
