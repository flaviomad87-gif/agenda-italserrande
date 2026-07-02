"""Iteration 13 backend regression tests.

Focus: verify that the recently applied accounting fix is correct and that
no other double-counting bugs exist.

CRITICAL CHANGE UNDER TEST:
    balance = total_imponibile - total_spese - total_materials
    (advances/acconti are NO LONGER subtracted; workers' salary is already
    counted in fixed expenses, so subtracting the advance would double-count.)

Also re-validates from the review request:
  - Yearly summary sums monthly balances with the new formula.
  - IVA scorporo (with & without ritenuta d'acconto).
  - incassi_margine_by_method = imponibile - materials (per method / pro-quota).
  - Auth gates on protected endpoints.
  - Pending vs Awaiting split; reorder; execute clears both flags.
  - DELETE single payment only removes that one.
  - /payments/by-method exposes margin/materials_share/imponibile/iva.
  - Appointment fields appointment_at / appointment_note round-trip.
  - /clients/unpaid exposes expected_margin = imponibile - materials.
  - Materials by source separate from expenses (no double-counting).
  - Edge: vat_rate=null / withholding_rate=null.
  - Edge: preventivo without payments -> in total_quotes not incassi.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://questa-demo.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"
FIREBASE_API_KEY = os.environ.get(
    "REACT_APP_FIREBASE_API_KEY", "AIzaSyA76r_z4Fy5VybzG8cjJIgVhVx7tKhxnpM"
)
SIGNUP_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
SIGNIN_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
PASSWORD = "TestPassword123!"

# Isolated month to avoid collision with any pre-existing data
TEST_MONTH = "2027-04"
TEST_YEAR = 2027


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
    email = f"testuser+iter13{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    return _firebase_signup(email)


@pytest.fixture
def s(token):
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return sess


def _create_client(s, **overrides):
    payload = {
        "date": f"{TEST_MONTH}-15",
        "name": "TEST_" + uuid.uuid4().hex[:8],
        "amount": 1000.0,
        "status": "preventivo",
    }
    payload.update(overrides)
    r = s.post(f"{API}/clients", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _create_expense(s, amount, source="contanti", date=None):
    r = s.post(
        f"{API}/expenses",
        json={
            "date": date or f"{TEST_MONTH}-10",
            "category": "TEST_stipendio",
            "amount": amount,
            "source": source,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _create_advance(s, amount, worker="TEST_operaio", date=None):
    r = s.post(
        f"{API}/advances",
        json={
            "date": date or f"{TEST_MONTH}-12",
            "worker_name": worker,
            "amount": amount,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(autouse=True)
def _cleanup(s):
    """Sweep TEST_ data in the isolated month before AND after each test."""
    def _sweep():
        try:
            # clients
            for path in (
                f"/clients?month={TEST_MONTH}",
                "/clients/pending",
                "/clients/awaiting",
                "/clients/unpaid",
            ):
                r = s.get(f"{API}{path}")
                if r.status_code == 200:
                    for c in r.json():
                        if (c.get("name") or "").startswith("TEST_"):
                            s.delete(f"{API}/clients/{c['id']}")
            # expenses
            r = s.get(f"{API}/expenses?month={TEST_MONTH}")
            if r.status_code == 200:
                for e in r.json():
                    if (e.get("category") or "").startswith("TEST_"):
                        s.delete(f"{API}/expenses/{e['id']}")
            # advances
            r = s.get(f"{API}/advances?month={TEST_MONTH}")
            if r.status_code == 200:
                for a in r.json():
                    if (a.get("worker_name") or "").startswith("TEST_"):
                        s.delete(f"{API}/advances/{a['id']}")
        except Exception:
            pass

    _sweep()
    yield
    _sweep()


# ---------- CRITICAL REGRESSION: balance no longer subtracts advances ----------

class TestBalanceNoAdvances:
    def test_balance_formula_excludes_advances(self, s):
        """Scenario from the review request:
        1 client lavoro_eseguito imponibile 1000 IVA 22%
        1 spesa fissa 200
        1 acconto operaio 100
        1 materiale 50
        Expected balance = 1000 - 200 - 50 = 750  (NOT 650 which would include advances)
        total_advances=100 must still be present.
        """
        # Client with 1220 gross payment (1000 imponibile + 220 IVA)
        _create_client(
            s,
            amount=1000.0,
            vat_rate=22.0,
            withholding_rate=0.0,
            status="lavoro_eseguito",
            payments=[{"amount": 1220.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
            materials=[{"name": "TEST_mat", "amount": 50.0, "source": "conto_aziendale"}],
        )
        _create_expense(s, 200.0)
        _create_advance(s, 100.0)

        r = s.get(f"{API}/summary?month={TEST_MONTH}")
        assert r.status_code == 200, r.text
        d = r.json()

        assert abs(d["total_imponibile"] - 1000.0) < 0.5, f"imponibile: {d['total_imponibile']}"
        assert abs(d["total_iva"] - 220.0) < 0.5, f"iva: {d['total_iva']}"
        assert abs(d["total_incassi"] - 1220.0) < 0.5, f"incassi: {d['total_incassi']}"
        assert abs(d["total_spese"] - 200.0) < 0.01, f"spese: {d['total_spese']}"
        assert abs(d["total_materials"] - 50.0) < 0.01, f"materials: {d['total_materials']}"
        assert abs(d["total_advances"] - 100.0) < 0.01, (
            f"total_advances must still be exposed as reminder: {d['total_advances']}"
        )
        # THE KEY ASSERTION: balance should be 750, NOT 650
        assert abs(d["balance"] - 750.0) < 0.5, (
            f"REGRESSION: balance={d['balance']} != 750 "
            f"(advances={d['total_advances']} must NOT be subtracted)"
        )

    def test_balance_no_advances_when_only_expenses(self, s):
        """Only expenses & advances, no clients/materials.
        balance = -spese  (advances shown but not subtracted).
        """
        _create_expense(s, 300.0)
        _create_advance(s, 500.0)
        r = s.get(f"{API}/summary?month={TEST_MONTH}")
        d = r.json()
        assert abs(d["total_advances"] - 500.0) < 0.01
        assert abs(d["balance"] - (-300.0)) < 0.01, (
            f"balance should be -300 (spese only), got {d['balance']}"
        )

    def test_balance_zero_when_only_advances(self, s):
        """Only advances -> balance must be 0 (advances not counted)."""
        _create_advance(s, 250.0)
        r = s.get(f"{API}/summary?month={TEST_MONTH}")
        d = r.json()
        assert abs(d["total_advances"] - 250.0) < 0.01
        assert abs(d["balance"] - 0.0) < 0.01, (
            f"balance should be 0 with only advances, got {d['balance']}"
        )


# ---------- Yearly summary uses same formula ----------

class TestYearlySummary:
    def test_yearly_summary_sums_monthly_balances_without_advances(self, s):
        _create_client(
            s,
            amount=1000.0,
            vat_rate=22.0,
            status="lavoro_eseguito",
            payments=[{"amount": 1220.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
            materials=[{"name": "TEST_m", "amount": 50.0, "source": "conto_aziendale"}],
        )
        _create_expense(s, 200.0)
        _create_advance(s, 100.0)

        r = s.get(f"{API}/summary/year?year={TEST_YEAR}")
        assert r.status_code == 200, r.text
        y = r.json()
        totals = y["totals"]
        # Only our test month has data
        assert abs(totals["total_imponibile"] - 1000.0) < 0.5
        assert abs(totals["total_spese"] - 200.0) < 0.01
        assert abs(totals["total_materials"] - 50.0) < 0.01
        assert abs(totals["total_advances"] - 100.0) < 0.01
        assert abs(totals["balance"] - 750.0) < 0.5, (
            f"yearly balance {totals['balance']} != 750 (advances must not be subtracted)"
        )
        # Also check that the specific month equals 750
        month_row = next(m for m in y["months"] if m["month"] == TEST_MONTH)
        assert abs(month_row["balance"] - 750.0) < 0.5


# ---------- IVA scorporo ----------

class TestIvaScorporo:
    def test_iva_split_no_withholding(self, s):
        _create_client(
            s,
            amount=1000.0,
            vat_rate=22.0,
            status="lavoro_eseguito",
            payments=[{"amount": 1220.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
        )
        d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
        assert abs(d["total_imponibile"] - 1000.0) < 0.5
        assert abs(d["total_iva"] - 220.0) < 0.5
        assert abs(d["total_incassi"] - 1220.0) < 0.5

    def test_iva_split_with_withholding(self, s):
        # imponibile 1000, IVA 22%, ritenuta 20% => client pays 1000 + 220 - 200 = 1020
        _create_client(
            s,
            amount=1000.0,
            vat_rate=22.0,
            withholding_rate=20.0,
            status="lavoro_eseguito",
            payments=[{"amount": 1020.0, "method": "bonifico", "date": f"{TEST_MONTH}-15"}],
        )
        d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
        assert abs(d["total_imponibile"] - 1000.0) < 0.5, d["total_imponibile"]
        assert abs(d["total_iva"] - 220.0) < 0.5, d["total_iva"]
        assert abs(d["total_ritenuta"] - 200.0) < 0.5, d["total_ritenuta"]

    def test_null_vat_and_withholding(self, s):
        """Forfettario: vat_rate=None, withholding_rate=None -> imponibile = amount."""
        _create_client(
            s,
            amount=500.0,
            vat_rate=None,
            withholding_rate=None,
            status="lavoro_eseguito",
            payments=[{"amount": 500.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
        )
        d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
        assert abs(d["total_imponibile"] - 500.0) < 0.01
        assert abs(d["total_iva"] - 0.0) < 0.01
        assert abs(d["total_ritenuta"] - 0.0) < 0.01


# ---------- Margine by method ----------

class TestMargineByMethod:
    def test_margine_by_method_single_payment(self, s):
        """imponibile 1000 IVA 22%, materiali 200, pagato tutto in contanti (1220)
        -> incassi_margine_by_method.contanti = 800 (1000 - 200)."""
        _create_client(
            s,
            amount=1000.0,
            vat_rate=22.0,
            status="lavoro_eseguito",
            payments=[{"amount": 1220.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
            materials=[{"name": "TEST_m", "amount": 200.0, "source": "conto_aziendale"}],
        )
        d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
        mar = d["incassi_margine_by_method"]
        assert abs(mar["contanti"] - 800.0) < 0.5, f"margine contanti: {mar['contanti']}"
        assert abs(mar["pos"] - 0.0) < 0.01
        assert abs(mar["bonifico"] - 0.0) < 0.01

    def test_margine_pro_quota_two_payments(self, s):
        """imponibile 1000 (no IVA), 2 pagamenti in contanti 300+700, materiali 100.
        margin p1 ≈ 270 (share 30%), p2 ≈ 630 (share 70%). Sum = 900 = 1000-100.
        """
        _create_client(
            s,
            amount=1000.0,
            vat_rate=0.0,
            status="lavoro_eseguito",
            payments=[
                {"amount": 300.0, "method": "contanti", "date": f"{TEST_MONTH}-14"},
                {"amount": 700.0, "method": "contanti", "date": f"{TEST_MONTH}-15"},
            ],
            materials=[{"name": "TEST_m", "amount": 100.0, "source": "conto_aziendale"}],
        )
        d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
        mar = d["incassi_margine_by_method"]
        assert abs(mar["contanti"] - 900.0) < 0.5, f"contanti margine: {mar['contanti']}"

        # Verify via /payments/by-method that per-payment margin is 270 / 630
        r = s.get(f"{API}/payments/by-method?month={TEST_MONTH}&method=contanti")
        assert r.status_code == 200
        body = r.json()
        items = body.get("items", body) if isinstance(body, dict) else body
        # find our two payments
        margins = sorted([it["margin"] for it in items if abs(it["amount"] - 300.0) < 0.01
                          or abs(it["amount"] - 700.0) < 0.01])
        assert len(margins) == 2, f"expected 2 payments, got: {items}"
        assert abs(margins[0] - 270.0) < 1.0, f"p1 margin: {margins[0]}"
        assert abs(margins[1] - 630.0) < 1.0, f"p2 margin: {margins[1]}"


# ---------- /payments/by-method exposes required fields ----------

class TestPaymentsByMethodFields:
    def test_payment_has_margin_imponibile_iva_materials_share(self, s):
        _create_client(
            s,
            amount=1000.0,
            vat_rate=22.0,
            status="lavoro_eseguito",
            payments=[{"amount": 1220.0, "method": "contanti", "date": f"{TEST_MONTH}-15"}],
            materials=[{"name": "TEST_m", "amount": 100.0, "source": "conto_aziendale"}],
        )
        r = s.get(f"{API}/payments/by-method?month={TEST_MONTH}&method=contanti")
        assert r.status_code == 200, r.text
        body = r.json()
        items = body.get("items", body) if isinstance(body, dict) else body
        assert len(items) >= 1
        p = items[0]
        for k in ("amount", "imponibile", "iva", "materials_share", "margin"):
            assert k in p, f"missing key '{k}' in {p}"
        assert abs(p["imponibile"] - 1000.0) < 0.5
        assert abs(p["iva"] - 220.0) < 0.5
        assert abs(p["materials_share"] - 100.0) < 0.5
        assert abs(p["margin"] - 900.0) < 0.5


# ---------- Auth gates ----------

class TestAuthGates:
    def test_protected_endpoints_return_403_without_token(self):
        endpoints = [
            ("GET", f"/summary?month={TEST_MONTH}"),
            ("GET", f"/summary/year?year={TEST_YEAR}"),
            ("GET", "/clients/unpaid"),
            ("GET", "/clients/pending"),
            ("GET", "/clients/awaiting"),
            ("GET", f"/payments/by-method?month={TEST_MONTH}&method=contanti"),
            ("GET", "/expenses"),
            ("GET", "/advances"),
        ]
        for method, path in endpoints:
            r = requests.request(method, f"{API}{path}", timeout=15)
            assert r.status_code in (401, 403), f"{method} {path} -> {r.status_code}"


# ---------- Pending vs Awaiting split ----------

class TestPendingAwaitingSplit:
    def test_awaiting_and_pending_exclusive(self, s):
        c_await = _create_client(s, pending=True, awaiting_materials=True)
        c_pending = _create_client(s, pending=True, awaiting_materials=False)

        r_await = s.get(f"{API}/clients/awaiting").json()
        r_pending = s.get(f"{API}/clients/pending").json()

        await_ids = {c["id"] for c in r_await}
        pending_ids = {c["id"] for c in r_pending}

        assert c_await["id"] in await_ids
        assert c_await["id"] not in pending_ids
        assert c_pending["id"] in pending_ids
        assert c_pending["id"] not in await_ids


# ---------- Reorder ----------

class TestReorder:
    def test_reorder_awaiting_persists_sort_order(self, s):
        a = _create_client(s, pending=True, awaiting_materials=True)
        b = _create_client(s, pending=True, awaiting_materials=True)
        new_order = [b["id"], a["id"]]
        r = s.put(f"{API}/clients/awaiting/reorder", json={"ids": new_order})
        assert r.status_code == 200, r.text
        r2 = s.get(f"{API}/clients/awaiting").json()
        idx = {c["id"]: c.get("sort_order") for c in r2}
        assert idx[b["id"]] == 0
        assert idx[a["id"]] == 1

    def test_reorder_pending_persists_sort_order(self, s):
        a = _create_client(s, pending=True, awaiting_materials=False)
        b = _create_client(s, pending=True, awaiting_materials=False)
        new_order = [b["id"], a["id"]]
        r = s.put(f"{API}/clients/pending/reorder", json={"ids": new_order})
        assert r.status_code == 200
        r2 = s.get(f"{API}/clients/pending").json()
        idx = {c["id"]: c.get("sort_order") for c in r2}
        assert idx[b["id"]] == 0
        assert idx[a["id"]] == 1


# ---------- DELETE single payment ----------

class TestDeletePayment:
    def test_delete_single_payment_leaves_others(self, s):
        c = _create_client(
            s,
            amount=1000.0,
            vat_rate=0.0,
            status="lavoro_eseguito",
            payments=[
                {"id": "p1", "amount": 100.0, "method": "contanti", "date": f"{TEST_MONTH}-10"},
                {"id": "p2", "amount": 200.0, "method": "pos", "date": f"{TEST_MONTH}-11"},
                {"id": "p3", "amount": 300.0, "method": "bonifico", "date": f"{TEST_MONTH}-12"},
            ],
        )
        r = s.delete(f"{API}/clients/{c['id']}/payments/p2")
        assert r.status_code == 200, r.text

        # Fetch via list (no GET /clients/{id} endpoint exists)
        lst = s.get(f"{API}/clients?month={TEST_MONTH}").json()
        got = next((x for x in lst if x["id"] == c["id"]), None)
        assert got is not None
        payments = got.get("payments") or []
        ids = [p.get("id") for p in payments]
        assert "p1" in ids
        assert "p3" in ids
        assert "p2" not in ids


# ---------- Execute pending clears both flags ----------

class TestExecutePending:
    def test_execute_clears_pending_and_awaiting(self, s):
        c = _create_client(s, pending=True, awaiting_materials=True)
        r = s.post(f"{API}/clients/{c['id']}/execute?date={TEST_MONTH}-20")
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["pending"] is False
        assert b["awaiting_materials"] is False


# ---------- Appointment fields ----------

class TestAppointment:
    def test_appointment_at_and_note_roundtrip(self, s):
        appt = f"{TEST_MONTH}-15T14:30"
        c = _create_client(
            s,
            appointment_at=appt,
            appointment_note="pomeriggio dopo pranzo",
        )
        assert c.get("appointment_at") == appt
        assert c.get("appointment_note") == "pomeriggio dopo pranzo"
        # PUT update
        r = s.put(
            f"{API}/clients/{c['id']}",
            json={
                "date": c["date"],
                "name": c["name"],
                "amount": c["amount"],
                "appointment_at": f"{TEST_MONTH}-16T09:00",
                "appointment_note": "cambio orario",
            },
        )
        assert r.status_code == 200, r.text
        # GET verify persistence via list (no GET /clients/{id} endpoint)
        lst = s.get(f"{API}/clients?month={TEST_MONTH}").json()
        g = next((x for x in lst if x["id"] == c["id"]), None)
        assert g is not None
        assert g["appointment_at"] == f"{TEST_MONTH}-16T09:00"
        assert g["appointment_note"] == "cambio orario"


# ---------- Unpaid clients expected_margin ----------

class TestUnpaidExpectedMargin:
    def test_expected_margin_imponibile_minus_materials(self, s):
        """imponibile 500 IVA 22%, materiali 100 -> expected_margin = 400."""
        c = _create_client(
            s,
            amount=500.0,
            vat_rate=22.0,
            status="lavoro_eseguito",
            materials=[{"name": "TEST_m", "amount": 100.0, "source": "conto_aziendale"}],
        )
        r = s.get(f"{API}/clients/unpaid")
        assert r.status_code == 200
        row = next((x for x in r.json() if x["id"] == c["id"]), None)
        assert row is not None, "client not in unpaid list"
        assert "expected_margin" in row
        assert abs(row["expected_margin"] - 400.0) < 0.5, f"expected_margin={row['expected_margin']}"


# ---------- Materials by source not double-counted with expenses ----------

class TestMaterialsBySourceNotDoubleCounted:
    def test_materials_separate_from_expenses(self, s):
        """materials contanti 100 + materials conto_aziendale 50 + expense 200
        -> total_materials=150 (separate), total_spese=200 (separate).
        No overlap.
        """
        _create_client(
            s,
            amount=1000.0,
            vat_rate=0.0,
            status="lavoro_eseguito",
            payments=[{"amount": 1000.0, "method": "bonifico", "date": f"{TEST_MONTH}-15"}],
            materials=[
                {"name": "TEST_m_cash", "amount": 100.0, "source": "contanti"},
                {"name": "TEST_m_bank", "amount": 50.0, "source": "conto_aziendale"},
            ],
        )
        _create_expense(s, 200.0, source="contanti")
        d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
        assert abs(d["total_materials"] - 150.0) < 0.01
        assert abs(d["total_spese"] - 200.0) < 0.01
        assert abs(d["materials_by_source"]["contanti"] - 100.0) < 0.01
        assert abs(d["materials_by_source"]["conto_aziendale"] - 50.0) < 0.01
        # balance = 1000 - 200 - 150 = 650
        assert abs(d["balance"] - 650.0) < 0.5, d["balance"]


# ---------- Edge: preventivo without payments in total_quotes ----------

class TestQuotePreventivo:
    def test_preventivo_no_payments_in_quotes_not_incassi(self, s):
        _create_client(s, amount=800.0, status="preventivo")
        d = s.get(f"{API}/summary?month={TEST_MONTH}").json()
        assert abs(d["total_incassi"] - 0.0) < 0.01
        assert abs(d["total_imponibile"] - 0.0) < 0.01
        assert d["total_quotes"] >= 800.0
