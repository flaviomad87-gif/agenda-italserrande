"""Pydantic models e type aliases condivisi tra i router.

Nessuna dipendenza da db o firebase: importabile senza side-effect.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ---------- Type aliases ----------

JobStatus = Literal["preventivo", "lavoro_eseguito"]
PaymentMethod = Literal["contanti", "pos", "bonifico", ""]
PaymentType = Literal["acconto", "saldo", "altro"]
ExpenseSource = Literal["contanti", "conto_aziendale"]


# ---------- Payment / Material ----------

class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: PaymentType = "acconto"
    amount: float = 0.0
    date: str = ""  # YYYY-MM-DD (default: data del client)
    method: PaymentMethod = ""
    invoice_number: Optional[str] = ""
    notes: Optional[str] = ""

    @model_validator(mode="before")
    @classmethod
    def _clean_nones(cls, data):
        """None → default: str→'', float→0.0, per evitare errori Pydantic sui doc legacy."""
        if not isinstance(data, dict):
            return data
        for key in ("date", "invoice_number", "notes", "method", "type"):
            if data.get(key) is None:
                data[key] = ""
        for key in ("amount",):
            v = data.get(key)
            if v is None or v == "":
                data[key] = 0.0
            elif isinstance(v, str):
                try:
                    data[key] = float(v.replace(",", "."))
                except (ValueError, TypeError):
                    data[key] = 0.0
        return data

    @field_validator("type", mode="before")
    @classmethod
    def _coerce_type(cls, v):
        if v not in ("acconto", "saldo", "altro"):
            return "altro"
        return v

    @field_validator("method", mode="before")
    @classmethod
    def _coerce_method(cls, v):
        if v in (None, ""):
            return ""
        if v not in ("contanti", "pos", "bonifico"):
            if isinstance(v, str) and v.strip().lower() in ("carta", "carte", "bancomat"):
                return "pos"
            if isinstance(v, str) and v.strip().lower() in ("bonif", "banca"):
                return "bonifico"
            if isinstance(v, str) and v.strip().lower() in ("cash", "contante"):
                return "contanti"
            return ""
        return v


class Material(BaseModel):
    """Spesa di fornitura/materiale legata a uno specifico cliente."""
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str = ""
    amount: float = 0.0
    supplier: Optional[str] = ""
    source: ExpenseSource = "conto_aziendale"
    date: str = ""
    notes: Optional[str] = ""

    @model_validator(mode="before")
    @classmethod
    def _clean_nones(cls, data):
        if not isinstance(data, dict):
            return data
        for key in ("description", "supplier", "date", "notes", "source"):
            if data.get(key) is None:
                data[key] = ""
        v = data.get("amount")
        if v is None or v == "":
            data["amount"] = 0.0
        elif isinstance(v, str):
            try:
                data["amount"] = float(v.replace(",", "."))
            except (ValueError, TypeError):
                data["amount"] = 0.0
        return data

    @field_validator("source", mode="before")
    @classmethod
    def _coerce_source(cls, v):
        if v not in ("contanti", "conto_aziendale"):
            return "conto_aziendale"
        return v


# ---------- Client ----------

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
    to_quote: bool = False  # True = "Da preventivare" (sotto-stato di pending: da preparare preventivo)
    to_invoice: bool = False  # True = "Da fatturare" (per lavori eseguiti che serve fatturare)
    sort_order: int = 0  # ordinamento manuale nelle pagine backlog
    appointment_at: Optional[str] = None  # ISO datetime YYYY-MM-DDTHH:MM (appuntamento con cliente)
    appointment_note: Optional[str] = ""  # nota libera es. "pomeriggio dopo pranzo"
    estimated_materials_cost: float = 0.0  # solo per preventivi: stima costo materiali (NON conteggiato nel riepilogo)

    @model_validator(mode="before")
    @classmethod
    def _clean_client_nones(cls, data):
        """Pulisce valori legacy None/vuoti dai documenti Mongo pre-esistenti."""
        if not isinstance(data, dict):
            return data
        # String fields: None → ""
        for key in ("name", "address", "phone", "notes", "quote_number",
                    "invoice_number", "payment_method", "status",
                    "appointment_note"):
            if data.get(key) is None:
                data[key] = ""
        # Numeric fields with default 0.0
        for key in ("amount", "estimated_materials_cost"):
            v = data.get(key)
            if v is None or v == "":
                data[key] = 0.0
            elif isinstance(v, str):
                try:
                    data[key] = float(v.replace(",", "."))
                except (ValueError, TypeError):
                    data[key] = 0.0
        # Optional numeric fields (aliquote): keep None or convert
        for key in ("vat_rate", "withholding_rate"):
            v = data.get(key)
            if v == "":
                data[key] = None
            elif isinstance(v, str):
                try:
                    data[key] = float(v.replace(",", "."))
                except (ValueError, TypeError):
                    data[key] = None
        # Bool fields
        for key in ("pending", "awaiting_materials", "to_quote", "to_invoice"):
            if data.get(key) is None:
                data[key] = False
        # sort_order
        v = data.get("sort_order")
        if v is None or v == "":
            data["sort_order"] = 0
        elif isinstance(v, str):
            try:
                data["sort_order"] = int(v)
            except (ValueError, TypeError):
                data["sort_order"] = 0
        return data

    @field_validator("status", mode="before")
    @classmethod
    def _coerce_status(cls, v):
        if v not in ("preventivo", "lavoro_eseguito"):
            return "preventivo"
        return v

    @field_validator("payment_method", mode="before")
    @classmethod
    def _coerce_pm(cls, v):
        if v in (None,):
            return ""
        if v not in ("contanti", "pos", "bonifico", ""):
            if isinstance(v, str) and v.strip().lower() in ("carta", "carte", "bancomat"):
                return "pos"
            if isinstance(v, str) and v.strip().lower() in ("bonif", "banca"):
                return "bonifico"
            if isinstance(v, str) and v.strip().lower() in ("cash", "contante"):
                return "contanti"
            return ""
        return v

    @field_validator("amount", "estimated_materials_cost", mode="before")
    @classmethod
    def _coerce_float(cls, v):
        """Accetta stringa vuota o None: torna 0.0. Accetta stringhe con virgola."""
        if v is None or v == "":
            return 0.0
        if isinstance(v, str):
            try:
                return float(v.replace(",", "."))
            except (ValueError, TypeError):
                return 0.0
        return v

    @field_validator("vat_rate", "withholding_rate", mode="before")
    @classmethod
    def _coerce_optional_float(cls, v):
        """Aliquote: None/vuoto → None; stringhe con virgola → float."""
        if v is None or v == "":
            return None
        if isinstance(v, str):
            try:
                return float(v.replace(",", "."))
            except (ValueError, TypeError):
                return None
        return v

    @field_validator("sort_order", mode="before")
    @classmethod
    def _coerce_sort(cls, v):
        if v is None or v == "":
            return 0
        try:
            return int(v)
        except (ValueError, TypeError):
            return 0



class ClientCreate(ClientBase):
    id: Optional[str] = None  # opzionale: idempotency key dal client (offline queue)


class Client(ClientBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------- Expense / RecurringExpense ----------

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


# ---------- Advance (acconto operaio) ----------

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


# ---------- Reorder request (usato da più endpoint clients) ----------

class ReorderRequest(BaseModel):
    ids: List[str]


# ---------- Employee / TimeEntry ----------

class Employee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    name: str
    daily_hours: float = 8.0  # ore base giornaliere (contratto)
    default_break_minutes: int = 60  # pausa pranzo di default
    default_clock_in: str = "08:00"   # HH:MM orario contrattuale di ingresso
    default_clock_out: str = "17:00"  # HH:MM orario contrattuale di uscita
    sort_order: int = 0
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EmployeeCreate(BaseModel):
    name: str
    daily_hours: float = 8.0
    default_break_minutes: int = 60
    default_clock_in: str = "08:00"
    default_clock_out: str = "17:00"


class EmployeeUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    daily_hours: Optional[float] = None
    default_break_minutes: Optional[int] = None
    default_clock_in: Optional[str] = None
    default_clock_out: Optional[str] = None
    sort_order: Optional[int] = None
    active: Optional[bool] = None


class TimeEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    employee_id: str
    date: str  # YYYY-MM-DD
    clock_in: Optional[str] = None   # ISO datetime string
    clock_out: Optional[str] = None
    break_minutes: int = 60
    notes: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TimeEntryCreate(BaseModel):
    employee_id: str
    date: str
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    break_minutes: Optional[int] = None
    notes: Optional[str] = ""


class TimeEntryUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    break_minutes: Optional[int] = None
    notes: Optional[str] = None
    date: Optional[str] = None


DEFAULT_EMPLOYEES = [
    {"name": "Alfonso Pomponio", "sort_order": 0},
    {"name": "Bruno Pucci", "sort_order": 1},
]
