"""Iteration 14 backend regression: systematic verification of all calc formulas
(user reported 'check calculations' without specifying which one). We cover the
11 cases listed in the review request in an isolated month (2027-05).
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

TEST_MONTH = "2027-05"
TEST_YEAR = 2027
# Distinct months for tests that need multiple months (test 6/9)
MONTH_A = "2027-06"
MONTH_B = "2027-07"
MONTH_C = "2027-08"


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
    email = f"testuser+iter14{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
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


def _create_expense(s, amount, month=TEST_MONTH, source="contanti"):
    r = s.post(
        f"{API}/expenses",
        json={"date": f"{month}-10", "category": "TEST_stipendio",
              "amount": amount, "source": source},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _create_advance(s, amount, month=TEST_MONTH, worker="TEST_operaio"):
    r = s.post(
        f"{API}/advances",
        json={"date": f"{month}-12", "worker_name": worker, "amount": amount},
    )
    assert r.status_code == 200, r.text
    return r.json()


ALL_MONTHS = [TEST_MONTH, MONTH_A, MONTH_B, MONTH_C]


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
            r = s.get(f"{API}/advances?month={month}")
            if r.status_code == 200:
                for a in r.json():
                    if (a.get("worker_name") or "").startswith("TEST_"):
                        s.delete(f"{API}/advances/{a['id']}")
        except Exception:
            pass
    # Also sweep pending/awaiting/unpaid (may exist across months)
    for path in ("/clients/pending", "/clients/awaiting", "/clients/unpaid"):
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


# ---------------- Test 1 ----------------
def test_1_pure_iva_22_no_withholding(s):
    """1220 con IVA 22%, no ritenuta: imponibile=1000, iva=220, ritenuta=0."""
    _create_client(
        s,
        amount=1000.0,
        vat_rate=22.0,
        withholding_rate=0.0,
        status="lavoro_eseguito",
        payments=[{"amount": 1220.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 1000.0) < 0.01, d["total_imponibile"]
    assert abs(d["total_iva"] - 220.0) < 0.01, d["total_iva"]
    assert abs(d["total_ritenuta"] - 0.0) < 0.01, d["total_ritenuta"]
    assert abs(d["total_incassi"] - 1220.0) < 0.01


# ---------------- Test 2 ----------------
def test_2_iva_and_withholding_rounding(s):
    """1000, vat=22, wh=20 -> divisor=1.02, imponibile=980.39, iva=215.69, ritenuta=196.08."""
    _create_client(
        s,
        amount=1000.0,
        vat_rate=22.0,
        withholding_rate=20.0,
        status="lavoro_eseguito",
        payments=[{"amount": 1000.0, "method": "bonifico", "date": f"{TEST_MONTH}-15"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 980.39) < 0.02, d["total_imponibile"]
    assert abs(d["total_iva"] - 215.69) < 0.02, d["total_iva"]
    assert abs(d["total_ritenuta"] - 196.08) < 0.02, d["total_ritenuta"]


# ---------------- Test 3 ----------------
def test_3_no_vat_no_withholding(s):
    """vat=0, wh=0: imponibile=amount, iva=0, ritenuta=0."""
    _create_client(
        s,
        amount=1000.0,
        vat_rate=0.0,
        withholding_rate=0.0,
        status="lavoro_eseguito",
        payments=[{"amount": 1000.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 1000.0) < 0.01
    assert abs(d["total_iva"] - 0.0) < 0.01
    assert abs(d["total_ritenuta"] - 0.0) < 0.01


# ---------------- Test 4 ----------------
def test_4_materials_pro_rata_distribution(s):
    """2 payments 600+400 (no IVA), materials totali 200: pro-rata 60/40 → margine per pagamento = 480/320."""
    _create_client(
        s,
        amount=1000.0,
        vat_rate=0.0,
        status="lavoro_eseguito",
        payments=[
            {"amount": 600.0, "method": "contanti", "date": f"{TEST_MONTH}-14"},
            {"amount": 400.0, "method": "bonifico", "date": f"{TEST_MONTH}-15"},
        ],
        materials=[{"name": "TEST_m", "amount": 200.0, "source": "conto_aziendale"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    # Total margine = imponibile - materials = 800
    total_mar = sum(d["incassi_margine_by_method"].values())
    assert abs(total_mar - 800.0) < 0.02, d["incassi_margine_by_method"]
    assert abs(d["incassi_margine_by_method"]["contanti"] - 480.0) < 0.02
    assert abs(d["incassi_margine_by_method"]["bonifico"] - 320.0) < 0.02

    # Per-payment check via /payments/by-method
    r_c = s.get(f"{API}/payments/by-method?month={TEST_MONTH}&method=contanti").json()
    items_c = r_c.get("items", [])
    assert len(items_c) == 1
    assert abs(items_c[0]["materials_share"] - 120.0) < 0.02, items_c[0]
    assert abs(items_c[0]["margin"] - 480.0) < 0.02

    r_b = s.get(f"{API}/payments/by-method?month={TEST_MONTH}&method=bonifico").json()
    items_b = r_b.get("items", [])
    assert len(items_b) == 1
    assert abs(items_b[0]["materials_share"] - 80.0) < 0.02
    assert abs(items_b[0]["margin"] - 320.0) < 0.02


# ---------------- Test 5 ----------------
def test_5_advances_NOT_subtracted_from_balance(s):
    """imp 2000 (no IVA, pagato integralmente) + spese 1100 + materiali 500 + acconto 300
    balance = 2000 - 1100 - 500 = 400 (acconto NON sottratto)."""
    _create_client(
        s,
        amount=2000.0,
        vat_rate=0.0,
        status="lavoro_eseguito",
        payments=[{"amount": 2000.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
        materials=[{"name": "TEST_m", "amount": 500.0, "source": "conto_aziendale"}],
    )
    _create_expense(s, 1100.0)
    _create_advance(s, 300.0)

    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 2000.0) < 0.01, d["total_imponibile"]
    assert abs(d["total_spese"] - 1100.0) < 0.01
    assert abs(d["total_materials"] - 500.0) < 0.01
    assert abs(d["total_advances"] - 300.0) < 0.01
    assert abs(d["balance"] - 400.0) < 0.01, (
        f"BUG: balance={d['balance']} instead of 400 "
        f"(advances={d['total_advances']} must NOT be subtracted)"
    )


# ---------------- Test 6 ----------------
def test_6_yearly_balance_is_sum_of_monthly(s):
    """3 mesi: A=+900, B=+1049.52, C=-4954.66 -> totals.balance = -3005.14"""
    # A: imponibile 900 (no IVA)
    _create_client(s, month=MONTH_A, amount=900.0, vat_rate=0.0, status="lavoro_eseguito",
                   payments=[{"amount": 900.0, "method": "contanti", "date": f"{MONTH_A}-10"}])
    # B: imponibile 1049.52
    _create_client(s, month=MONTH_B, amount=1049.52, vat_rate=0.0, status="lavoro_eseguito",
                   payments=[{"amount": 1049.52, "method": "contanti", "date": f"{MONTH_B}-10"}])
    # C: only expenses -> negative
    _create_expense(s, 4954.66, month=MONTH_C)

    y = s.get(f"{API}/summary/year?year={TEST_YEAR}").json()
    a_bal = next(m for m in y["months"] if m["month"] == MONTH_A)["balance"]
    b_bal = next(m for m in y["months"] if m["month"] == MONTH_B)["balance"]
    c_bal = next(m for m in y["months"] if m["month"] == MONTH_C)["balance"]

    assert abs(a_bal - 900.0) < 0.01, a_bal
    assert abs(b_bal - 1049.52) < 0.01, b_bal
    assert abs(c_bal - (-4954.66)) < 0.01, c_bal

    expected = round(a_bal + b_bal + c_bal, 2)
    assert abs(y["totals"]["balance"] - expected) < 0.01
    assert abs(y["totals"]["balance"] - (-3005.14)) < 0.02, y["totals"]["balance"]


# ---------------- Test 7 ----------------
def test_7_pending_client_excluded(s):
    """pending=True -> non conteggiato in summary mensile né annuale."""
    _create_client(
        s,
        amount=5000.0,
        vat_rate=22.0,
        pending=True,
        status="lavoro_eseguito",
        payments=[{"amount": 6100.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 0.0) < 0.01, d
    assert abs(d["total_incassi"] - 0.0) < 0.01
    assert abs(d["balance"] - 0.0) < 0.01

    y = s.get(f"{API}/summary/year?year={TEST_YEAR}").json()
    assert abs(y["totals"]["total_imponibile"] - 0.0) < 0.01


# ---------------- Test 8 ----------------
def test_8_preventivo_in_quotes_not_in_imponibile(s):
    """status=preventivo senza payments -> total_quotes, non total_imponibile/balance."""
    _create_client(s, amount=750.0, status="preventivo")
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert d["total_quotes"] >= 750.0
    assert abs(d["total_imponibile"] - 0.0) < 0.01
    assert abs(d["balance"] - 0.0) < 0.01


# ---------------- Test 9 ----------------
def test_9_best_worst_month(s):
    """3 mesi: A=+500, B=-200, C=+800 -> best=C, worst=B."""
    _create_client(s, month=MONTH_A, amount=500.0, vat_rate=0.0, status="lavoro_eseguito",
                   payments=[{"amount": 500.0, "method": "contanti", "date": f"{MONTH_A}-10"}])
    _create_expense(s, 200.0, month=MONTH_B)
    _create_client(s, month=MONTH_C, amount=800.0, vat_rate=0.0, status="lavoro_eseguito",
                   payments=[{"amount": 800.0, "method": "contanti", "date": f"{MONTH_C}-10"}])

    y = s.get(f"{API}/summary/year?year={TEST_YEAR}").json()
    assert y["best_month"] == MONTH_C, y["best_month"]
    assert y["worst_month"] == MONTH_B, y["worst_month"]


# ---------------- Test 10 ----------------
def test_10_legacy_client_no_payments_array(s):
    """status=lavoro_eseguito, payment_method=contanti, no payments array -> pagato integralmente."""
    _create_client(
        s,
        amount=1000.0,
        vat_rate=0.0,
        status="lavoro_eseguito",
        payment_method="contanti",
        # No payments array
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["total_imponibile"] - 1000.0) < 0.01, d
    assert abs(d["incassi_by_method"]["contanti"] - 1000.0) < 0.01


# ---------------- Test 11 ----------------
def test_11_incassi_by_method_split_and_margine(s):
    """Cliente pagato 500 contanti + 500 bonifico (no IVA, materials 200)
    -> incassi.contanti=500, incassi.bonifico=500
    -> margine per method: pro-rata sui pagamenti (imp uguale) -> materials 100+100 -> margine 400+400."""
    _create_client(
        s,
        amount=1000.0,
        vat_rate=0.0,
        status="lavoro_eseguito",
        payments=[
            {"amount": 500.0, "method": "contanti", "date": f"{TEST_MONTH}-14"},
            {"amount": 500.0, "method": "bonifico", "date": f"{TEST_MONTH}-15"},
        ],
        materials=[{"name": "TEST_m", "amount": 200.0, "source": "conto_aziendale"}],
    )
    d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
    assert abs(d["incassi_by_method"]["contanti"] - 500.0) < 0.01
    assert abs(d["incassi_by_method"]["bonifico"] - 500.0) < 0.01
    assert abs(d["incassi_margine_by_method"]["contanti"] - 400.0) < 0.02
    assert abs(d["incassi_margine_by_method"]["bonifico"] - 400.0) < 0.02
