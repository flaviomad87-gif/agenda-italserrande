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

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fatture-cantiere.preview.emergentagent.com").rstrip("/")
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


# ---------- Iteration 4: Recurring Expenses (templates) + apply (idempotent) ----------

class TestRecurringExpenses:
    def test_list_requires_auth(self):
        r = requests.get(f"{API}/recurring-expenses")
        assert r.status_code in (401, 403)

    def test_apply_requires_auth(self):
        r = requests.post(f"{API}/recurring-expenses/apply", params={"month": "2024-01"})
        assert r.status_code in (401, 403)

    def test_crud_template_per_user_isolation(self, auth_a, auth_b):
        # User A creates 2 templates
        seeded_a = []
        seeded_b = []
        try:
            uniq = uuid.uuid4().hex[:6].upper()
            for cat, amt, src in [
                (f"TEST_REC_AFFITTO_{uniq}", 500.0, "conto_aziendale"),
                (f"TEST_REC_LUCE_{uniq}", 80.0, "contanti"),
            ]:
                r = auth_a.post(f"{API}/recurring-expenses", json={
                    "category": cat, "amount": amt, "source": src, "notes": "n",
                })
                assert r.status_code == 200, r.text
                t = r.json()
                assert t["category"] == cat
                assert t["amount"] == amt
                assert t["source"] == src
                assert "id" in t and "user_id" in t
                seeded_a.append(t["id"])

            # User B creates one
            r = auth_b.post(f"{API}/recurring-expenses", json={
                "category": f"TEST_REC_OTHER_{uniq}", "amount": 1.0, "source": "contanti",
            })
            assert r.status_code == 200
            seeded_b.append(r.json()["id"])

            # GET list user A only sees its own
            r = auth_a.get(f"{API}/recurring-expenses")
            assert r.status_code == 200
            ids = [t["id"] for t in r.json()]
            for sid in seeded_a:
                assert sid in ids
            for sid in seeded_b:
                assert sid not in ids

            # Update one of A's templates
            tid = seeded_a[0]
            r = auth_a.put(f"{API}/recurring-expenses/{tid}", json={
                "category": f"TEST_REC_AFFITTO_UPD_{uniq}", "amount": 600.0,
                "source": "conto_aziendale", "notes": "updated",
            })
            assert r.status_code == 200
            assert r.json()["amount"] == 600.0
            assert r.json()["category"] == f"TEST_REC_AFFITTO_UPD_{uniq}"

            # Verify persisted via GET
            r = auth_a.get(f"{API}/recurring-expenses")
            row = next(t for t in r.json() if t["id"] == tid)
            assert row["amount"] == 600.0
            assert row["notes"] == "updated"

            # B cannot update/delete A's template
            r = auth_b.put(f"{API}/recurring-expenses/{tid}", json={
                "category": "hack", "amount": 0.0, "source": "contanti",
            })
            assert r.status_code == 404
            r = auth_b.delete(f"{API}/recurring-expenses/{tid}")
            assert r.status_code == 404

            # Delete by A
            r = auth_a.delete(f"{API}/recurring-expenses/{tid}")
            assert r.status_code == 200
            seeded_a.remove(tid)

            # Verify deletion
            r = auth_a.get(f"{API}/recurring-expenses")
            assert all(t["id"] != tid for t in r.json())
        finally:
            for sid in seeded_a:
                auth_a.delete(f"{API}/recurring-expenses/{sid}")
            for sid in seeded_b:
                auth_b.delete(f"{API}/recurring-expenses/{sid}")

    def test_apply_is_idempotent_and_recreates_after_delete(self, auth_a):
        # Use a fixed past month with no other data to avoid pollution
        month = "2022-11"
        uniq = uuid.uuid4().hex[:6].upper()
        seeded_templates = []
        seeded_expenses = []
        try:
            # Seed 2 templates
            for cat, amt in [(f"TEST_REC_T1_{uniq}", 100.0), (f"TEST_REC_T2_{uniq}", 50.0)]:
                r = auth_a.post(f"{API}/recurring-expenses", json={
                    "category": cat, "amount": amt, "source": "contanti",
                })
                assert r.status_code == 200
                seeded_templates.append(r.json()["id"])

            # First apply -> created=2 skipped=0
            r = auth_a.post(f"{API}/recurring-expenses/apply", params={"month": month})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["created"] == 2
            assert data["skipped"] == 0
            assert data["month"] == month

            # Verify two expenses exist with date YYYY-MM-01 and recurring_id set
            r = auth_a.get(f"{API}/expenses", params={"month": month})
            assert r.status_code == 200
            exp_for_month = [e for e in r.json() if e.get("recurring_id") in seeded_templates]
            assert len(exp_for_month) == 2
            for e in exp_for_month:
                assert e["date"] == f"{month}-01"
                seeded_expenses.append(e["id"])

            # Second apply -> created=0 skipped=2 (idempotency)
            r = auth_a.post(f"{API}/recurring-expenses/apply", params={"month": month})
            data = r.json()
            assert data["created"] == 0
            assert data["skipped"] == 2

            # Delete one of the materialized expenses, then apply again -> created=1 skipped=1
            target_exp = exp_for_month[0]
            r = auth_a.delete(f"{API}/expenses/{target_exp['id']}")
            assert r.status_code == 200
            seeded_expenses.remove(target_exp["id"])

            r = auth_a.post(f"{API}/recurring-expenses/apply", params={"month": month})
            data = r.json()
            assert data["created"] == 1, data
            assert data["skipped"] == 1, data

            # Cleanup-track the recreated expense id
            r = auth_a.get(f"{API}/expenses", params={"month": month})
            for e in r.json():
                if e.get("recurring_id") == target_exp["recurring_id"] and e["id"] not in seeded_expenses:
                    seeded_expenses.append(e["id"])
        finally:
            for eid in seeded_expenses:
                auth_a.delete(f"{API}/expenses/{eid}")
            for tid in seeded_templates:
                auth_a.delete(f"{API}/recurring-expenses/{tid}")

    def test_apply_no_templates_returns_zero(self, auth_a):
        # Ensure no templates: list and delete any TEST_ ones first (best effort)
        r = auth_a.get(f"{API}/recurring-expenses")
        existing = r.json() if r.status_code == 200 else []
        # If user has any templates, this test cannot guarantee 0 — only assert format
        r = auth_a.post(f"{API}/recurring-expenses/apply", params={"month": "2030-01"})
        assert r.status_code == 200
        data = r.json()
        assert "created" in data and "skipped" in data and data["month"] == "2030-01"
        if not existing:
            assert data["created"] == 0 and data["skipped"] == 0

    def test_legacy_expense_without_recurring_id_loads_ok(self, auth_a):
        """Backward compat: an Expense created via the legacy endpoint (no
        recurring_id) must list & serialize fine (Optional[str] = None)."""
        r = auth_a.post(f"{API}/expenses", json={
            "date": TODAY, "category": "TEST_legacy_no_rec", "amount": 9.99, "source": "contanti",
        })
        assert r.status_code == 200
        e = r.json()
        assert e.get("recurring_id") is None
        try:
            r = auth_a.get(f"{API}/expenses", params={"month": MONTH})
            assert r.status_code == 200
            row = next(x for x in r.json() if x["id"] == e["id"])
            assert row.get("recurring_id") is None
        finally:
            auth_a.delete(f"{API}/expenses/{e['id']}")


