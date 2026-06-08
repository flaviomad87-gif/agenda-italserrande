"""Agenda Italserrande - FastAPI backend.

All endpoints are scoped to the authenticated Firebase user (uid).
Domain entities:
  - Client (lavoro/preventivo per a given date)
  - Expense (spesa fissa)
  - Advance (acconto operaio)
"""
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Initialize firebase BEFORE importing dependency users
from firebase_auth import get_current_user  # noqa: E402

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Agenda Italserrande API")
api = APIRouter(prefix="/api")

# ---------- Models ----------

JobStatus = Literal["preventivo", "lavoro_eseguito"]
PaymentMethod = Literal["contanti", "pos", "bonifico", ""]
PaymentType = Literal["acconto", "saldo", "altro"]
ExpenseSource = Literal["contanti", "conto_aziendale"]


class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: PaymentType = "acconto"
    amount: float = 0.0
    date: str = ""  # YYYY-MM-DD (default: data del client)
    method: PaymentMethod = ""
    invoice_number: Optional[str] = ""
    notes: Optional[str] = ""


class Material(BaseModel):
    """Spesa di fornitura/materiale legata a uno specifico cliente.
    Permette di calcolare il margine reale del lavoro (ricavo netto - materiali)."""
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str = ""  # es. "Tubolare 40x40", "Motore tapparella"
    amount: float = 0.0
    supplier: Optional[str] = ""  # es. "Ferramenta Rossi"
    source: ExpenseSource = "conto_aziendale"
    date: str = ""  # YYYY-MM-DD (default: data del client)
    notes: Optional[str] = ""


class ClientBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str  # ISO date YYYY-MM-DD
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    notes: Optional[str] = ""
    status: JobStatus = "preventivo"
    payment_method: PaymentMethod = ""  # legacy (kept for backward compat)
    amount: float = 0.0  # imponibile concordato
    vat_rate: Optional[float] = None  # aliquota IVA in % (None = senza IVA)
    withholding_rate: Optional[float] = None  # ritenuta d'acconto in % sull'imponibile (None = nessuna)
    quote_number: Optional[str] = ""
    invoice_number: Optional[str] = ""  # legacy (kept for backward compat)
    payments: List[Payment] = Field(default_factory=list)
    materials: List[Material] = Field(default_factory=list)
    pending: bool = False  # True = nel backlog "Prossimi lavori", non ancora nell'Agenda
    awaiting_materials: bool = False  # True = "In attesa" (sotto-stato di pending: aspetta materiali)
    sort_order: int = 0  # ordinamento manuale nella pagina "In attesa"


class ClientCreate(ClientBase):
    id: Optional[str] = None  # opzionale: idempotency key dal client (offline queue)


