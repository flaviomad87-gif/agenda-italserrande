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
from db import client  # noqa: F401 (usato da shutdown hook)
from routes.advances import router as advances_router
from routes.clients import router as clients_router
from routes.employees import router as employees_router
from routes.expenses import router as expenses_router
from routes.health import router as health_router
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
