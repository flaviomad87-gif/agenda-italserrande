"""Endpoint clienti (lavori/preventivi): CRUD + backlog + saldi + ricerca."""
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from firebase_auth import get_current_user
from models import Client, ClientCreate, ReorderRequest

router = APIRouter()


@router.post("/clients", response_model=Client)
async def create_client(payload: ClientCreate, user=Depends(get_current_user)):
    data = payload.model_dump()
    provided_id = data.pop("id", None)
    # Idempotency: se il client ha già fornito l'id (offline queue) e l'oggetto esiste, ritorna quello.
    if provided_id:
        existing = await db.clients.find_one({"id": provided_id, "user_id": user["uid"]}, {"_id": 0})
        if existing:
            return existing
    obj = Client(**data, user_id=user["uid"])
    if provided_id:
        obj.id = provided_id
    await db.clients.insert_one(obj.model_dump())
    return obj


@router.get("/clients", response_model=List[Client])
async def list_clients(
    date: Optional[str] = None,
    month: Optional[str] = None,  # YYYY-MM
    from_date: Optional[str] = None,  # YYYY-MM-DD inclusivo
    to_date: Optional[str] = None,    # YYYY-MM-DD inclusivo
    user=Depends(get_current_user),
):
    # I clienti "pending" (in Prossimi lavori) sono esclusi dall'Agenda giornaliera/mensile.
    q: dict = {"user_id": user["uid"], "$or": [{"pending": {"$exists": False}}, {"pending": False}]}
    if date:
        q["date"] = date
    elif from_date and to_date:
        q["date"] = {"$gte": from_date, "$lte": to_date}
    elif month:
        q["date"] = {"$regex": f"^{month}"}
    docs = await db.clients.find(q, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return docs


@router.get("/clients/pending", response_model=List[Client])
async def list_pending_clients(user=Depends(get_current_user)):
    """Clienti nel backlog 'Prossimi lavori', ordinati per sort_order (manuale) poi data prevista.
    Esclude quelli in stato 'In attesa materiali' o 'Da preventivare' (mostrati nelle pagine dedicate)."""
    docs = await db.clients.find(
        {
            "user_id": user["uid"],
            "pending": True,
            "$or": [{"awaiting_materials": {"$exists": False}}, {"awaiting_materials": False}],
            "$and": [
                {"$or": [{"to_quote": {"$exists": False}}, {"to_quote": False}]},
            ],
        },
        {"_id": 0},
    ).sort([("sort_order", 1), ("date", 1), ("created_at", 1)]).to_list(2000)
    return docs


@router.get("/clients/awaiting", response_model=List[Client])
async def list_awaiting_clients(user=Depends(get_current_user)):
    """Clienti 'in attesa materiali', ordinati per sort_order (manuale) e poi creazione."""
    docs = await db.clients.find(
        {"user_id": user["uid"], "pending": True, "awaiting_materials": True},
        {"_id": 0},
    ).sort([("sort_order", 1), ("created_at", 1)]).to_list(2000)
    return docs


@router.get("/clients/to-quote", response_model=List[Client])
async def list_to_quote_clients(user=Depends(get_current_user)):
    """Clienti 'da preventivare', ordinati per sort_order (manuale) e poi creazione."""
    docs = await db.clients.find(
        {"user_id": user["uid"], "pending": True, "to_quote": True},
        {"_id": 0},
    ).sort([("sort_order", 1), ("created_at", 1)]).to_list(2000)
    return docs


@router.get("/clients/to-invoice", response_model=List[Client])
async def list_to_invoice_clients(user=Depends(get_current_user)):
    """Clienti 'da fatturare' (spunta manuale dall'utente)."""
    docs = await db.clients.find(
        {"user_id": user["uid"], "to_invoice": True},
        {"_id": 0},
    ).sort([("sort_order", 1), ("date", -1), ("created_at", -1)]).to_list(2000)
    return docs


@router.put("/clients/awaiting/reorder")
async def reorder_awaiting_clients(req: ReorderRequest, user=Depends(get_current_user)):
    """Aggiorna l'ordinamento manuale dei lavori 'In attesa'."""
    for idx, cid in enumerate(req.ids):
        await db.clients.update_one(
            {"id": cid, "user_id": user["uid"]},
            {"$set": {"sort_order": idx}},
        )
    return {"ok": True, "count": len(req.ids)}


@router.put("/clients/pending/reorder")
async def reorder_pending_clients(req: ReorderRequest, user=Depends(get_current_user)):
    """Aggiorna l'ordinamento manuale dei lavori 'Prossimi lavori'."""
    for idx, cid in enumerate(req.ids):
        await db.clients.update_one(
            {"id": cid, "user_id": user["uid"]},
            {"$set": {"sort_order": idx}},
        )
    return {"ok": True, "count": len(req.ids)}


@router.put("/clients/to-quote/reorder")
async def reorder_to_quote_clients(req: ReorderRequest, user=Depends(get_current_user)):
    """Aggiorna l'ordinamento manuale dei lavori 'Da preventivare'."""
    for idx, cid in enumerate(req.ids):
        await db.clients.update_one(
            {"id": cid, "user_id": user["uid"]},
            {"$set": {"sort_order": idx}},
        )
    return {"ok": True, "count": len(req.ids)}


@router.put("/clients/to-invoice/reorder")
async def reorder_to_invoice_clients(req: ReorderRequest, user=Depends(get_current_user)):
    """Aggiorna l'ordinamento manuale dei lavori 'Da fatturare'."""
    for idx, cid in enumerate(req.ids):
        await db.clients.update_one(
            {"id": cid, "user_id": user["uid"]},
            {"$set": {"sort_order": idx}},
        )
    return {"ok": True, "count": len(req.ids)}


@router.post("/clients/{client_id}/execute")
async def execute_pending_client(
    client_id: str,
    date: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Sposta un cliente dal backlog 'Prossimi lavori' all'Agenda del giorno indicato.
    Se date non è specificata, usa oggi (UTC). Conserva tutta la scheda compilata.
    Pulisce anche il flag 'in attesa materiali' (il lavoro è ora schedulato)."""
    target_date = date or datetime.now(timezone.utc).date().isoformat()
    res = await db.clients.find_one_and_update(
        {"id": client_id, "user_id": user["uid"], "pending": True},
        {"$set": {"pending": False, "awaiting_materials": False, "to_quote": False, "date": target_date}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Cliente non trovato o già in agenda")
    res.pop("_id", None)
    return res


@router.get("/clients/unpaid")
async def list_unpaid_clients(user=Depends(get_current_user)):
    """Clienti con saldo aperto da incassare, ordinati dal più vecchio.

    Inclusi:
      - Lavoro eseguito con saldo > 0 (anche senza pagamenti registrati)
      - Preventivo che ha già ricevuto almeno un acconto (saldo parziale aperto)
    Esclusi:
      - Preventivi senza alcun pagamento (non sono ancora "da incassare")
      - Lavori legacy considerati saldati (payment_method o invoice_number presenti)
      - Clienti pending (nel backlog "Prossimi lavori")
    """
    clients = await db.clients.find(
        {
            "user_id": user["uid"],
            "amount": {"$gt": 0},
            "$or": [{"pending": {"$exists": False}}, {"pending": False}],
        },
        {"_id": 0},
    ).sort("date", 1).to_list(5000)

    result = []
    for c in clients:
        amt = float(c.get("amount") or 0)
        vat_rate = float(c.get("vat_rate") or 0) if c.get("vat_rate") is not None else 0
        wh_rate = float(c.get("withholding_rate") or 0) if c.get("withholding_rate") is not None else 0
        gross = amt * (1 + vat_rate / 100.0)
        withholding = amt * (wh_rate / 100.0)
        to_collect = gross - withholding

        payments = c.get("payments") or []
        status = c.get("status")

        if payments:
            paid = sum(float(p.get("amount") or 0) for p in payments)
        elif status == "lavoro_eseguito" and (c.get("payment_method") or c.get("invoice_number")):
            # Legacy: lavoro eseguito con metodo/fattura → considerato saldato
            paid = to_collect
        elif status == "lavoro_eseguito":
            # Lavoro eseguito senza pagamenti registrati → tutto da incassare
            paid = 0.0
        else:
            # Preventivo senza pagamenti → non ancora "da incassare"
            continue

        balance = to_collect - paid
        if balance > 0.01:
            materials = c.get("materials") or []
            materials_total = sum(float(m.get("amount") or 0) for m in materials)
            # Margine atteso = imponibile (netto fattura, senza IVA che è pass-through) - materiali
            expected_margin = amt - materials_total
            result.append({
                **c,
                "to_collect": round(to_collect, 2),
                "paid": round(paid, 2),
                "balance": round(balance, 2),
                "materials_total": round(materials_total, 2),
                "expected_margin": round(expected_margin, 2),
            })
    return result


@router.get("/clients/search", response_model=List[Client])
async def search_clients(q: str, user=Depends(get_current_user)):
    """Cerca clienti per nome / indirizzo / telefono (case-insensitive)."""
    term = (q or "").strip()
    if len(term) < 2:
        return []
    safe = re.escape(term)
    docs = (
        await db.clients.find(
            {
                "user_id": user["uid"],
                "$or": [
                    {"name": {"$regex": safe, "$options": "i"}},
                    {"address": {"$regex": safe, "$options": "i"}},
                    {"phone": {"$regex": safe, "$options": "i"}},
                ],
            },
            {"_id": 0},
        )
        .sort("date", -1)
        .to_list(50)
    )
    return docs


@router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, payload: ClientCreate, user=Depends(get_current_user)):
    res = await db.clients.find_one_and_update(
        {"id": client_id, "user_id": user["uid"]},
        {"$set": payload.model_dump(exclude={"id"})},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Cliente non trovato")
    res.pop("_id", None)
    return res


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(get_current_user)):
    res = await db.clients.delete_one({"id": client_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Cliente non trovato")
    return {"ok": True}


@router.delete("/clients/{client_id}/payments/{payment_id}")
async def delete_payment(client_id: str, payment_id: str, user=Depends(get_current_user)):
    """Elimina un singolo pagamento dal cliente (utile per rimuovere duplicati
    individuati nel dettaglio incassi)."""
    client = await db.clients.find_one(
        {"id": client_id, "user_id": user["uid"]}, {"_id": 0}
    )
    if not client:
        raise HTTPException(404, "Cliente non trovato")
    payments = client.get("payments") or []
    new_payments = [p for p in payments if (p.get("id") or "") != payment_id]
    if len(new_payments) == len(payments):
        raise HTTPException(404, "Pagamento non trovato")
    await db.clients.update_one(
        {"id": client_id, "user_id": user["uid"]},
        {"$set": {"payments": new_payments, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "remaining": len(new_payments)}
