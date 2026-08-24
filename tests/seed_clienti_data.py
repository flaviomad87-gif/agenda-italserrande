#!/usr/bin/env python3
"""Seed data for the new /clienti page (iteration 18)."""

from __future__ import annotations

import json
import time
from pathlib import Path

import requests

FRONTEND_ENV = Path("/app/frontend/.env")


def read_env(path: Path) -> dict:
    values = {}
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
    email = f"clienti-iter18-{ts}@italserrande.test"
    password = "TestPassword123!"

    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}",
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=30,
    )
    r.raise_for_status()
    token = r.json()["idToken"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    year = time.strftime("%Y")
    prev_year = str(int(year) - 1)

    cases = [
        # marzo: due lavori eseguiti (ordinamento crescente: 05 poi 15)
        {
            "id": f"TEST-clienti-mario-{ts}",
            "date": f"{year}-03-15",
            "name": "TEST_Mario Rossi",
            "address": "Via Roma 12, Roma",
            "phone": "3331112223",
            "notes": "Sostituzione molle serranda garage",
            "status": "lavoro_eseguito",
            "amount": 100,
            "vat_rate": 22,
            "pending": False,
        },
        {
            "id": f"TEST-clienti-anna-{ts}",
            "date": f"{year}-03-05",
            "name": "TEST_Anna Verdi",
            "address": "Via Milano 3, Roma",
            "phone": "3334445556",
            "notes": "Riparazione motore tapparella",
            "status": "lavoro_eseguito",
            "amount": 200,
            "vat_rate": 22,
            "pending": False,
        },
        # luglio: un lavoro eseguito senza telefono e senza note
        {
            "id": f"TEST-clienti-nophone-{ts}",
            "date": f"{year}-07-10",
            "name": "TEST_Cliente Senza Contatti",
            "status": "lavoro_eseguito",
            "amount": 50,
            "pending": False,
        },
        # preventivo: NON deve apparire
        {
            "id": f"TEST-clienti-preventivo-{ts}",
            "date": f"{year}-07-20",
            "name": "TEST_Preventivo Da Escludere",
            "phone": "3339998887",
            "notes": "Preventivo cancello",
            "status": "preventivo",
            "amount": 300,
            "vat_rate": 22,
            "pending": False,
        },
        # anno precedente: usato per il selettore anno
        {
            "id": f"TEST-clienti-prevyear-{ts}",
            "date": f"{prev_year}-05-10",
            "name": "TEST_Cliente Anno Passato",
            "phone": "3337776665",
            "notes": "Lavoro anno scorso",
            "status": "lavoro_eseguito",
            "amount": 80,
            "vat_rate": 22,
            "pending": False,
        },
    ]

    created = []
    for payload in cases:
        resp = requests.post(f"{backend}/api/clients", headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        created.append(resp.json())

    lst = requests.get(
        f"{backend}/api/clients",
        headers=headers,
        params={"from_date": f"{year}-01-01", "to_date": f"{year}-12-31"},
        timeout=30,
    )
    lst.raise_for_status()

    result = {
        "email": email,
        "password": password,
        "year": year,
        "prev_year": prev_year,
        "backend_url": backend,
        "created_ids": [c["id"] for c in created],
        "year_list_count": len(lst.json()),
        "year_list": [
            {"id": c["id"], "date": c["date"], "status": c["status"], "amount": c.get("amount"), "vat_rate": c.get("vat_rate")}
            for c in lst.json()
        ],
    }
    out = Path("/app/test_reports/clienti_seed_result.json")
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
