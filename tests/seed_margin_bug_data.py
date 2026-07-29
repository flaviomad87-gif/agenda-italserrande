#!/usr/bin/env python3
"""Seed focused Agenda margin bug-verification data via Firebase Auth + backend API."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import requests


FRONTEND_ENV = Path("/app/frontend/.env")


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip().strip('"').strip("'")
    return values


def main() -> None:
    env = read_env(FRONTEND_ENV)
    api_key = env["REACT_APP_FIREBASE_API_KEY"]
    backend = env["REACT_APP_BACKEND_URL"].rstrip("/")

    ts = int(time.time())
    email = f"margin-bug-{ts}@example.com"
    password = "MarginBugTest!2026"
    today = time.strftime("%Y-%m-%d")

    signup_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}"
    r = requests.post(
        signup_url,
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=30,
    )
    r.raise_for_status()
    auth_data = r.json()
    token = auth_data["idToken"]

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    cases = [
        {
            "id": f"qa-margin-fabrizio-{ts}",
            "date": today,
            "name": f"QA Fabrizio margine {ts}",
            "address": "Via QA 1",
            "phone": "+393330000001",
            "status": "lavoro_eseguito",
            "amount": 130,
            "vat_rate": 22,
            "payments": [
                {"type": "saldo", "amount": 158.6, "date": today, "method": "pos", "notes": "QA saldo lordo"}
            ],
            "materials": [],
            "pending": False,
        },
        {
            "id": f"qa-margin-farmacia-{ts}",
            "date": today,
            "name": f"QA Farmacia vigna clara {ts}",
            "address": "Via QA 2",
            "phone": "+393330000002",
            "status": "lavoro_eseguito",
            "amount": 60,
            "vat_rate": 22,
            "payments": [
                {"type": "saldo", "amount": 73.2, "date": today, "method": "contanti", "notes": "QA saldo lordo"}
            ],
            "materials": [],
            "pending": False,
        },
        {
            "id": f"qa-margin-materials-{ts}",
            "date": today,
            "name": f"QA Lavoro con materiali {ts}",
            "address": "Via QA 3",
            "phone": "+393330000003",
            "status": "lavoro_eseguito",
            "amount": 1000,
            "vat_rate": None,
            "payments": [
                {"type": "saldo", "amount": 1000, "date": today, "method": "bonifico", "notes": "QA saldo"}
            ],
            "materials": [
                {"description": "Materiali QA", "amount": 300, "supplier": "QA Supplier", "date": today}
            ],
            "pending": False,
        },
        {
            "id": f"qa-margin-preventivo-{ts}",
            "date": today,
            "name": f"QA Preventivo senza margine {ts}",
            "address": "Via QA 4",
            "phone": "+393330000004",
            "status": "preventivo",
            "amount": 200,
            "vat_rate": 22,
            "payments": [],
            "materials": [],
            "pending": False,
        },
    ]

    created = []
    for payload in cases:
        resp = requests.post(f"{backend}/api/clients", headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        created.append(resp.json())

    list_resp = requests.get(f"{backend}/api/clients", headers=headers, params={"date": today}, timeout=30)
    list_resp.raise_for_status()

    result = {
        "email": email,
        "password": password,
        "today": today,
        "backend_url": backend,
        "created_ids": [c["id"] for c in created],
        "created_names": [c["name"] for c in created],
        "api_list_count_for_today": len(list_resp.json()),
    }
    out = Path("/app/test_reports/margin_seed_result.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()