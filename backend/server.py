"""Agenda Italserrande - FastAPI backend.

Entry-point dell'applicazione. Compone i router modulari:
  - routes.health      → /, /me
  - routes.clients     → CRUD clienti/lavori, backlog, reorder, incassi
  - routes.expenses    → spese + ricorrenti
  - routes.advances    → acconti operai
  - routes.summary     → riepiloghi mensili/annuali, fornitori, pagamenti-metodo
  - routes.employees   → dipendenti + time tracking (banca ore)

Domain entities (definiti in `models.py`):
  - Client (lavoro/preventivo per una data)
  - Expense (spesa fissa)
  - Advance (acconto operaio)
  - Employee / TimeEntry (banca ore)

All endpoints are scoped to the authenticated Firebase user (uid).
"""
import logging
import os

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

# NB: db.py carica load_dotenv() al primo import.
from db import client, db  # noqa: F401 (usato da shutdown hook e indici)
from routes.advances import router as advances_router
from routes.clients import router as clients_router
from routes.employees import router as employees_router
from routes.expenses import router as expenses_router
from routes.health import router as health_router
from routes.materials import router as materials_router
from routes.rilievi import router as rilievi_router
from routes.documenti import router as documenti_router
from routes.contratti import router as contratti_router
from routes.photos import router as photos_router
from routes.quotes import router as quotes_router
from routes.summary import router as summary_router

# Re-export per retro-compatibilità con i test che fanno `from server import _compute_summary`.
from summary_service import _compute_summary  # noqa: F401


app = FastAPI(title="Agenda Italserrande API")
api = APIRouter(prefix="/api")

# ---------- Include sub-routers ----------

api.include_router(health_router)
api.include_router(clients_router)
api.include_router(expenses_router)
api.include_router(advances_router)
api.include_router(summary_router)
api.include_router(employees_router)
api.include_router(materials_router)
api.include_router(rilievi_router)
api.include_router(documenti_router)
api.include_router(contratti_router)
api.include_router(photos_router)
api.include_router(quotes_router)

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


# Indici Mongo: senza, ogni lista scorreva l'intera collezione (lento con tanti dati su Atlas)
INDEXES = {
    "clients": [[("user_id", 1), ("id", 1)], [("user_id", 1), ("date", 1)], [("user_id", 1), ("pending", 1)], [("user_id", 1), ("quote_ref", 1)]],
    "quotes": [[("user_id", 1), ("id", 1)], [("user_id", 1), ("source_id", 1)]],
    "job_photos": [[("user_id", 1), ("client_id", 1)], [("user_id", 1), ("id", 1)]],
    "employees": [[("user_id", 1), ("id", 1)]],
    "time_entries": [[("user_id", 1), ("date", 1)], [("user_id", 1), ("id", 1)]],
    "expenses": [[("user_id", 1), ("date", 1)], [("user_id", 1), ("id", 1)]],
    "advances": [[("user_id", 1), ("id", 1)]],
    "recurring_expenses": [[("user_id", 1), ("id", 1)]],
    "materials": [[("user_id", 1), ("id", 1)]],
    "rilievi_sezionali": [[("user_id", 1), ("id", 1)], [("user_id", 1), ("client_id", 1)]],
    "quote_settings": [[("user_id", 1)]],
    "contratti": [[("user_id", 1), ("id", 1)], [("stato", 1)]],
    "documenti": [[("user_id", 1), ("id", 1)], [("user_id", 1), ("kind", 1), ("anno", 1), ("numero", -1)]],
}


@app.on_event("startup")
async def ensure_indexes():
    for coll, keys in INDEXES.items():
        for k in keys:
            try:
                await db[coll].create_index(k, background=True)
            except Exception as e:
                logger.warning("Indice %s %s non creato: %s", coll, k, e)
    try:
        await db.documenti_counters.create_index([("user_id", 1), ("kind", 1), ("anno", 1)], unique=True)
    except Exception as e:
        logger.warning("Indice documenti_counters non creato: %s", e)
