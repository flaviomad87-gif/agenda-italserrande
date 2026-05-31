"""Iteration 11 — Edge case / bug-sweep regression tests for Agenda Italserrande.

Targets the bug-sweep checklist from main agent:
 - special characters in name/address (apostrophe, quotes, accents)
 - amount=0 with materials>0 (negative margin)
 - payments > toCollect (eccedenza branch)
 - pending client preserves materials/payments after move-to-agenda
 - cross-month/year isolation
 - future empty year summary
 - reverse date range returns empty list (no crash)
 - search returns both pending and non-pending clients
 - end-to-end P&L formula (1000 - 50 - 200 - 100 = 650)
"""
import os
import time
import uuid
from urllib.parse import quote

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


def _firebase_signup(email: str) -> str:
    r = requests.post(
        SIGNUP_URL,
        json={"email": email, "password": PASSWORD, "returnSecureToken": True},
        timeout=15,
    )
    if r.status_code != 200:
        msg = r.json().get("error", {}).get("message", "")
        if "EMAIL_EXISTS" in msg:
            r2 = requests.post(
                SIGNIN_URL,
                json={"email": email, "password": PASSWORD, "returnSecureToken": True},
                timeout=15,
            )
            assert r2.status_code == 200, r2.text
            return r2.json()["idToken"]
        raise AssertionError(f"signUp failed: {r.status_code} {r.text}")
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def auth():
    email = f"testuser+edge{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    token = _firebase_signup(email)
    s = requests.Session()
    s.headers.update(
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    yield s
    # Best-effort cleanup
    try:
        r = s.get(f"{API}/clients?month=2026-01", timeout=10)
        for c in r.json() or []:
            s.delete(f"{API}/clients/{c['id']}", timeout=10)
    except Exception:
        pass


# ---------- Edge: special characters ----------

class TestSpecialChars:
    def test_apostrophe_in_name(self, auth):
        payload = {
            "name": "L'Officina di Rossi",
            "date": "2026-01-15",
            "amount": 500,
            "address": "Piazza S. Pietro, 1",
            "phone": "+39 333 1234567",
            "status": "lavoro_eseguito",
        }
        r = auth.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["name"] == "L'Officina di Rossi"
        # search by partial term containing apostrophe
        rs = auth.get(f"{API}/clients/search", params={"q": "L'Off"})
        assert rs.status_code == 200
        assert any(c["id"] == cid for c in rs.json()), "apostrophe search failed"
        # cleanup
        auth.delete(f"{API}/clients/{cid}")

    def test_double_quote_in_name(self, auth):
        payload = {
            "name": 'Rossi "il matto"',
            "date": "2026-01-16",
            "amount": 100,
            "status": "preventivo",
        }
        r = auth.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["name"] == 'Rossi "il matto"'
        # GET back to verify persistence
        gr = auth.get(f"{API}/clients?month=2026-01")
        assert any(c["id"] == cid and c["name"] == 'Rossi "il matto"' for c in gr.json())
        auth.delete(f"{API}/clients/{cid}")

    def test_special_address_encodes_for_maps(self, auth):
        # backend just stores the address; we verify it is returned as-is
        addr = "Piazza S. Pietro, 1 - Città del Vaticano"
        payload = {
            "name": "TEST_MapsAddr",
            "date": "2026-01-17",
            "amount": 200,
            "address": addr,
            "status": "preventivo",
        }
        r = auth.post(f"{API}/clients", json=payload)
        assert r.status_code == 200
        assert r.json()["address"] == addr
        # verify quote() round-trips correctly (frontend uses encodeURIComponent)
        encoded = quote(addr, safe="")
        assert "%2C" in encoded and "%20" in encoded
        auth.delete(f"{API}/clients/{r.json()['id']}")


# ---------- Edge: amount=0 with materials ----------

class TestZeroAmount:
    def test_zero_amount_with_materials_summary(self, auth):
        payload = {
            "name": "TEST_ZeroAmt",
            "date": "2026-02-05",
            "amount": 0,
            "status": "lavoro_eseguito",
            "materials": [
                {"description": "viti", "amount": 50, "source": "contanti"}
            ],
        }
        r = auth.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        # summary should count material but not as incasso
        s = auth.get(f"{API}/summary?month=2026-02").json()
        assert s["total_materials"] >= 50
        assert s["total_incassi"] == 0
        # client should NOT appear in unpaid list (balance == 0, amount == 0)
        u = auth.get(f"{API}/clients/unpaid").json()
        assert not any(c["id"] == cid for c in u), "zero-amount client should not be unpaid"
        auth.delete(f"{API}/clients/{cid}")


# ---------- Edge: payments > toCollect (eccedenza) ----------

class TestEccedenza:
    def test_overpayment_not_in_unpaid(self, auth):
        payload = {
            "name": "TEST_Eccedenza",
            "date": "2026-02-10",
            "amount": 100,
            "status": "lavoro_eseguito",
            "payments": [
                {"amount": 150, "method": "contanti", "date": "2026-02-10"}
            ],
        }
        r = auth.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        u = auth.get(f"{API}/clients/unpaid").json()
        assert not any(c["id"] == cid for c in u), "overpaid client must not be in unpaid"
        # summary: total_incassi includes the 150 paid
        s = auth.get(f"{API}/summary?month=2026-02").json()
        assert s["incassi_by_method"]["contanti"] >= 150
        auth.delete(f"{API}/clients/{cid}")


# ---------- Edge: pending preservation after execute ----------

class TestPendingPreservation:
    def test_pending_executed_keeps_materials_and_payments(self, auth):
        payload = {
            "name": "TEST_PendingPreserve",
            "date": "2026-03-01",
            "amount": 300,
            "status": "lavoro_eseguito",
            "pending": True,
            "materials": [{"description": "tubi", "amount": 30, "source": "conto_aziendale"}],
            "payments": [{"amount": 100, "method": "bonifico", "date": "2026-03-01"}],
        }
        r = auth.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        # While pending, must NOT appear in agenda or summary or unpaid
        agenda = auth.get(f"{API}/clients?month=2026-03").json()
        assert not any(c["id"] == cid for c in agenda)
        s = auth.get(f"{API}/summary?month=2026-03").json()
        assert s["total_materials"] == 0
        assert s["total_incassi"] == 0
        u = auth.get(f"{API}/clients/unpaid").json()
        assert not any(c["id"] == cid for c in u), "pending must be excluded from unpaid"
        # Execute
        ex = auth.post(f"{API}/clients/{cid}/execute?date=2026-03-15")
        assert ex.status_code == 200, ex.text
        moved = ex.json()
        assert moved["pending"] is False
        assert moved["date"] == "2026-03-15"
        assert len(moved.get("materials") or []) == 1
        assert moved["materials"][0]["amount"] == 30
        assert len(moved.get("payments") or []) == 1
        assert moved["payments"][0]["amount"] == 100
        # Now appears in agenda + summary
        s2 = auth.get(f"{API}/summary?month=2026-03").json()
        assert s2["total_materials"] >= 30
        assert s2["incassi_by_method"]["bonifico"] >= 100
        auth.delete(f"{API}/clients/{cid}")


# ---------- Edge: cross-month/year isolation ----------

class TestCrossMonthIsolation:
    def test_january_client_not_in_previous_december(self, auth):
        payload = {
            "name": "TEST_JanIsolation",
            "date": "2026-01-05",
            "amount": 500,
            "status": "lavoro_eseguito",
            "payment_method": "contanti",
        }
        r = auth.post(f"{API}/clients", json=payload)
        cid = r.json()["id"]
        s_dec = auth.get(f"{API}/summary?month=2025-12").json()
        assert s_dec["total_incassi"] == 0
        assert s_dec["counts"]["clients"] == 0
        s_jan = auth.get(f"{API}/summary?month=2026-01").json()
        assert s_jan["total_incassi"] >= 500
        auth.delete(f"{API}/clients/{cid}")


# ---------- Edge: future empty year ----------

class TestFutureEmptyYear:
    def test_year_2030_returns_12_empty_months(self, auth):
        r = auth.get(f"{API}/summary/year?year=2030")
        assert r.status_code == 200, r.text
        body = r.json()
        # Endpoint may return list of 12 months OR object with "months" — accept either
        if isinstance(body, list):
            months = body
        else:
            months = body.get("months", body.get("data", []))
            # also verify totals/best/worst when wrapped
            for k in ("best", "worst", "best_month", "worst_month"):
                if k in body:
                    assert body[k] in (None, "", {}, [])
        assert len(months) == 12
        for m in months:
            assert m["total_incassi"] == 0
            assert m["total_spese"] == 0
            assert m["balance"] == 0


# ---------- Edge: reverse date range ----------

class TestReverseRange:
    def test_invalid_reverse_range_returns_empty(self, auth):
        r = auth.get(
            f"{API}/clients",
            params={"from_date": "2026-01-01", "to_date": "2025-12-31"},
        )
        assert r.status_code == 200, r.text
        assert r.json() == []


# ---------- Edge: search includes pending ----------

class TestSearchIncludesPending:
    def test_search_returns_both_pending_and_non_pending(self, auth):
        # one normal, one pending — both should match search
        c1 = auth.post(
            f"{API}/clients",
            json={
                "name": "TEST_SearchAlphaUnique",
                "date": "2026-04-01",
                "amount": 100,
                "status": "preventivo",
            },
        ).json()
        c2 = auth.post(
            f"{API}/clients",
            json={
                "name": "TEST_SearchAlphaPending",
                "date": "2026-04-02",
                "amount": 200,
                "status": "preventivo",
                "pending": True,
            },
        ).json()
        r = auth.get(f"{API}/clients/search", params={"q": "TEST_SearchAlpha"})
        assert r.status_code == 200
        ids = {c["id"] for c in r.json()}
        assert c1["id"] in ids, "non-pending missing from search"
        assert c2["id"] in ids, "PENDING missing from search — should be included"
        auth.delete(f"{API}/clients/{c1['id']}")
        auth.delete(f"{API}/clients/{c2['id']}")


# ---------- Edge: end-to-end P&L formula ----------

class TestPnLFormula:
    def test_balance_1000_minus_50_minus_200_minus_100_equals_650(self, auth):
        """1 client 1000€ (lavoro_eseguito) + 100€ materials
        + 1 expense 50€ + 1 advance 200€ → balance 650€."""
        client_payload = {
            "name": "TEST_PnLClient",
            "date": "2026-05-10",
            "amount": 1000,
            "status": "lavoro_eseguito",
            "payment_method": "bonifico",
            "materials": [
                {"description": "ferro", "amount": 100, "source": "conto_aziendale"}
            ],
        }
        c = auth.post(f"{API}/clients", json=client_payload)
        assert c.status_code == 200, c.text
        cid = c.json()["id"]
        e = auth.post(
            f"{API}/expenses",
            json={
                "description": "TEST_PnLExp",
                "amount": 50,
                "date": "2026-05-11",
                "source": "contanti",
                "category": "altro",
            },
        )
        assert e.status_code == 200, e.text
        eid = e.json()["id"]
        a = auth.post(
            f"{API}/advances",
            json={
                "worker_name": "TEST_Worker",
                "amount": 200,
                "date": "2026-05-12",
            },
        )
        assert a.status_code == 200, a.text
        aid = a.json()["id"]
        s = auth.get(f"{API}/summary?month=2026-05").json()
        assert s["total_incassi"] == 1000.0, s
        assert s["total_spese"] == 50.0, s
        assert s["total_advances"] == 200.0, s
        assert s["total_materials"] == 100.0, s
        assert s["balance"] == 650.0, f"P&L formula broken: {s['balance']}"
        # cleanup
        auth.delete(f"{API}/clients/{cid}")
        auth.delete(f"{API}/expenses/{eid}")
        auth.delete(f"{API}/advances/{aid}")


# ---------- Edge: invalid token revokes access ----------

class TestRevokedToken:
    def test_garbage_token_returns_401(self):
        r = requests.get(
            f"{API}/me", headers={"Authorization": "Bearer not-a-real-token"}
        )
        assert r.status_code in (401, 403)
