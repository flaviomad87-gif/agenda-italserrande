"""Endpoint dipendenti (employees) e time tracking (banca ore)."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from firebase_auth import get_current_user
from models import (
    DEFAULT_EMPLOYEES,
    Employee,
    EmployeeCreate,
    EmployeeUpdate,
    TimeEntry,
    TimeEntryCreate,
    TimeEntryUpdate,
)

router = APIRouter()


async def _seed_employees_if_empty(user_id: str) -> None:
    """Crea i dipendenti di default (Alfonso, Bruno) la prima volta."""
    count = await db.employees.count_documents({"user_id": user_id})
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    docs = []
    for e in DEFAULT_EMPLOYEES:
        emp = Employee(user_id=user_id, name=e["name"], sort_order=e["sort_order"])
        d = emp.model_dump()
        d["created_at"] = now
        docs.append(d)
    if docs:
        await db.employees.insert_many(docs)


@router.get("/employees", response_model=List[Employee])
async def list_employees(user=Depends(get_current_user)):
    await _seed_employees_if_empty(user["uid"])
    docs = await db.employees.find(
        {"user_id": user["uid"]}, {"_id": 0},
    ).sort([("sort_order", 1), ("created_at", 1)]).to_list(100)
    return docs


@router.post("/employees", response_model=Employee)
async def create_employee(payload: EmployeeCreate, user=Depends(get_current_user)):
    # Prossimo sort_order
    last = await db.employees.find({"user_id": user["uid"]}).sort("sort_order", -1).limit(1).to_list(1)
    next_sort = (last[0].get("sort_order", 0) + 1) if last else 0
    emp = Employee(
        user_id=user["uid"],
        name=payload.name.strip(),
        daily_hours=payload.daily_hours,
        default_break_minutes=payload.default_break_minutes,
        sort_order=next_sort,
    )
    d = emp.model_dump()
    await db.employees.insert_one(d)
    d.pop("_id", None)
    return d


@router.put("/employees/{employee_id}", response_model=Employee)
async def update_employee(employee_id: str, payload: EmployeeUpdate, user=Depends(get_current_user)):
    existing = await db.employees.find_one({"id": employee_id, "user_id": user["uid"]}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Employee not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if updates:
        await db.employees.update_one({"id": employee_id, "user_id": user["uid"]}, {"$set": updates})
        existing.update(updates)
    return existing


@router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: str, user=Depends(get_current_user)):
    res = await db.employees.delete_one({"id": employee_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Employee not found")
    # Non cancello le time_entries storiche: restano per report ma marcate come dipendente rimosso
    return {"deleted": True}


@router.get("/time-entries", response_model=List[TimeEntry])
async def list_time_entries(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    date: Optional[str] = None,
    employee_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    q: dict = {"user_id": user["uid"]}
    if date:
        q["date"] = date
    elif from_date and to_date:
        q["date"] = {"$gte": from_date, "$lte": to_date}
    if employee_id:
        q["employee_id"] = employee_id
    docs = await db.time_entries.find(q, {"_id": 0}).sort([("date", 1), ("clock_in", 1)]).to_list(2000)
    return docs


@router.post("/time-entries", response_model=TimeEntry)
async def create_time_entry(payload: TimeEntryCreate, user=Depends(get_current_user)):
    emp = await db.employees.find_one({"id": payload.employee_id, "user_id": user["uid"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    entry = TimeEntry(
        user_id=user["uid"],
        employee_id=payload.employee_id,
        date=payload.date,
        clock_in=payload.clock_in,
        clock_out=payload.clock_out,
        break_minutes=payload.break_minutes if payload.break_minutes is not None else emp.get("default_break_minutes", 60),
        notes=payload.notes or "",
    )
    d = entry.model_dump()
    await db.time_entries.insert_one(d)
    d.pop("_id", None)
    return d


@router.put("/time-entries/{entry_id}", response_model=TimeEntry)
async def update_time_entry(entry_id: str, payload: TimeEntryUpdate, user=Depends(get_current_user)):
    existing = await db.time_entries.find_one({"id": entry_id, "user_id": user["uid"]}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Time entry not found")
    # Mantieni i null espliciti (per permettere di svuotare clock_in / clock_out / notes)
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.time_entries.update_one({"id": entry_id, "user_id": user["uid"]}, {"$set": updates})
        existing.update(updates)
    return existing


@router.delete("/time-entries/{entry_id}")
async def delete_time_entry(entry_id: str, user=Depends(get_current_user)):
    res = await db.time_entries.delete_one({"id": entry_id, "user_id": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Time entry not found")
    return {"deleted": True}
