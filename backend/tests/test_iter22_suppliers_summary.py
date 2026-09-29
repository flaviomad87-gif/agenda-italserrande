"""Iteration 22 backend: /api/suppliers/summary endpoint.

Aggregates materials of month's clients by supplier for end-of-month payment.
Covers: auth gate, empty state, aggregation, source split, defaults, whitespace,
'Senza fornitore' bucket, sorting, pending exclusion, month filtering.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
FIREBASE_API_KEY = os.environ.get("REACT_APP_FIREBASE_API_KEY", "")
SIGNUP_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
SIGNIN_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
PASSWORD = "TestPassword123!"

TEST_MONTH = "2027-03"
OTHER_MONTH = "2027-04"
ALL_MONTHS = [TEST_MONTH, OTHER_MONTH]


def _firebase_signup(email: str) -> str:
    r = requests.post(SIGNUP_URL, json={"email": email, "password": PASSWORD, "returnSecureToken": True}, timeout=20)
    if r.status_code != 200:
        msg = r.json().get("error", {}).get("message", "")
        if "EMAIL_EXISTS" in msg:
            r2 = requests.post(SIGNIN_URL, json={"email": email, "password": PASSWORD, "returnSecureToken": True}, timeout=20)
            assert r2.status_code == 200, r2.text
            return r2.json()["idToken"]
        raise AssertionError(f"signUp failed: {r.status_code} {r.text}")
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def token():
    email = f"testuser+iter22{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    return _firebase_signup(email)


@pytest.fixture
def s(token):
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return sess


def _create_client(s, month=TEST_MONTH, **overrides):
    payload = {
        "date": f"{month}-15",
        "name": "TEST_" + uuid.uuid4().hex[:8],
        "amount": 1000.0,
        "status": "preventivo",
    }
    payload.update(overrides)
    r = s.post(f"{API}/clients", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _sweep(s):
    for month in ALL_MONTHS:
        try:
            r = s.get(f"{API}/clients?month={month}")
            if r.status_code == 200:
                for c in r.json():
                    if (c.get("name") or "").startswith("TEST_"):
                        s.delete(f"{API}/clients/{c['id']}")
        except Exception:
            pass
    for path in ("/clients/pending", "/clients/awaiting", "/clients/to-quote"):
        try:
            r = s.get(f"{API}{path}")
            if r.status_code == 200:
                for c in r.json():
                    if (c.get("name") or "").startswith("TEST_"):
                        s.delete(f"{API}/clients/{c['id']}")
        except Exception:
            pass


@pytest.fixture(autouse=True)
def cleanup(s):
    _sweep(s)
    yield
    _sweep(s)


# ---------- Auth gate ----------
def test_auth_required_no_token():
    r = requests.get(f"{API}/suppliers/summary?month={TEST_MONTH}")
    assert r.status_code in (401, 403), r.status_code


def test_auth_required_bad_token():
    r = requests.get(
        f"{API}/suppliers/summary?month={TEST_MONTH}",
        headers={"Authorization": "Bearer invalidtoken"},
    )
    assert r.status_code in (401, 403), r.status_code


# ---------- Empty ----------
def test_empty_month_returns_zeros(s):
    r = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["month"] == TEST_MONTH
    assert d["total"] == 0
    assert d["total_contanti"] == 0
    assert d["total_conto_aziendale"] == 0
    assert d["items_count"] == 0
    assert d["suppliers"] == []


# ---------- Core scenario (from problem statement) ----------
def test_core_aggregation_scenario(s):
    _create_client(
        s,
        materials=[
            {"description": "Molle", "supplier": "Ferramenta Rossi", "amount": 50.0, "source": "contanti"},
            {"description": "Vernice", "supplier": "Ferramenta Rossi", "amount": 30.0, "source": "conto_aziendale"},
            {"description": "Bulloni", "supplier": "", "amount": 10.0, "source": "conto_aziendale"},
        ],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert d["month"] == TEST_MONTH
    assert abs(d["total"] - 90.0) < 0.01, d
    assert abs(d["total_contanti"] - 50.0) < 0.01, d
    assert abs(d["total_conto_aziendale"] - 40.0) < 0.01, d
    assert d["items_count"] == 3
    assert len(d["suppliers"]) == 2

    # First: Ferramenta Rossi (largest, not 'Senza fornitore')
    fr = d["suppliers"][0]
    assert fr["name"] == "Ferramenta Rossi"
    assert abs(fr["total"] - 80.0) < 0.01
    assert abs(fr["total_contanti"] - 50.0) < 0.01
    assert abs(fr["total_conto_aziendale"] - 30.0) < 0.01
    assert fr["items_count"] == 2
    descs = sorted([it["description"] for it in fr["items"]])
    assert descs == ["Molle", "Vernice"]
    # item fields present
    for it in fr["items"]:
        assert "client_id" in it and "client_name" in it and "client_date" in it
        assert "amount" in it and "source" in it

    # Last: 'Senza fornitore' regardless of total
    ns = d["suppliers"][1]
    assert ns["name"] == "Senza fornitore"
    assert abs(ns["total"] - 10.0) < 0.01
    assert ns["items_count"] == 1


# ---------- Senza fornitore sorted last even when bigger ----------
def test_no_supplier_always_last(s):
    _create_client(
        s,
        materials=[
            {"description": "big", "supplier": "", "amount": 999.0, "source": "conto_aziendale"},
            {"description": "small", "supplier": "Alfa", "amount": 5.0, "source": "conto_aziendale"},
        ],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert [x["name"] for x in d["suppliers"]] == ["Alfa", "Senza fornitore"]


# ---------- Zero/missing amounts skipped ----------
def test_zero_and_missing_amounts_skipped(s):
    _create_client(
        s,
        materials=[
            {"description": "zero", "supplier": "Alfa", "amount": 0, "source": "contanti"},
            {"description": "none", "supplier": "Alfa", "source": "contanti"},  # missing amount
            {"description": "ok", "supplier": "Alfa", "amount": 20.0, "source": "contanti"},
        ],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert d["items_count"] == 1, d
    assert abs(d["total"] - 20.0) < 0.01


# ---------- Invalid source defaults to conto_aziendale ----------
def test_invalid_source_defaults_to_conto(s):
    _create_client(
        s,
        materials=[
            {"description": "x", "supplier": "Alfa", "amount": 100.0, "source": "weird_value"},
            {"description": "y", "supplier": "Alfa", "amount": 50.0},  # missing source
        ],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert abs(d["total_conto_aziendale"] - 150.0) < 0.01, d
    assert abs(d["total_contanti"] - 0.0) < 0.01


# ---------- Supplier name trimming ----------
def test_supplier_trimming(s):
    _create_client(
        s,
        materials=[
            {"description": "a", "supplier": "  Ferramenta Rossi  ", "amount": 10.0, "source": "contanti"},
            {"description": "b", "supplier": "Ferramenta Rossi", "amount": 20.0, "source": "contanti"},
        ],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert len(d["suppliers"]) == 1
    assert d["suppliers"][0]["name"] == "Ferramenta Rossi"
    assert abs(d["suppliers"][0]["total"] - 30.0) < 0.01


def test_only_whitespace_supplier_treated_as_no_supplier(s):
    _create_client(
        s,
        materials=[{"description": "x", "supplier": "   ", "amount": 15.0, "source": "contanti"}],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert d["suppliers"][0]["name"] == "Senza fornitore"


# ---------- Pending (backlog) excluded ----------
def test_pending_client_excluded(s):
    _create_client(
        s,
        pending=True,
        materials=[{"description": "x", "supplier": "Alfa", "amount": 100.0, "source": "contanti"}],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert d["total"] == 0
    assert d["suppliers"] == []


# ---------- Month filter isolates data ----------
def test_month_filter(s):
    _create_client(
        s, month=TEST_MONTH,
        materials=[{"description": "in-month", "supplier": "Alfa", "amount": 10.0, "source": "contanti"}],
    )
    _create_client(
        s, month=OTHER_MONTH,
        materials=[{"description": "other-month", "supplier": "Alfa", "amount": 500.0, "source": "contanti"}],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert abs(d["total"] - 10.0) < 0.01, d


# ---------- Includes preventivi (quotes) since materials are already acquired ----------
def test_includes_preventivo(s):
    _create_client(
        s, status="preventivo",
        materials=[{"description": "x", "supplier": "Alfa", "amount": 40.0, "source": "conto_aziendale"}],
    )
    d = s.get(f"{API}/suppliers/summary?month={TEST_MONTH}").json()
    assert abs(d["total"] - 40.0) < 0.01
