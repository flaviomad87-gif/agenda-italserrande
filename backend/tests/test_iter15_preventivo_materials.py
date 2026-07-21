"""Iteration 15 backend regression: fix for bug in `_compute_summary` where
materials of PREVENTIVO clients (status != lavoro_eseguito AND no payments)
were incorrectly summed into `total_materials`, penalising monthly balance.

Fix under test (server.py ~940-961): materials are counted ONLY if the client
is executed OR has at least one payment.
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

# Isolated months (different from iter14 to avoid overlap)
TEST_MONTH = "2028-06"
TEST_YEAR = 2028
MONTH_A = "2028-07"
MONTH_B = "2028-08"

ALL_MONTHS = [TEST_MONTH, MONTH_A, MONTH_B]


def _firebase_signup(email: str) -> str:
    r = requests.post(
        SIGNUP_URL,
        json={"email": email, "password": PASSWORD, "returnSecureToken": True},
        timeout=20,
    )
    if r.status_code != 200:
        msg = r.json().get("error", {}).get("message", "")
        if "EMAIL_EXISTS" in msg:
            r2 = requests.post(
                SIGNIN_URL,
                json={"email": email, "password": PASSWORD, "returnSecureToken": True},
                timeout=20,
            )
            assert r2.status_code == 200, r2.text
            return r2.json()["idToken"]
        raise AssertionError(f"signUp failed: {r.status_code} {r.text}")
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def token():
    email = f"testuser+iter15{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
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
            r = s.get(f"{API}/expenses?month={month}")
            if r.status_code == 200:
                for e in r.json():
                    if (e.get("category") or "").startswith("TEST_"):
                        s.delete(f"{API}/expenses/{e['id']}")
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


# -------------------- P1: PRIMARY BUG FIX --------------------
def test_p1_preventivo_materials_do_not_affect_balance(s):
    """Client A (eseguito, 1000, IVA 22, materiali 400) + Client B (preventivo, 500, materiali 300, NO payments).
    Expected: total_imponibile=1000, total_materials=400 (NOT 700), balance=1000-0-400=600."""
    # A: eseguito
    _create_client(
        s, amount=1000.0, vat_rate=22.0, status="lavoro_eseguito",
        payments=[{"amount": 1220.0, "method": "bonifico", "date": f"{TEST_MONTH}-15"}],
        materials=[{"description": "TEST_matA", "amount": 400.0, "source": "conto_aziendale"}],
    )
    # B: preventivo, NO payments, con materiali 300
    _create_client(
        s, amount=500.0, status="preventivo",
        materials=[{"description": "TEST_matB", "amount": 300.0, "source": "conto_aziendale"}],
    )

    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 1000.0) < 0.01, d["total_imponibile"]
    assert abs(d["total_materials"] - 400.0) < 0.01, (
        f"BUG: total_materials={d['total_materials']} (expected 400, preventivo materials 300 must be excluded)"
    )
    assert abs(d["total_quotes"] - 500.0) < 0.01, d["total_quotes"]
    assert abs(d["balance"] - 600.0) < 0.01, d["balance"]


# -------------------- P2: REGRESSION - executed materials still counted --------------------
def test_p2_executed_client_materials_still_counted(s):
    _create_client(
        s, amount=1000.0, vat_rate=0.0, status="lavoro_eseguito",
        payments=[{"amount": 1000.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
        materials=[{"description": "TEST_m", "amount": 250.0, "source": "conto_aziendale"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_materials"] - 250.0) < 0.01, d["total_materials"]
    assert abs(d["balance"] - 750.0) < 0.01, d["balance"]


# -------------------- P3: REGRESSION - pending client excluded --------------------
def test_p3_pending_client_still_excluded(s):
    _create_client(
        s, amount=5000.0, vat_rate=22.0, pending=True, status="lavoro_eseguito",
        payments=[{"amount": 6100.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
        materials=[{"description": "TEST_m", "amount": 999.0, "source": "conto_aziendale"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 0.0) < 0.01
    assert abs(d["total_materials"] - 0.0) < 0.01
    assert abs(d["balance"] - 0.0) < 0.01


# -------------------- P4: UI-BACKEND COHERENCE --------------------
def test_p4_ui_backend_coherence_5_mixed_clients(s):
    """5 clients: 3 executed IVA22, 1 contanti no-IVA, 1 preventivo w/ materials.
    Sum(imponibile_client - materials_client) over the counting clients ==
    total_imponibile - total_materials del summary."""
    # 3 executed IVA22
    executed = [
        (1098.0, 22.0, 1339.56, 520.0),  # user's Alessandra Ugolini case
        (2000.0, 22.0, 2440.0, 600.0),
        (500.0, 22.0, 610.0, 100.0),
    ]
    for amt, vat, gross, mat in executed:
        _create_client(
            s, amount=amt, vat_rate=vat, status="lavoro_eseguito",
            payments=[{"amount": gross, "method": "bonifico", "date": f"{TEST_MONTH}-10"}],
            materials=[{"description": "TEST_m", "amount": mat, "source": "conto_aziendale"}],
        )
    # 1 contanti no-IVA
    _create_client(
        s, amount=800.0, vat_rate=0.0, status="lavoro_eseguito",
        payments=[{"amount": 800.0, "method": "contanti", "date": f"{TEST_MONTH}-11"}],
        materials=[{"description": "TEST_m", "amount": 150.0, "source": "contanti"}],
    )
    # 1 preventivo (must NOT count materiali)
    _create_client(
        s, amount=300.0, status="preventivo",
        materials=[{"description": "TEST_m", "amount": 999.0, "source": "conto_aziendale"}],
    )

    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    expected_imp = 1098.0 + 2000.0 + 500.0 + 800.0
    expected_mat = 520.0 + 600.0 + 100.0 + 150.0  # NOT 999
    assert abs(d["total_imponibile"] - expected_imp) < 0.05, d["total_imponibile"]
    assert abs(d["total_materials"] - expected_mat) < 0.05, d["total_materials"]

    # UI margins per counting client (executed OR with payments)
    ui_sum = sum(amt - mat for amt, _, _, mat in executed) + (800.0 - 150.0)
    backend_margin = d["total_imponibile"] - d["total_materials"]
    assert abs(backend_margin - ui_sum) < 0.05, (backend_margin, ui_sum)


# -------------------- P5: PREVENTIVO -> ESEGUITO --------------------
def test_p5_preventivo_becomes_executed_materials_now_count(s):
    c = _create_client(
        s, amount=500.0, status="preventivo",
        materials=[{"description": "TEST_m", "amount": 300.0, "source": "conto_aziendale"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["balance"] - 0.0) < 0.01, f"preventivo w/ materials should not affect balance, got {d['balance']}"
    assert abs(d["total_materials"] - 0.0) < 0.01

    # Now upgrade: status=lavoro_eseguito + payment 500
    payload = {
        "date": c["date"],
        "name": c["name"],
        "amount": 500.0,
        "vat_rate": 0.0,
        "status": "lavoro_eseguito",
        "payments": [{"amount": 500.0, "method": "contanti", "date": c["date"]}],
        "materials": c["materials"],
    }
    r = s.put(f"{API}/clients/{c['id']}", json=payload)
    assert r.status_code == 200, r.text

    d2 = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d2["total_materials"] - 300.0) < 0.01, d2["total_materials"]
    assert abs(d2["total_imponibile"] - 500.0) < 0.01
    assert abs(d2["balance"] - 200.0) < 0.01, d2["balance"]


# -------------------- P6: PREVENTIVO with ACCONTO --------------------
def test_p6_preventivo_with_acconto_counts_materials(s):
    """Client status=preventivo BUT has a partial payment (acconto). Materials must count."""
    _create_client(
        s, amount=1000.0, vat_rate=0.0, status="preventivo",
        payments=[{"amount": 200.0, "method": "contanti", "date": f"{TEST_MONTH}-15", "type": "acconto"}],
        materials=[{"description": "TEST_m", "amount": 100.0, "source": "conto_aziendale"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_materials"] - 100.0) < 0.01, (
        f"preventivo w/ payments must count materials, got {d['total_materials']}"
    )
    # imponibile derives from the 200 acconto (no IVA) -> 200
    assert abs(d["total_imponibile"] - 200.0) < 0.05, d["total_imponibile"]


# -------------------- P7: YEARLY SUMMARY --------------------
def test_p7_yearly_summary_reflects_fix(s):
    # Month A: executed 1000 + materials 300 -> balance 700
    _create_client(
        s, month=MONTH_A, amount=1000.0, vat_rate=0.0, status="lavoro_eseguito",
        payments=[{"amount": 1000.0, "method": "contanti", "date": f"{MONTH_A}-10"}],
        materials=[{"description": "TEST_m", "amount": 300.0, "source": "conto_aziendale"}],
    )
    # Month B: only a preventivo with materials 500 -> balance 0 (materials excluded)
    _create_client(
        s, month=MONTH_B, amount=800.0, status="preventivo",
        materials=[{"description": "TEST_m", "amount": 500.0, "source": "conto_aziendale"}],
    )

    y = s.get(f"{API}/summary/year?year={TEST_YEAR}").json()
    a = next(m for m in y["months"] if m["month"] == MONTH_A)
    b = next(m for m in y["months"] if m["month"] == MONTH_B)
    assert abs(a["balance"] - 700.0) < 0.01, a
    assert abs(a["total_materials"] - 300.0) < 0.01
    assert abs(b["balance"] - 0.0) < 0.01, b
    assert abs(b["total_materials"] - 0.0) < 0.01, (
        f"BUG: yearly month B total_materials={b['total_materials']} (must exclude preventivo materials)"
    )
    # Total materials in yearly must exclude the 500 preventivo materials
    assert abs(y["totals"]["total_materials"] - 300.0) < 0.01, y["totals"]["total_materials"]


# -------------------- P8: MATERIALS_BY_SOURCE reflects fix --------------------
def test_p8_materials_by_source_excludes_preventivo(s):
    # executed with materials from both sources
    _create_client(
        s, amount=1000.0, vat_rate=0.0, status="lavoro_eseguito",
        payments=[{"amount": 1000.0, "method": "contanti", "date": f"{TEST_MONTH}-10"}],
        materials=[
            {"description": "TEST_a", "amount": 200.0, "source": "contanti"},
            {"description": "TEST_b", "amount": 300.0, "source": "conto_aziendale"},
        ],
    )
    # preventivo with materials in both sources - must NOT be counted anywhere
    _create_client(
        s, amount=500.0, status="preventivo",
        materials=[
            {"description": "TEST_c", "amount": 999.0, "source": "contanti"},
            {"description": "TEST_d", "amount": 888.0, "source": "conto_aziendale"},
        ],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["materials_by_source"]["contanti"] - 200.0) < 0.01, d["materials_by_source"]
    assert abs(d["materials_by_source"]["conto_aziendale"] - 300.0) < 0.01, d["materials_by_source"]
    assert abs(d["total_materials"] - 500.0) < 0.01


# -------------------- P9: BUG SCENARIO from user (Alessandra Ugolini) --------------------
def test_p9_user_scenario_alessandra_ugolini(s):
    """Riproduce lo scenario dell'utente: cliente 1098 IVA 22 materiali 520.
    Margine card = 1098 - 520 = 578. Se questo è l'unico cliente eseguito e
    non ci sono preventivi con materiali che gonfiano il total_materials,
    balance = 1098 - spese - 520."""
    _create_client(
        s, amount=1098.0, vat_rate=22.0, status="lavoro_eseguito",
        payments=[{"amount": 1339.56, "method": "bonifico", "date": f"{TEST_MONTH}-15"}],
        materials=[{"description": "TEST_matAle", "amount": 520.0, "source": "conto_aziendale"}],
    )
    # Aggiungiamo un preventivo con materiali che (con il bug) avrebbe inflazionato total_materials
    _create_client(
        s, amount=2000.0, status="preventivo",
        materials=[{"description": "TEST_matGhost", "amount": 3155.0, "source": "conto_aziendale"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 1098.0) < 0.05, d["total_imponibile"]
    assert abs(d["total_materials"] - 520.0) < 0.01, (
        f"BUG del bug report: total_materials={d['total_materials']} deve essere 520, non 3675"
    )
    # balance senza spese = 1098 - 520 = 578
    assert abs(d["balance"] - 578.0) < 0.05, d["balance"]
