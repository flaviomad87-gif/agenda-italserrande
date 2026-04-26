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


class ClientCreate(ClientBase):
    pass


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
    pass


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
    pass


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
    obj = Client(**payload.model_dump(), user_id=user["uid"])
    await db.clients.insert_one(obj.model_dump())
    return obj


@api.get("/clients", response_model=List[Client])
async def list_clients(
    date: Optional[str] = None,
    month: Optional[str] = None,  # YYYY-MM
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["uid"]}
    if date:
        q["date"] = date
    elif month:
        q["date"] = {"$regex": f"^{month}"}
    docs = await db.clients.find(q, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return docs


@api.get("/clients/unpaid")
async def list_unpaid_clients(user=Depends(get_current_user)):
    """Clienti con saldo aperto da incassare, ordinati dal più vecchio.

    Inclusi:
      - Lavoro eseguito con saldo > 0 (anche senza pagamenti registrati)
      - Preventivo che ha già ricevuto almeno un acconto (saldo parziale aperto)
    Esclusi:
      - Preventivi senza alcun pagamento (non sono ancora "da incassare")
      - Lavori legacy considerati saldati (payment_method o invoice_number presenti)
    """
    clients = await db.clients.find(
        {"user_id": user["uid"], "amount": {"$gt": 0}}, {"_id": 0}
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
        {"$set": payload.model_dump()},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Cliente non trovato")
    return res


@api.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(get_current_user)):
    res = await db.clients.delete_one({"id": client_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Cliente non trovato")
    return {"ok": True}


# ---------- Expenses ----------

@api.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseCreate, user=Depends(get_current_user)):
    obj = Expense(**payload.model_dump(), user_id=user["uid"])
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
        {"$set": payload.model_dump()},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Spesa non trovata")
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
    obj = Advance(**payload.model_dump(), user_id=user["uid"])
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

@api.get("/summary")
async def monthly_summary(month: str, user=Depends(get_current_user)):
    """Aggregated totals for a month (YYYY-MM)."""
    uid = user["uid"]
    regex = {"$regex": f"^{month}"}

    clients = await db.clients.find(
        {"user_id": uid, "date": regex}, {"_id": 0}
    ).to_list(5000)
    expenses = await db.expenses.find(
        {"user_id": uid, "date": regex}, {"_id": 0}
    ).to_list(5000)
    advances = await db.advances.find(
        {"user_id": uid, "date": regex}, {"_id": 0}
    ).to_list(5000)

    incassi = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    total_executed = 0.0
    total_quotes = 0.0
    for c in clients:
        amt = float(c.get("amount") or 0)
        payments = c.get("payments") or []
        if payments:
            # Nuovo modello: somma i pagamenti per metodo (sempre conteggiati)
            for p in payments:
                p_amt = float(p.get("amount") or 0)
                method = (p.get("method") or "").strip()
                if method in incassi:
                    incassi[method] += p_amt
                total_executed += p_amt
        else:
            # Legacy: usa amount + payment_method se status = lavoro_eseguito
            if c.get("status") == "lavoro_eseguito":
                total_executed += amt
                pm = c.get("payment_method") or ""
                if pm in incassi:
                    incassi[pm] += amt
            else:
                total_quotes += amt

    spese_by_source = {"contanti": 0.0, "conto_aziendale": 0.0}
    for e in expenses:
        spese_by_source[e.get("source", "contanti")] += float(e.get("amount") or 0)

    # Materiali / spese di fornitura legati ai clienti del mese
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

    return {
        "month": month,
        "incassi_by_method": incassi,
        "total_incassi": total_incassi,
        "total_quotes": total_quotes,
        "total_executed": total_executed,
        "spese_by_source": spese_by_source,
        "total_spese": total_spese,
        "materials_by_source": materials_by_source,
        "total_materials": round(total_materials, 2),
        "total_advances": total_advances,
        "balance": total_incassi - total_spese - total_advances - total_materials,
        "counts": {
            "clients": len(clients),
            "expenses": len(expenses),
            "advances": len(advances),
        },
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
