"""Backend integration tests for Agenda Italserrande.

Covers:
 - Health/auth gates (no token)
 - Firebase REST signUp/signIn for getting a real ID token
 - CRUD: clients, expenses, advances
 - Monthly summary
 - Data isolation between two users
"""
import os
import time
import uuid
from datetime import datetime

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://work-scheduler-69.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
FIREBASE_API_KEY = os.environ.get(
    "REACT_APP_FIREBASE_API_KEY", "AIzaSyA76r_z4Fy5VybzG8cjJIgVhVx7tKhxnpM"
)
SIGNUP_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
SIGNIN_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"

PASSWORD = "TestPassword123!"


def _firebase_signup(email: str, password: str = PASSWORD) -> str:
    r = requests.post(
        SIGNUP_URL,
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=15,
    )
    if r.status_code != 200:
        msg = r.json().get("error", {}).get("message", "")
        if "EMAIL_EXISTS" in msg:
            r2 = requests.post(
                SIGNIN_URL,
                json={"email": email, "password": password, "returnSecureToken": True},
                timeout=15,
            )
            assert r2.status_code == 200, r2.text
            return r2.json()["idToken"]
        raise AssertionError(f"signUp failed: {r.status_code} {r.text}")
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def user_a_token():
    email = f"testuser+a{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    return _firebase_signup(email)


@pytest.fixture(scope="module")
def user_b_token():
    email = f"testuser+b{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    return _firebase_signup(email)


