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


# ---------- Iteration 2: Client search ----------

class TestClientSearch:
    def test_search_requires_auth(self):
        r = requests.get(f"{API}/clients/search", params={"q": "mario"})
        assert r.status_code in (401, 403)

    def test_search_short_query_returns_empty(self, auth_a):
        # Single char must return [] regardless of data
        r = auth_a.get(f"{API}/clients/search", params={"q": "m"})
        assert r.status_code == 200
        assert r.json() == []

        r = auth_a.get(f"{API}/clients/search", params={"q": ""})
        assert r.status_code == 200
        assert r.json() == []

    def test_search_matches_name_address_phone(self, auth_a):
        seeded = []
        try:
            # Seed: 3 clients with unique name/address/phone tokens
            uniq = uuid.uuid4().hex[:8].upper()
            payloads = [
                {"date": TODAY, "name": f"TEST_NAMEMATCH_{uniq}", "address": "Via X 1",
                 "phone": "0000000000", "status": "preventivo", "payment_method": "", "amount": 1.0},
                {"date": TODAY, "name": "TEST_other_a", "address": f"Via ADDRMATCH_{uniq} 9",
                 "phone": "1111111111", "status": "preventivo", "payment_method": "", "amount": 2.0},
                {"date": TODAY, "name": "TEST_other_b", "address": "Via Y 3",
                 "phone": f"22{uniq}", "status": "preventivo", "payment_method": "", "amount": 3.0},
            ]
            for p in payloads:
                r = auth_a.post(f"{API}/clients", json=p)
                assert r.status_code == 200
                seeded.append(r.json()["id"])

            # Match by name (case insensitive)
            r = auth_a.get(f"{API}/clients/search", params={"q": f"namematch_{uniq.lower()}"})
            assert r.status_code == 200
            ids = [c["id"] for c in r.json()]
            assert seeded[0] in ids

            # Match by address
            r = auth_a.get(f"{API}/clients/search", params={"q": f"ADDRMATCH_{uniq}"})
            assert r.status_code == 200
            ids = [c["id"] for c in r.json()]
            assert seeded[1] in ids

            # Match by phone fragment
            r = auth_a.get(f"{API}/clients/search", params={"q": f"22{uniq}"})
            assert r.status_code == 200
            ids = [c["id"] for c in r.json()]
            assert seeded[2] in ids
        finally:
            for cid in seeded:
                auth_a.delete(f"{API}/clients/{cid}")

    def test_search_sorted_by_date_desc_and_max_50(self, auth_a):
        # Create 3 clients across 3 different dates with same unique token in name
        uniq = uuid.uuid4().hex[:8].upper()
        token = f"SORTTEST_{uniq}"
        seeded = []
        dates = ["2024-03-10", "2024-05-15", "2024-01-05"]
        try:
            for d in dates:
                r = auth_a.post(f"{API}/clients", json={
                    "date": d, "name": f"TEST_{token}_{d}", "status": "preventivo",
                    "payment_method": "", "amount": 0.0,
                })
                assert r.status_code == 200
                seeded.append(r.json()["id"])

            r = auth_a.get(f"{API}/clients/search", params={"q": token})
            assert r.status_code == 200
            results = r.json()
            assert len(results) >= 3
            assert len(results) <= 50  # max 50 enforced
            # Filter ours and check date ordering desc
            ours = [c for c in results if token in c["name"]]
            assert len(ours) == 3
            assert ours[0]["date"] == "2024-05-15"
            assert ours[-1]["date"] == "2024-01-05"
        finally:
            for cid in seeded:
                auth_a.delete(f"{API}/clients/{cid}")

    def test_search_isolation_between_users(self, auth_a, auth_b):
        uniq = uuid.uuid4().hex[:8].upper()
        token = f"ISO_{uniq}"
        r = auth_a.post(f"{API}/clients", json={
            "date": TODAY, "name": f"TEST_{token}", "status": "preventivo",
            "payment_method": "", "amount": 0.0,
        })
        cid = r.json()["id"]
        try:
            r = auth_b.get(f"{API}/clients/search", params={"q": token})
            assert r.status_code == 200
            assert all(c["id"] != cid for c in r.json())
            # User A still sees it
            r = auth_a.get(f"{API}/clients/search", params={"q": token})
            assert any(c["id"] == cid for c in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{cid}")


# ---------- Iteration 2: Advances by worker ----------

class TestAdvancesByWorker:
    def test_requires_auth(self):
        r = requests.get(f"{API}/advances/by-worker", params={"month": MONTH})
        assert r.status_code in (401, 403)

    def test_aggregation_and_isolation(self, auth_a, auth_b):
        uniq = uuid.uuid4().hex[:6].upper()
        worker1 = f"TEST_W1_{uniq}"
        worker2 = f"TEST_W2_{uniq}"
        # Use a fixed test month far in the past (no other test data)
        month = "2023-07"
        d1 = "2023-07-05"
        d2 = "2023-07-20"
        d_other_month = "2023-08-01"

        seeded_a = []
        seeded_b = []
        try:
            # User A: 2 advances for worker1 (50 + 30) and 1 for worker2 (100), 1 in other month for worker1 (999)
            for date_, w, amt in [
                (d1, worker1, 50.0),
                (d2, worker1, 30.0),
                (d2, worker2, 100.0),
                (d_other_month, worker1, 999.0),
            ]:
                r = auth_a.post(f"{API}/advances", json={
                    "date": date_, "worker_name": w, "amount": amt,
                })
                assert r.status_code == 200
                seeded_a.append(r.json()["id"])

            # User B: 1 advance same worker name same month - must NOT leak
            r = auth_b.post(f"{API}/advances", json={
                "date": d1, "worker_name": worker1, "amount": 7777.0,
            })
            assert r.status_code == 200
            seeded_b.append(r.json()["id"])

            r = auth_a.get(f"{API}/advances/by-worker", params={"month": month})
            assert r.status_code == 200, r.text
            rows = r.json()
            assert isinstance(rows, list)
            # Filter our workers (other test runs may have added more)
            ours = {row["worker_name"]: row for row in rows if row["worker_name"] in (worker1, worker2)}
            assert worker1 in ours and worker2 in ours
            assert ours[worker1]["total"] == 80.0
            assert ours[worker1]["count"] == 2
            assert ours[worker1]["last_date"] == d2
            assert ours[worker2]["total"] == 100.0
            assert ours[worker2]["count"] == 1
            assert ours[worker2]["last_date"] == d2

            # Sorted by total desc among ours
            ordered = [row for row in rows if row["worker_name"] in (worker1, worker2)]
            assert ordered[0]["worker_name"] == worker2  # 100 > 80

            # Isolation: B sees its 7777 only, not A's 80
            r = auth_b.get(f"{API}/advances/by-worker", params={"month": month})
            assert r.status_code == 200
            rows_b = {row["worker_name"]: row for row in r.json() if row["worker_name"] == worker1}
            assert worker1 in rows_b
            assert rows_b[worker1]["total"] == 7777.0
            assert rows_b[worker1]["count"] == 1

            # Other month shouldn't include worker1 from July
            r = auth_a.get(f"{API}/advances/by-worker", params={"month": "2023-08"})
            assert r.status_code == 200
            rows_aug = {row["worker_name"]: row for row in r.json() if row["worker_name"] == worker1}
            assert rows_aug[worker1]["total"] == 999.0
            assert rows_aug[worker1]["count"] == 1
        finally:
            for aid in seeded_a:
                auth_a.delete(f"{API}/advances/{aid}")
            for aid in seeded_b:
                auth_b.delete(f"{API}/advances/{aid}")

    def test_empty_month_returns_empty_list(self, auth_a):
        # Far future month with no data
        r = auth_a.get(f"{API}/advances/by-worker", params={"month": "2099-12"})
        assert r.status_code == 200
        assert r.json() == []