class Client(ClientBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ExpenseBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str  # YYYY-MM-DD
    category: str
    amount: float = 0.0
    source: ExpenseSource = "contanti"
    notes: Optional[str] = ""
    recurring_id: Optional[str] = None  # set when materialized from a RecurringExpense template


class ExpenseCreate(ExpenseBase):
    id: Optional[str] = None  # idempotency key opzionale


class Expense(ExpenseBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RecurringExpenseBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    category: str
    amount: float = 0.0
    source: ExpenseSource = "contanti"
    notes: Optional[str] = ""


class RecurringExpenseCreate(RecurringExpenseBase):
    pass


class RecurringExpense(RecurringExpenseBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AdvanceBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str  # YYYY-MM-DD
    worker_name: str
    amount: float = 0.0
    notes: Optional[str] = ""


class AdvanceCreate(AdvanceBase):
    id: Optional[str] = None  # idempotency key opzionale


class Advance(AdvanceBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------- Helpers ----------

def _strip_id(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ---------- Health ----------

@api.get("/")
async def root():
    return {"message": "Agenda Italserrande API"}


@api.get("/me")
async def me(user=Depends(get_current_user)):
    return user


# ---------- Clients ----------

@api.post("/clients", response_model=Client)
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


@api.get("/clients", response_model=List[Client])
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


@api.get("/clients/pending", response_model=List[Client])
async def list_pending_clients(user=Depends(get_current_user)):
    """Clienti nel backlog 'Prossimi lavori', ordinati per sort_order (manuale) poi data prevista.
    Esclude quelli in stato 'In attesa materiali' (mostrati nella pagina dedicata)."""
    docs = await db.clients.find(
        {
            "user_id": user["uid"],
            "pending": True,
            "$or": [{"awaiting_materials": {"$exists": False}}, {"awaiting_materials": False}],
        },
        {"_id": 0},
    ).sort([("sort_order", 1), ("date", 1), ("created_at", 1)]).to_list(2000)
    return docs


@api.get("/clients/awaiting", response_model=List[Client])
async def list_awaiting_clients(user=Depends(get_current_user)):
    """Clienti 'in attesa materiali', ordinati per sort_order (manuale) e poi creazione."""
    docs = await db.clients.find(
        {"user_id": user["uid"], "pending": True, "awaiting_materials": True},
        {"_id": 0},
    ).sort([("sort_order", 1), ("created_at", 1)]).to_list(2000)
    return docs


class ReorderRequest(BaseModel):
    ids: List[str]


@api.put("/clients/awaiting/reorder")
async def reorder_awaiting_clients(req: ReorderRequest, user=Depends(get_current_user)):
    """Aggiorna l'ordinamento manuale dei lavori 'In attesa'.
    Riceve la lista di id nell'ordine desiderato e assegna sort_order=indice."""
    for idx, cid in enumerate(req.ids):
        await db.clients.update_one(
            {"id": cid, "user_id": user["uid"]},
            {"$set": {"sort_order": idx}},
        )
    return {"ok": True, "count": len(req.ids)}


@api.put("/clients/pending/reorder")
async def reorder_pending_clients(req: ReorderRequest, user=Depends(get_current_user)):
    """Aggiorna l'ordinamento manuale dei lavori 'Prossimi lavori'.
    Riceve la lista di id nell'ordine desiderato e assegna sort_order=indice."""
    for idx, cid in enumerate(req.ids):
        await db.clients.update_one(
            {"id": cid, "user_id": user["uid"]},
            {"$set": {"sort_order": idx}},
        )
    return {"ok": True, "count": len(req.ids)}


@api.post("/clients/{client_id}/execute")
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
        {"$set": {"pending": False, "awaiting_materials": False, "date": target_date}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Cliente non trovato o già in agenda")
    res.pop("_id", None)
    return res


@api.get("/clients/unpaid")
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


@api.get("/clients/search", response_model=List[Client])
async def search_clients(q: str, user=Depends(get_current_user)):
    """Cerca clienti per nome / indirizzo / telefono (case-insensitive)."""
    term = (q or "").strip()
    if len(term) < 2:
        return []
    import re
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


@api.put("/clients/{client_id}", response_model=Client)
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


@api.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(get_current_user)):
    res = await db.clients.delete_one({"id": client_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Cliente non trovato")
    return {"ok": True}


@api.delete("/clients/{client_id}/payments/{payment_id}")
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


# ---------- Expenses ----------

@api.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseCreate, user=Depends(get_current_user)):
    data = payload.model_dump()
    provided_id = data.pop("id", None)
    if provided_id:
        existing = await db.expenses.find_one({"id": provided_id, "user_id": user["uid"]}, {"_id": 0})
        if existing:
            return existing
    obj = Expense(**data, user_id=user["uid"])
    if provided_id:
        obj.id = provided_id
    await db.expenses.insert_one(obj.model_dump())
    return obj


@api.get("/expenses", response_model=List[Expense])
async def list_expenses(
    month: Optional[str] = None,
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["uid"]}
    if month:
        q["date"] = {"$regex": f"^{month}"}
    docs = await db.expenses.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return docs


@api.put("/expenses/{expense_id}", response_model=Expense)
async def update_expense(expense_id: str, payload: ExpenseCreate, user=Depends(get_current_user)):
    res = await db.expenses.find_one_and_update(
        {"id": expense_id, "user_id": user["uid"]},
        {"$set": payload.model_dump(exclude={"id"})},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Spesa non trovata")
    res.pop("_id", None)
    return res


@api.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user=Depends(get_current_user)):
    res = await db.expenses.delete_one({"id": expense_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Spesa non trovata")
    return {"ok": True}


# ---------- Recurring Expenses (templates) ----------

@api.get("/recurring-expenses", response_model=List[RecurringExpense])
async def list_recurring(user=Depends(get_current_user)):
    docs = await db.recurring_expenses.find(
        {"user_id": user["uid"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return docs


@api.post("/recurring-expenses", response_model=RecurringExpense)
async def create_recurring(payload: RecurringExpenseCreate, user=Depends(get_current_user)):
    obj = RecurringExpense(**payload.model_dump(), user_id=user["uid"])
    await db.recurring_expenses.insert_one(obj.model_dump())
    return obj


@api.put("/recurring-expenses/{rid}", response_model=RecurringExpense)
async def update_recurring(rid: str, payload: RecurringExpenseCreate, user=Depends(get_current_user)):
    res = await db.recurring_expenses.find_one_and_update(
        {"id": rid, "user_id": user["uid"]},
        {"$set": payload.model_dump()},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Spesa ricorrente non trovata")
    res.pop("_id", None)
    return res


@api.delete("/recurring-expenses/{rid}")
async def delete_recurring(rid: str, user=Depends(get_current_user)):
    res = await db.recurring_expenses.delete_one({"id": rid, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Spesa ricorrente non trovata")
    return {"ok": True}


@api.post("/recurring-expenses/apply")
async def apply_recurring(month: str, user=Depends(get_current_user)):
    """Materializza i template come Expense per il mese (idempotente).
    Per ogni recurring template, se non esiste già una Expense per
    {user_id, recurring_id, mese} la crea (data = primo del mese)."""
    uid = user["uid"]
    templates = await db.recurring_expenses.find({"user_id": uid}, {"_id": 0}).to_list(500)
    if not templates:
        return {"created": 0, "skipped": 0, "month": month}

    target_date = f"{month}-01"
    created = 0
    skipped = 0
    for t in templates:
        existing = await db.expenses.find_one({
            "user_id": uid,
            "recurring_id": t["id"],
            "date": {"$regex": f"^{month}"},
        })
        if existing:
            skipped += 1
            continue
        exp = Expense(
            date=target_date,
            category=t["category"],
            amount=float(t.get("amount") or 0),
            source=t.get("source", "contanti"),
            notes=t.get("notes", ""),
            recurring_id=t["id"],
            user_id=uid,
        )
        await db.expenses.insert_one(exp.model_dump())
        created += 1
    return {"created": created, "skipped": skipped, "month": month}


# ---------- Advances (acconti operai) ----------

@api.post("/advances", response_model=Advance)
async def create_advance(payload: AdvanceCreate, user=Depends(get_current_user)):
    data = payload.model_dump()
    provided_id = data.pop("id", None)
    if provided_id:
        existing = await db.advances.find_one({"id": provided_id, "user_id": user["uid"]}, {"_id": 0})
        if existing:
            return existing
    obj = Advance(**data, user_id=user["uid"])
    if provided_id:
        obj.id = provided_id
    await db.advances.insert_one(obj.model_dump())
    return obj


@api.get("/advances", response_model=List[Advance])
async def list_advances(
    date: Optional[str] = None,
    month: Optional[str] = None,
    worker: Optional[str] = None,
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["uid"]}
    if date:
        q["date"] = date
    elif month:
        q["date"] = {"$regex": f"^{month}"}
    if worker:
        q["worker_name"] = worker
    docs = await db.advances.find(q, {"_id": 0}).sort("date", 1).to_list(2000)
    return docs


@api.get("/advances/by-worker")
async def advances_by_worker(month: str, user=Depends(get_current_user)):
    """Aggregazione mensile degli acconti per operaio.
    Si 'resetta' naturalmente all'inizio di ogni nuovo mese perché filtra per mese."""
    pipeline = [
        {"$match": {"user_id": user["uid"], "date": {"$regex": f"^{month}"}}},
        {
            "$group": {
                "_id": "$worker_name",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1},
                "last_date": {"$max": "$date"},
            }
        },
        {"$sort": {"total": -1}},
    ]
    rows = await db.advances.aggregate(pipeline).to_list(500)
    return [
        {
            "worker_name": r["_id"],
            "total": float(r.get("total") or 0),
            "count": int(r.get("count") or 0),
            "last_date": r.get("last_date"),
        }
        for r in rows
    ]


@api.delete("/advances/{advance_id}")
async def delete_advance(advance_id: str, user=Depends(get_current_user)):
    res = await db.advances.delete_one({"id": advance_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Acconto non trovato")
    return {"ok": True}


# ---------- Monthly Summary ----------

async def _compute_summary(uid: str, month: str) -> dict:
    """Calcola i totali per un mese (YYYY-MM). Logica condivisa tra summary mensile e annuale.

    Per i pagamenti incassati scorpora IVA e ritenuta d'acconto in base al
    `vat_rate` e `withholding_rate` del cliente. Formula:
        divisor   = 1 + (vat - withholding) / 100
        imponibile = amount / divisor
        iva        = imponibile * vat / 100
        ritenuta   = imponibile * withholding / 100
    L'IVA incassata e la ritenuta NON contano nel "guadagno del mese": l'IVA va
    versata allo Stato, la ritenuta è acconto IRPEF già trattenuto.
    """
    regex = {"$regex": f"^{month}"}

    clients = await db.clients.find(
        {
            "user_id": uid,
            "date": regex,
            "$or": [{"pending": {"$exists": False}}, {"pending": False}],
        },
        {"_id": 0},
    ).to_list(5000)
    expenses = await db.expenses.find(
        {"user_id": uid, "date": regex}, {"_id": 0}
    ).to_list(5000)
    advances = await db.advances.find(
        {"user_id": uid, "date": regex}, {"_id": 0}
    ).to_list(5000)

    def _split(amount: float, vat: float, wh: float) -> tuple[float, float, float]:
        """Scorpora amount in (imponibile, iva, ritenuta)."""
        divisor = 1 + (vat - wh) / 100.0
        if divisor <= 0:
            divisor = 1.0
        imp = amount / divisor
        return imp, imp * vat / 100.0, imp * wh / 100.0

    incassi = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    incassi_net = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    incassi_iva = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    incassi_margine = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    total_executed = 0.0       # lordo (= imponibile + iva − ritenuta) — cash flow
    total_imponibile = 0.0     # ricavo netto IVA (vero ricavo)
    total_iva = 0.0            # IVA incassata, da versare
    total_ritenuta = 0.0       # ritenuta d'acconto trattenuta dal cliente
    total_quotes = 0.0
    for c in clients:
        amt = float(c.get("amount") or 0)
        vat = float(c.get("vat_rate") or 0) if c.get("vat_rate") is not None else 0
        wh = float(c.get("withholding_rate") or 0) if c.get("withholding_rate") is not None else 0
        materials_total_c = sum(float(m.get("amount") or 0) for m in (c.get("materials") or []))
        payments = c.get("payments") or []
        if payments:
            # Pre-calcola imponibile totale del cliente per distribuire i materiali pro-quota
            client_imp_total = 0.0
            for p in payments:
                p_amt = float(p.get("amount") or 0)
                imp_p, _, _ = _split(p_amt, vat, wh)
                client_imp_total += imp_p
            for p in payments:
                p_amt = float(p.get("amount") or 0)
                method = (p.get("method") or "").strip()
                imp, iva_p, rit_p = _split(p_amt, vat, wh)
                # Quota materiali attribuita a questo pagamento (pro-rata su imponibile)
                share = (imp / client_imp_total) if client_imp_total > 0 else 0
                materials_share = materials_total_c * share
                margine_p = imp - materials_share
                if method in incassi:
                    incassi[method] += p_amt
                    incassi_net[method] += imp
                    incassi_iva[method] += iva_p
                    incassi_margine[method] += margine_p
                total_executed += p_amt
                total_imponibile += imp
                total_iva += iva_p
                total_ritenuta += rit_p
        else:
            if c.get("status") == "lavoro_eseguito":
                # Legacy: nessun array payments → considera amt come imponibile
                gross = amt * (1 + (vat - wh) / 100.0)
                iva_l = amt * vat / 100.0
                total_executed += gross
                total_imponibile += amt
                total_iva += iva_l
                total_ritenuta += amt * wh / 100.0
                pm = c.get("payment_method") or ""
                if pm in incassi:
                    incassi[pm] += gross
                    incassi_net[pm] += amt
                    incassi_iva[pm] += iva_l
                    incassi_margine[pm] += amt - materials_total_c
            else:
                total_quotes += amt

    spese_by_source = {"contanti": 0.0, "conto_aziendale": 0.0}
    for e in expenses:
        spese_by_source[e.get("source", "contanti")] += float(e.get("amount") or 0)

    materials_by_source = {"contanti": 0.0, "conto_aziendale": 0.0}
    total_materials = 0.0
    for c in clients:
        for m in (c.get("materials") or []):
            m_amt = float(m.get("amount") or 0)
            src = m.get("source") or "conto_aziendale"
            if src not in materials_by_source:
                src = "conto_aziendale"
            materials_by_source[src] += m_amt
            total_materials += m_amt

    total_advances = sum(float(a.get("amount") or 0) for a in advances)
    total_incassi = sum(incassi.values())
    total_spese = sum(spese_by_source.values())

    # Guadagno reale = imponibile − spese − materiali − acconti
    balance = total_imponibile - total_spese - total_advances - total_materials

    return {
        "month": month,
        "incassi_by_method": incassi,
        "incassi_net_by_method": {k: round(v, 2) for k, v in incassi_net.items()},
        "incassi_iva_by_method": {k: round(v, 2) for k, v in incassi_iva.items()},
        "incassi_margine_by_method": {k: round(v, 2) for k, v in incassi_margine.items()},
        "total_incassi": round(total_incassi, 2),
        "total_quotes": round(total_quotes, 2),
        "total_executed": round(total_executed, 2),
        "total_imponibile": round(total_imponibile, 2),
        "total_iva": round(total_iva, 2),
        "total_ritenuta": round(total_ritenuta, 2),
        "spese_by_source": spese_by_source,
        "total_spese": round(total_spese, 2),
        "materials_by_source": materials_by_source,
        "total_materials": round(total_materials, 2),
        "total_advances": round(total_advances, 2),
        "balance": round(balance, 2),
        "counts": {
            "clients": len(clients),
            "expenses": len(expenses),
            "advances": len(advances),
        },
    }


@api.get("/summary")
async def monthly_summary(month: str, user=Depends(get_current_user)):
    """Aggregated totals for a month (YYYY-MM)."""
    return await _compute_summary(user["uid"], month)


@api.get("/payments/by-method")
async def payments_by_method(month: str, method: str, user=Depends(get_current_user)):
    """Restituisce il dettaglio dei singoli pagamenti per metodo (contanti/pos/bonifico)
    per un dato mese. Allinea con il calcolo del Riepilogo:
    filtra i clienti per JOB DATE nel mese, poi elenca i pagamenti con quel metodo.

    Per ogni pagamento espone:
      - amount (lordo, IVA inclusa, già al netto di eventuale ritenuta)
      - imponibile (netto IVA = "margine" mostrato in Riepilogo)
      - iva (IVA incassata, da versare)
      - job_date / payment_date
    """
    if method not in ("contanti", "pos", "bonifico"):
        raise HTTPException(400, "Metodo non valido")
    regex = {"$regex": f"^{month}"}
    clients = await db.clients.find(
        {
            "user_id": user["uid"],
            "date": regex,
            "$or": [{"pending": {"$exists": False}}, {"pending": False}],
        },
        {"_id": 0},
    ).to_list(5000)

    def _split(amount: float, vat: float, wh: float) -> tuple[float, float, float]:
        divisor = 1 + (vat - wh) / 100.0
        if divisor <= 0:
            divisor = 1.0
        imp = amount / divisor
        return imp, imp * vat / 100.0, imp * wh / 100.0

    items = []
    for c in clients:
        job_date = c.get("date") or ""
        vat = float(c.get("vat_rate") or 0) if c.get("vat_rate") is not None else 0
        wh = float(c.get("withholding_rate") or 0) if c.get("withholding_rate") is not None else 0
        materials_total_c = sum(float(m.get("amount") or 0) for m in (c.get("materials") or []))
        payments = c.get("payments") or []
        if payments:
            # Pre-calcola imponibile totale cliente per distribuire materiali pro-quota
            client_imp_total = 0.0
            for p in payments:
                p_amt = float(p.get("amount") or 0)
                imp_p, _, _ = _split(p_amt, vat, wh)
                client_imp_total += imp_p
            for p in payments:
                p_method = (p.get("method") or "").strip()
                if p_method != method:
                    continue
                amt = float(p.get("amount") or 0)
                imp, iva, _ = _split(amt, vat, wh)
                share = (imp / client_imp_total) if client_imp_total > 0 else 0
                mat_share = materials_total_c * share
                margin = imp - mat_share
                items.append({
                    "client_id": c.get("id"),
                    "client_name": c.get("name") or "",
                    "client_address": c.get("address") or "",
                    "job_date": job_date,
                    "payment_id": p.get("id"),
                    "payment_date": p.get("date") or job_date,
                    "payment_type": p.get("type") or "altro",
                    "amount": round(amt, 2),
                    "imponibile": round(imp, 2),
                    "iva": round(iva, 2),
                    "materials_share": round(mat_share, 2),
                    "margin": round(margin, 2),
                    "vat_rate": vat,
                    "invoice_number": p.get("invoice_number") or "",
                    "notes": p.get("notes") or "",
                    "legacy": False,
                })
        else:
            if c.get("status") == "lavoro_eseguito" and (c.get("payment_method") or "") == method:
                amt = float(c.get("amount") or 0)
                if amt > 0:
                    gross = amt * (1 + (vat - wh) / 100.0)
                    items.append({
                        "client_id": c.get("id"),
                        "client_name": c.get("name") or "",
                        "client_address": c.get("address") or "",
                        "job_date": job_date,
                        "payment_id": None,
                        "payment_date": job_date,
                        "payment_type": "saldo",
                        "amount": round(gross, 2),
                        "imponibile": round(amt, 2),
                        "iva": round(amt * vat / 100.0, 2),
                        "materials_share": round(materials_total_c, 2),
                        "margin": round(amt - materials_total_c, 2),
                        "vat_rate": vat,
                        "invoice_number": c.get("invoice_number") or "",
                        "notes": "",
                        "legacy": True,
                    })

    items.sort(key=lambda x: (x["payment_date"] or x["job_date"], x["client_name"]))
    total_gross = round(sum(it["amount"] for it in items), 2)
    total_imponibile = round(sum(it["imponibile"] for it in items), 2)
    total_iva = round(sum(it["iva"] for it in items), 2)
    total_margin = round(sum(it["margin"] for it in items), 2)
    total_materials = round(sum(it["materials_share"] for it in items), 2)
    return {
        "month": month,
        "method": method,
        "total": total_gross,                   # retro-compat
        "total_gross": total_gross,
        "total_imponibile": total_imponibile,
        "total_iva": total_iva,
        "total_margin": total_margin,
        "total_materials": total_materials,
        "count": len(items),
        "items": items,
    }


@api.get("/summary/year")
async def yearly_summary(year: int, user=Depends(get_current_user)):
    """Riepilogo annuale: 12 mesi (gen-dic) con guadagni/perdite + totali annuali."""
    uid = user["uid"]
    months_data = []
    for m in range(1, 13):
        key = f"{year:04d}-{m:02d}"
        s = await _compute_summary(uid, key)
        months_data.append(s)

    totals = {
        "total_incassi": round(sum(x["total_incassi"] for x in months_data), 2),
        "total_imponibile": round(sum(x["total_imponibile"] for x in months_data), 2),
        "total_iva": round(sum(x["total_iva"] for x in months_data), 2),
        "total_ritenuta": round(sum(x["total_ritenuta"] for x in months_data), 2),
        "total_executed": round(sum(x["total_executed"] for x in months_data), 2),
        "total_quotes": round(sum(x["total_quotes"] for x in months_data), 2),
        "total_spese": round(sum(x["total_spese"] for x in months_data), 2),
        "total_materials": round(sum(x["total_materials"] for x in months_data), 2),
        "total_advances": round(sum(x["total_advances"] for x in months_data), 2),
        "balance": round(sum(x["balance"] for x in months_data), 2),
    }

    # Trova il miglior e il peggior mese (per balance) tra quelli con almeno un'attività
    active = [m for m in months_data if m["counts"]["clients"] > 0 or m["counts"]["expenses"] > 0 or m["counts"]["advances"] > 0]
    best_month = max(active, key=lambda m: m["balance"])["month"] if active else None
    worst_month = min(active, key=lambda m: m["balance"])["month"] if active else None

    return {
        "year": year,
        "months": months_data,
        "totals": totals,
        "best_month": best_month,
        "worst_month": worst_month,
    }


# ---------- Mount + middleware ----------

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