@pytest.fixture
def auth_a(user_a_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {user_a_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture
def auth_b(user_b_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {user_b_token}", "Content-Type": "application/json"})
    return s


# ---------- Health & auth gates ----------

class TestAuthGates:
    def test_root_health_unauth(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()

    def test_me_no_token(self):
        r = requests.get(f"{API}/me")
        assert r.status_code in (401, 403)

    def test_clients_no_token(self):
        r = requests.get(f"{API}/clients")
        assert r.status_code in (401, 403)

    def test_clients_invalid_token(self):
        r = requests.get(f"{API}/clients", headers={"Authorization": "Bearer invalid_token_xyz"})
        assert r.status_code == 401

    def test_me_with_valid_token(self, auth_a):
        r = auth_a.get(f"{API}/me")
        assert r.status_code == 200
        data = r.json()
        assert "uid" in data and isinstance(data["uid"], str)
        assert "email" in data


# ---------- Clients CRUD ----------

TODAY = datetime.utcnow().strftime("%Y-%m-%d")
MONTH = datetime.utcnow().strftime("%Y-%m")


class TestClientsCRUD:
    def test_create_get_update_delete(self, auth_a):
        payload = {
            "date": TODAY,
            "name": "TEST_Mario Rossi",
            "address": "Via Roma 1",
            "phone": "3331112222",
            "notes": "test note",
            "status": "preventivo",
            "payment_method": "",
            "amount": 150.5,
        }
        r = auth_a.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["name"] == "TEST_Mario Rossi"
        assert c["amount"] == 150.5
        assert "id" in c and "user_id" in c
        cid = c["id"]

        # GET by date
        r = auth_a.get(f"{API}/clients", params={"date": TODAY})
        assert r.status_code == 200
        assert any(x["id"] == cid for x in r.json())

        # PUT
        upd = dict(payload, status="lavoro_eseguito", payment_method="contanti", amount=200.0)
        r = auth_a.put(f"{API}/clients/{cid}", json=upd)
        assert r.status_code == 200
        assert r.json()["status"] == "lavoro_eseguito"
        assert r.json()["amount"] == 200.0

        # GET to verify persistence
        r = auth_a.get(f"{API}/clients", params={"date": TODAY})
        match = [x for x in r.json() if x["id"] == cid][0]
        assert match["payment_method"] == "contanti"

        # DELETE
        r = auth_a.delete(f"{API}/clients/{cid}")
        assert r.status_code == 200
        # Verify removed
        r = auth_a.get(f"{API}/clients", params={"date": TODAY})
        assert all(x["id"] != cid for x in r.json())

    def test_update_nonexistent_client(self, auth_a):
        r = auth_a.put(
            f"{API}/clients/nonexistent-id-xxx",
            json={"date": TODAY, "name": "x", "amount": 0, "status": "preventivo", "payment_method": ""},
        )
        assert r.status_code == 404

    def test_delete_nonexistent_client(self, auth_a):
        r = auth_a.delete(f"{API}/clients/nonexistent-id-xxx")
        assert r.status_code == 404


# ---------- Expenses CRUD ----------

class TestExpensesCRUD:
    def test_create_get_update_delete(self, auth_a):
        payload = {"date": TODAY, "category": "TEST_carburante", "amount": 50.0, "source": "contanti", "notes": ""}
        r = auth_a.post(f"{API}/expenses", json=payload)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["category"] == "TEST_carburante"
        eid = e["id"]

        r = auth_a.get(f"{API}/expenses", params={"month": MONTH})
        assert r.status_code == 200
        assert any(x["id"] == eid for x in r.json())

        upd = dict(payload, amount=75.0, source="conto_aziendale")
        r = auth_a.put(f"{API}/expenses/{eid}", json=upd)
        assert r.status_code == 200
        assert r.json()["amount"] == 75.0
        assert r.json()["source"] == "conto_aziendale"

        r = auth_a.delete(f"{API}/expenses/{eid}")
        assert r.status_code == 200


# ---------- Advances CRUD ----------

class TestAdvancesCRUD:
    def test_create_get_delete(self, auth_a):
        payload = {"date": TODAY, "worker_name": "TEST_Luigi", "amount": 100.0}
        r = auth_a.post(f"{API}/advances", json=payload)
        assert r.status_code == 200, r.text
        a = r.json()
        aid = a["id"]
        assert a["worker_name"] == "TEST_Luigi"

        r = auth_a.get(f"{API}/advances", params={"date": TODAY})
        assert r.status_code == 200
        assert any(x["id"] == aid for x in r.json())

        r = auth_a.get(f"{API}/advances", params={"month": MONTH})
        assert r.status_code == 200
        assert any(x["id"] == aid for x in r.json())

        r = auth_a.delete(f"{API}/advances/{aid}")
        assert r.status_code == 200


# ---------- Monthly Summary ----------

class TestSummary:
    def test_summary_aggregates(self, auth_a):
        # Seed: two executed clients (different methods) + one preventivo + 1 expense + 1 advance
        seeded_ids = {"clients": [], "expenses": [], "advances": []}
        try:
            for pm, amt in [("contanti", 100.0), ("pos", 200.0)]:
                r = auth_a.post(f"{API}/clients", json={
                    "date": TODAY, "name": f"TEST_summary_{pm}",
                    "status": "lavoro_eseguito", "payment_method": pm, "amount": amt,
                })
                assert r.status_code == 200
                seeded_ids["clients"].append(r.json()["id"])

            r = auth_a.post(f"{API}/clients", json={
                "date": TODAY, "name": "TEST_summary_quote",
                "status": "preventivo", "payment_method": "", "amount": 500.0,
            })
            seeded_ids["clients"].append(r.json()["id"])

            r = auth_a.post(f"{API}/expenses", json={
                "date": TODAY, "category": "TEST_sum", "amount": 30.0, "source": "contanti",
            })
            seeded_ids["expenses"].append(r.json()["id"])

            r = auth_a.post(f"{API}/advances", json={
                "date": TODAY, "worker_name": "TEST_sum_worker", "amount": 40.0,
            })
            seeded_ids["advances"].append(r.json()["id"])

            r = auth_a.get(f"{API}/summary", params={"month": MONTH})
            assert r.status_code == 200, r.text
            s = r.json()
            for key in ["incassi_by_method", "total_incassi", "total_quotes", "total_executed",
                        "spese_by_source", "total_spese", "total_advances", "balance", "counts"]:
                assert key in s, f"missing {key}"
            # values should at least include our seeds
            assert s["incassi_by_method"]["contanti"] >= 100.0
            assert s["incassi_by_method"]["pos"] >= 200.0
            assert s["total_executed"] >= 300.0
            assert s["total_quotes"] >= 500.0
            assert s["spese_by_source"]["contanti"] >= 30.0
            assert s["total_advances"] >= 40.0
            # balance = incassi - spese - advances
            assert abs(s["balance"] - (s["total_incassi"] - s["total_spese"] - s["total_advances"])) < 0.01
        finally:
            for cid in seeded_ids["clients"]:
                auth_a.delete(f"{API}/clients/{cid}")
            for eid in seeded_ids["expenses"]:
                auth_a.delete(f"{API}/expenses/{eid}")
            for aid in seeded_ids["advances"]:
                auth_a.delete(f"{API}/advances/{aid}")


# ---------- Data Isolation ----------

class TestIsolation:
    def test_user_b_cannot_see_user_a_data(self, auth_a, auth_b):
        r = auth_a.post(f"{API}/clients", json={
            "date": TODAY, "name": "TEST_isolation_A", "status": "preventivo",
            "payment_method": "", "amount": 1.0,
        })
        assert r.status_code == 200
        cid = r.json()["id"]
        try:
            # B should not see A's client
            r = auth_b.get(f"{API}/clients", params={"date": TODAY})
            assert r.status_code == 200
            assert all(x["id"] != cid for x in r.json())

            # B should not be able to update or delete A's client
            r = auth_b.put(f"{API}/clients/{cid}", json={
                "date": TODAY, "name": "hacked", "status": "preventivo",
                "payment_method": "", "amount": 0.0,
            })
            assert r.status_code == 404

            r = auth_b.delete(f"{API}/clients/{cid}")
            assert r.status_code == 404

            # A should still see its own
            r = auth_a.get(f"{API}/clients", params={"date": TODAY})
            assert any(x["id"] == cid for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{cid}")