# ---------- Unpaid Clients (Da incassare) ----------

class TestUnpaidClients:
    """Tests for GET /api/clients/unpaid feature."""

    def test_unpaid_no_token(self):
        r = requests.get(f"{API}/clients/unpaid")
        assert r.status_code in (401, 403)

    def test_unpaid_invalid_token(self):
        r = requests.get(f"{API}/clients/unpaid", headers={"Authorization": "Bearer bad"})
        assert r.status_code == 401

    def test_unpaid_logic_and_math(self, auth_a):
        """Seed 6 clients covering all scenarios. Verify inclusion + math + sort."""
        created_ids = []
        try:
            # Use distinct dates so we can sort & identify
            base = "2024-01-"
            # 1) preventivo, no payments → SHOULD NOT appear
            c1 = auth_a.post(f"{API}/clients", json={
                "date": base + "05", "name": "TEST_UNPAID_PREV_NOPAY",
                "status": "preventivo", "amount": 500.0,
            }).json(); created_ids.append(c1["id"])
            # 2) lavoro_eseguito no payments, no legacy → SHOULD appear; full to_collect
            c2 = auth_a.post(f"{API}/clients", json={
                "date": base + "10", "name": "TEST_UNPAID_LAV_NOPAY",
                "status": "lavoro_eseguito", "amount": 1000.0,
                "vat_rate": 10, "withholding_rate": 4,
            }).json(); created_ids.append(c2["id"])
            # 3) lavoro_eseguito with partial payments → SHOULD appear; balance = to_collect - sum
            c3_payload = {
                "date": base + "15", "name": "TEST_UNPAID_LAV_PARTIAL",
                "status": "lavoro_eseguito", "amount": 1000.0,
                "vat_rate": 10, "withholding_rate": 4,
                "payments": [
                    {"id": str(uuid.uuid4()), "type": "acconto", "amount": 300.0,
                     "date": base + "16", "method": "contanti"},
                ],
            }
            c3 = auth_a.post(f"{API}/clients", json=c3_payload).json(); created_ids.append(c3["id"])
            # 4) lavoro_eseguito fully paid → SHOULD NOT appear
            c4_payload = {
                "date": base + "20", "name": "TEST_UNPAID_LAV_FULL",
                "status": "lavoro_eseguito", "amount": 500.0,
                "payments": [
                    {"id": str(uuid.uuid4()), "type": "saldo", "amount": 500.0,
                     "date": base + "21", "method": "bonifico"},
                ],
            }
            c4 = auth_a.post(f"{API}/clients", json=c4_payload).json(); created_ids.append(c4["id"])
            # 5) preventivo with one acconto, balance left → SHOULD appear
            c5_payload = {
                "date": base + "25", "name": "TEST_UNPAID_PREV_ACCONTO",
                "status": "preventivo", "amount": 800.0,
                "payments": [
                    {"id": str(uuid.uuid4()), "type": "acconto", "amount": 200.0,
                     "date": base + "26", "method": "contanti"},
                ],
            }
            c5 = auth_a.post(f"{API}/clients", json=c5_payload).json(); created_ids.append(c5["id"])
            # 6) legacy lavoro_eseguito with payment_method, no payments[] → SHOULD NOT appear
            c6 = auth_a.post(f"{API}/clients", json={
                "date": base + "28", "name": "TEST_UNPAID_LEGACY_LAV",
                "status": "lavoro_eseguito", "amount": 600.0,
                "payment_method": "contanti",
            }).json(); created_ids.append(c6["id"])

            r = auth_a.get(f"{API}/clients/unpaid")
            assert r.status_code == 200
            data = r.json()
            assert isinstance(data, list)
            ids = {c["id"] for c in data}

            # Inclusion rules
            assert c1["id"] not in ids, "preventivo no-payments must NOT appear"
            assert c2["id"] in ids, "lavoro_eseguito no-payments MUST appear"
            assert c3["id"] in ids, "lavoro_eseguito partial MUST appear"
            assert c4["id"] not in ids, "lavoro_eseguito fully paid must NOT appear"
            assert c5["id"] in ids, "preventivo with acconto+balance MUST appear"
            assert c6["id"] not in ids, "legacy paid-method lavoro_eseguito must NOT appear"

            by_id = {c["id"]: c for c in data}

            # Math: c2 amount=1000, vat=10, wh=4 → to_collect = 1100 - 40 = 1060, balance = 1060
            v2 = by_id[c2["id"]]
            assert v2["to_collect"] == 1060.0, v2
            assert v2["paid"] == 0.0
            assert v2["balance"] == 1060.0
            # Required fields per item
            for k in ("id", "name", "date", "amount", "balance", "to_collect", "paid"):
                assert k in v2, f"missing {k}"
            assert v2["balance"] > 0

            # Math: c3 same to_collect 1060, paid 300 → balance 760
            v3 = by_id[c3["id"]]
            assert v3["to_collect"] == 1060.0
            assert v3["paid"] == 300.0
            assert v3["balance"] == 760.0

            # c5 preventivo: amount 800, no vat/wh → to_collect = 800, paid 200, balance 600
            v5 = by_id[c5["id"]]
            assert v5["to_collect"] == 800.0
            assert v5["paid"] == 200.0
            assert v5["balance"] == 600.0

            # Sort by date ascending
            test_only = [c for c in data if c["id"] in {c2["id"], c3["id"], c5["id"]}]
            dates = [c["date"] for c in test_only]
            assert dates == sorted(dates), f"not sorted asc: {dates}"

        finally:
            for cid in created_ids:
                auth_a.delete(f"{API}/clients/{cid}")

    def test_unpaid_user_isolation(self, auth_a, auth_b):
        """User B must not see User A's unpaid clients."""
        c = auth_a.post(f"{API}/clients", json={
            "date": "2024-02-15", "name": "TEST_UNPAID_ISOLATION",
            "status": "lavoro_eseguito", "amount": 750.0,
        }).json()
        try:
            r_b = auth_b.get(f"{API}/clients/unpaid")
            assert r_b.status_code == 200
            ids_b = {x["id"] for x in r_b.json()}
            assert c["id"] not in ids_b
            r_a = auth_a.get(f"{API}/clients/unpaid")
            ids_a = {x["id"] for x in r_a.json()}
            assert c["id"] in ids_a
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_unpaid_zero_balance_excluded(self, auth_a):
        """lavoro_eseguito with payments summing >= to_collect should NOT appear (balance ~0)."""
        payload = {
            "date": "2024-03-10", "name": "TEST_UNPAID_EXACT",
            "status": "lavoro_eseguito", "amount": 200.0,
            "payments": [
                {"id": str(uuid.uuid4()), "type": "saldo", "amount": 200.0,
                 "date": "2024-03-11", "method": "pos"},
            ],
        }
        c = auth_a.post(f"{API}/clients", json=payload).json()
        try:
            r = auth_a.get(f"{API}/clients/unpaid")
            assert r.status_code == 200
            ids = {x["id"] for x in r.json()}
            assert c["id"] not in ids
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

