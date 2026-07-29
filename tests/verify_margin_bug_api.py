#!/usr/bin/env python3
"""Focused backend data verification for Agenda margin bug test data."""

from __future__ import annotations

import json
from pathlib import Path

import requests


FRONTEND_ENV = Path("/app/frontend/.env")
SEED_RESULT = Path("/app/test_reports/margin_seed_result.json")
OUT = Path("/app/test_reports/margin_api_verify_result.json")


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> None:
    env = read_env(FRONTEND_ENV)
    seed = json.loads(SEED_RESULT.read_text())
    api_key = env["REACT_APP_FIREBASE_API_KEY"]
    backend = env["REACT_APP_BACKEND_URL"].rstrip("/")

    signin_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
    auth_resp = requests.post(
        signin_url,
        json={"email": seed["email"], "password": seed["password"], "returnSecureToken": True},
        timeout=30,
    )
    auth_resp.raise_for_status()
    token = auth_resp.json()["idToken"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = requests.get(f"{backend}/api/clients", headers=headers, params={"date": seed["today"]}, timeout=30)
    resp.raise_for_status()
    clients = {c["id"]: c for c in resp.json()}

    expected = {
        seed["created_ids"][0]: {"status": "lavoro_eseguito", "amount": 130, "vat_rate": 22, "materials_total": 0},
        seed["created_ids"][1]: {"status": "lavoro_eseguito", "amount": 60, "vat_rate": 22, "materials_total": 0},
        seed["created_ids"][2]: {"status": "lavoro_eseguito", "amount": 1000, "vat_rate": None, "materials_total": 300},
        seed["created_ids"][3]: {"status": "preventivo", "amount": 200, "vat_rate": 22, "materials_total": 0},
    }

    assertions: list[str] = []
    for cid, exp in expected.items():
        assert cid in clients, f"Missing client {cid} from /api/clients?date"
        c = clients[cid]
        materials_total = sum(float(m.get("amount") or 0) for m in c.get("materials") or [])
        assert c["status"] == exp["status"], f"{cid} status mismatch"
        assert float(c["amount"]) == float(exp["amount"]), f"{cid} amount mismatch"
        assert c.get("vat_rate") == exp["vat_rate"], f"{cid} vat_rate mismatch"
        assert materials_total == float(exp["materials_total"]), f"{cid} materials total mismatch"
        assertions.append(f"{cid}: status={c['status']} amount={c['amount']} vat={c.get('vat_rate')} materials_total={materials_total}")

    result = {"verified": True, "date": seed["today"], "assertions": assertions}
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()