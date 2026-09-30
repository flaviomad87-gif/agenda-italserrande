"""Endpoint spese (una tantum) e spese ricorrenti (template)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from firebase_auth import get_current_user
from models import (
    Expense,
    ExpenseCreate,
    RecurringExpense,
    RecurringExpenseCreate,
)

router = APIRouter()


# ---------- Expenses ----------

@router.post("/expenses", response_model=Expense)
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


@router.get("/expenses", response_model=List[Expense])
async def list_expenses(
    month: Optional[str] = None,
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["uid"]}
    if month:
        q["date"] = {"$regex": f"^{month}"}
    docs = await db.expenses.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return docs


@router.put("/expenses/{expense_id}", response_model=Expense)
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


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user=Depends(get_current_user)):
    res = await db.expenses.delete_one({"id": expense_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Spesa non trovata")
    return {"ok": True}


# ---------- Recurring Expenses (templates) ----------

@router.get("/recurring-expenses", response_model=List[RecurringExpense])
async def list_recurring(user=Depends(get_current_user)):
    docs = await db.recurring_expenses.find(
        {"user_id": user["uid"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return docs


@router.post("/recurring-expenses", response_model=RecurringExpense)
async def create_recurring(payload: RecurringExpenseCreate, user=Depends(get_current_user)):
    obj = RecurringExpense(**payload.model_dump(), user_id=user["uid"])
    await db.recurring_expenses.insert_one(obj.model_dump())
    return obj


@router.put("/recurring-expenses/{rid}", response_model=RecurringExpense)
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


@router.delete("/recurring-expenses/{rid}")
async def delete_recurring(rid: str, user=Depends(get_current_user)):
    res = await db.recurring_expenses.delete_one({"id": rid, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Spesa ricorrente non trovata")
    return {"ok": True}


@router.post("/recurring-expenses/apply")
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
