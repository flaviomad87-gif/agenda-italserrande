"""Gestione dall'agenda dell'assistente IA: collegamenti, bozze di preventivo, attività."""
from fastapi import APIRouter, Depends, HTTPException, Request

from ai_auth import base_url, now
from db import db
from firebase_auth import get_current_user
from routes.quotes import LineItem, QuoteIn, create_quote

router = APIRouter(prefix="/assistente")


@router.get("/stato")
async def stato(request: Request, user=Depends(get_current_user)):
    uid = user["uid"]
    conns = await db.ai_tokens.find(
        {"uid": uid, "revoked": False}, {"_id": 0, "id": 1, "client_name": 1, "created_at": 1, "last_used": 1, "refresh_exp": 1}
    ).sort("created_at", -1).to_list(50)
    conns = [c for c in conns if c.get("refresh_exp", "") > now().isoformat()]
    proposte = await db.ai_proposte.find({"uid": uid, "stato": "da_approvare"}, {"_id": 0, "uid": 0}).sort("created_at", -1).to_list(50)
    attivita = await db.ai_attivita.find({"uid": uid}, {"_id": 0, "uid": 0}).sort("at", -1).to_list(30)
    return {"mcp_url": f"{base_url(request)}/api/mcp", "collegamenti": conns, "proposte": proposte, "attivita": attivita}


@router.delete("/collegamenti/{conn_id}")
async def scollega(conn_id: str, user=Depends(get_current_user)):
    res = await db.ai_tokens.update_one({"id": conn_id, "uid": user["uid"]}, {"$set": {"revoked": True}})
    if not res.matched_count:
        raise HTTPException(404, "Collegamento non trovato")
    return {"ok": True}


@router.post("/proposte/{pid}/approva")
async def approva(pid: str, user=Depends(get_current_user)):
    p = await db.ai_proposte.find_one_and_update(
        {"id": pid, "uid": user["uid"], "stato": "da_approvare"}, {"$set": {"stato": "in_corso"}}
    )
    if not p:
        raise HTTPException(404, "Bozza non trovata o già gestita")
    q = await create_quote(QuoteIn(
        clientName=p["cliente"], clientAddress=p["indirizzo"], subject=p["oggetto"] or "OFFERTA", notes=p["note"],
        lineItems=[LineItem(description=r, amount=0) for r in p["righe"]] or [LineItem()], client_id=p.get("lavoro_id"),
    ), user)
    await db.ai_proposte.update_one({"id": pid}, {"$set": {"stato": "approvata", "quote_id": q["id"], "gestita_at": now().isoformat()}})
    return {"quote_id": q["id"], "number": q["number"]}


@router.delete("/proposte/{pid}")
async def scarta(pid: str, user=Depends(get_current_user)):
    res = await db.ai_proposte.update_one(
        {"id": pid, "uid": user["uid"], "stato": "da_approvare"}, {"$set": {"stato": "scartata", "gestita_at": now().isoformat()}}
    )
    if not res.matched_count:
        raise HTTPException(404, "Bozza non trovata o già gestita")
    return {"ok": True}
