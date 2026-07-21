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

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://questa-demo.preview.emergentagent.com").rstrip("/")
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
            # NEW FORMULA (iter13): balance = imponibile - spese - materials
            # (advances no longer subtracted; stipendio già in spese fisse)
            assert abs(s["balance"] - (s["total_imponibile"] - s["total_spese"] - s["total_materials"])) < 0.01
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



# ---------- Iteration 5: Materials (Spese fornitura per cliente) ----------

class TestMaterials:
    """Tests for per-client material expenses feature."""

    def test_create_client_with_materials_and_persistence(self, auth_a):
        payload = {
            "date": TODAY, "name": "TEST_MAT_PERSIST",
            "status": "lavoro_eseguito", "amount": 1000.0,
            "vat_rate": 10, "withholding_rate": 4,
            "materials": [
                {"description": "Tubolare 40x40", "amount": 300.0,
                 "supplier": "Ferramenta Rossi", "source": "contanti"},
                {"description": "Motore tapparella", "amount": 120.0,
                 "supplier": "ElettroX", "source": "conto_aziendale"},
            ],
        }
        r = auth_a.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        c = r.json()
        try:
            assert "materials" in c and len(c["materials"]) == 2
            assert c["materials"][0]["description"] == "Tubolare 40x40"
            assert c["materials"][0]["amount"] == 300.0
            assert c["materials"][0]["source"] == "contanti"
            # IDs auto-generated
            for m in c["materials"]:
                assert "id" in m and isinstance(m["id"], str) and len(m["id"]) > 0

            # GET to verify persistence
            r = auth_a.get(f"{API}/clients", params={"date": TODAY})
            row = next(x for x in r.json() if x["id"] == c["id"])
            assert len(row["materials"]) == 2
            assert sum(m["amount"] for m in row["materials"]) == 420.0
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_legacy_client_without_materials_field(self, auth_a):
        """Backward compat: client posted without materials must default to []."""
        r = auth_a.post(f"{API}/clients", json={
            "date": TODAY, "name": "TEST_MAT_LEGACY",
            "status": "preventivo", "amount": 100.0,
        })
        assert r.status_code == 200
        c = r.json()
        try:
            assert c.get("materials") == []
            r = auth_a.get(f"{API}/clients", params={"date": TODAY})
            row = next(x for x in r.json() if x["id"] == c["id"])
            assert row.get("materials") == []
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_update_client_add_remove_materials(self, auth_a):
        r = auth_a.post(f"{API}/clients", json={
            "date": TODAY, "name": "TEST_MAT_UPD",
            "status": "lavoro_eseguito", "amount": 500.0,
        })
        c = r.json()
        try:
            # Add 2 materials via PUT
            upd = {
                "date": TODAY, "name": "TEST_MAT_UPD",
                "status": "lavoro_eseguito", "amount": 500.0,
                "materials": [
                    {"description": "M1", "amount": 50.0, "source": "contanti"},
                    {"description": "M2", "amount": 70.0, "source": "conto_aziendale"},
                ],
            }
            r = auth_a.put(f"{API}/clients/{c['id']}", json=upd)
            assert r.status_code == 200
            assert len(r.json()["materials"]) == 2

            # Remove one (replace with single material)
            upd["materials"] = [{"description": "M2", "amount": 70.0, "source": "conto_aziendale"}]
            r = auth_a.put(f"{API}/clients/{c['id']}", json=upd)
            assert r.status_code == 200
            mats = r.json()["materials"]
            assert len(mats) == 1
            assert mats[0]["description"] == "M2"
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_material_zero_amount_with_description_persists(self, auth_a):
        r = auth_a.post(f"{API}/clients", json={
            "date": TODAY, "name": "TEST_MAT_ZERO",
            "status": "preventivo", "amount": 100.0,
            "materials": [{"description": "TBD", "amount": 0, "source": "conto_aziendale"}],
        })
        c = r.json()
        try:
            assert len(c["materials"]) == 1
            assert c["materials"][0]["amount"] == 0.0
            assert c["materials"][0]["description"] == "TBD"
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_material_invalid_or_missing_source_defaults(self, auth_a):
        """Missing source falls back to 'conto_aziendale' default. Pydantic
        rejects a literal-invalid source via 422."""
        # Missing source → default
        r = auth_a.post(f"{API}/clients", json={
            "date": TODAY, "name": "TEST_MAT_DEFSRC",
            "status": "preventivo", "amount": 100.0,
            "materials": [{"description": "no-source", "amount": 10.0}],
        })
        assert r.status_code == 200
        c = r.json()
        try:
            assert c["materials"][0]["source"] == "conto_aziendale"
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

        # Invalid source string → 422 from pydantic Literal validation
        r = auth_a.post(f"{API}/clients", json={
            "date": TODAY, "name": "TEST_MAT_BADSRC",
            "status": "preventivo", "amount": 100.0,
            "materials": [{"description": "bad", "amount": 5.0, "source": "carta"}],
        })
        # Either rejected (422) OR coerced to default — both acceptable per spec
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            cid = r.json()["id"]
            assert r.json()["materials"][0]["source"] == "conto_aziendale"
            auth_a.delete(f"{API}/clients/{cid}")

    def test_unpaid_returns_materials_total_and_expected_margin(self, auth_a):
        """Per spec: amount=1000, vat=10, wh=4, materials=[300,120] →
        materials_total=420, expected_margin=580 (=1000-420).
        balance still computed on to_collect (no payments → 1060)."""
        payload = {
            "date": "2024-04-10", "name": "TEST_MAT_UNPAID",
            "status": "lavoro_eseguito", "amount": 1000.0,
            "vat_rate": 10, "withholding_rate": 4,
            "materials": [
                {"description": "A", "amount": 300.0, "source": "contanti"},
                {"description": "B", "amount": 120.0, "source": "conto_aziendale"},
            ],
        }
        c = auth_a.post(f"{API}/clients", json=payload).json()
        try:
            r = auth_a.get(f"{API}/clients/unpaid")
            assert r.status_code == 200
            row = next(x for x in r.json() if x["id"] == c["id"])
            assert row["materials_total"] == 420.0
            assert row["expected_margin"] == 580.0
            assert row["to_collect"] == 1060.0
            assert row["balance"] == 1060.0
            assert row["paid"] == 0.0
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_summary_total_materials_and_by_source(self, auth_a):
        """Materials summary: clients of the month aggregated by source.
        Includes a saldato (legacy) lavoro_eseguito with materials → still counts."""
        seeded = []
        month = "2024-05"
        try:
            # Client 1: lavoro_eseguito with materials, legacy saldato (payment_method)
            c1 = auth_a.post(f"{API}/clients", json={
                "date": "2024-05-05", "name": "TEST_MAT_SUM1",
                "status": "lavoro_eseguito", "amount": 500.0, "payment_method": "contanti",
                "materials": [
                    {"description": "X1", "amount": 100.0, "source": "contanti"},
                    {"description": "X2", "amount": 50.0, "source": "conto_aziendale"},
                ],
            }).json()
            seeded.append(c1["id"])
            # Client 2: preventivo with materials — since iter15 fix, materials
            # of a pure preventivo (no payments, status != lavoro_eseguito) are
            # NOT summed into total_materials nor materials_by_source (they'd
            # penalise the monthly balance with costs of unexecuted jobs).
            c2 = auth_a.post(f"{API}/clients", json={
                "date": "2024-05-12", "name": "TEST_MAT_SUM2",
                "status": "preventivo", "amount": 800.0,
                "materials": [
                    {"description": "Y1", "amount": 200.0, "source": "conto_aziendale"},
                ],
            }).json()
            seeded.append(c2["id"])
            # Client 3 different month should NOT count
            c3 = auth_a.post(f"{API}/clients", json={
                "date": "2024-06-01", "name": "TEST_MAT_OTHER_MONTH",
                "status": "preventivo", "amount": 100.0,
                "materials": [{"description": "Z", "amount": 999.0, "source": "contanti"}],
            }).json()
            seeded.append(c3["id"])

            r = auth_a.get(f"{API}/summary", params={"month": month})
            assert r.status_code == 200, r.text
            s = r.json()
            assert "total_materials" in s
            assert "materials_by_source" in s
            assert s["total_materials"] >= 150.0  # 100+50 (preventivo 200 excluded by iter15 fix)
            assert s["materials_by_source"]["contanti"] >= 100.0
            assert s["materials_by_source"]["conto_aziendale"] >= 50.0  # only executed (50); preventivo 200 excluded

            # 999 from June not in May, preventivo 200 May excluded → strict upper bound
            assert s["total_materials"] < 350.0

            # balance formula: incassi - spese - advances - materials
            expected = (
                s["total_incassi"] - s["total_spese"]
                - s["total_advances"] - s["total_materials"]
            )
            assert abs(s["balance"] - expected) < 0.01
        finally:
            for cid in seeded:
                auth_a.delete(f"{API}/clients/{cid}")

    def test_summary_no_materials_legacy_clients_balance_unchanged(self, auth_a):
        """Pre-existing clients (no materials) → total_materials=0, balance unchanged."""
        c = auth_a.post(f"{API}/clients", json={
            "date": "2024-07-15", "name": "TEST_MAT_LEGACY_SUM",
            "status": "lavoro_eseguito", "amount": 100.0, "payment_method": "contanti",
        }).json()
        try:
            r = auth_a.get(f"{API}/summary", params={"month": "2024-07"})
            assert r.status_code == 200
            s = r.json()
            # If no other tests seeded, totals should reflect this client only
            assert s["total_materials"] == 0.0
            assert s["materials_by_source"] == {"contanti": 0.0, "conto_aziendale": 0.0}
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_materials_user_isolation(self, auth_a, auth_b):
        c = auth_a.post(f"{API}/clients", json={
            "date": "2024-08-10", "name": "TEST_MAT_ISO",
            "status": "lavoro_eseguito", "amount": 500.0,
            "materials": [{"description": "secret", "amount": 200.0, "source": "contanti"}],
        }).json()
        try:
            # B's summary for that month must NOT include A's materials
            r = auth_b.get(f"{API}/summary", params={"month": "2024-08"})
            assert r.status_code == 200
            sb = r.json()
            assert sb["total_materials"] == 0.0
            # B's unpaid must not include A's client
            r = auth_b.get(f"{API}/clients/unpaid")
            assert all(x["id"] != c["id"] for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_preventivo_with_materials_no_payments_not_in_unpaid(self, auth_a):
        """Edge case (a): preventivo with materials but no payments → NOT in unpaid."""
        c = auth_a.post(f"{API}/clients", json={
            "date": "2024-09-01", "name": "TEST_MAT_PREV_ONLY",
            "status": "preventivo", "amount": 500.0,
            "materials": [{"description": "tools", "amount": 100.0, "source": "contanti"}],
        }).json()
        try:
            r = auth_a.get(f"{API}/clients/unpaid")
            assert r.status_code == 200
            assert all(x["id"] != c["id"] for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")



# ---------- Iteration 6: Prossimi Lavori (pending backlog) ----------

class TestProssimiLavori:
    """Tests for pending=true backlog and execute endpoint."""

    def test_pending_list_requires_auth(self):
        r = requests.get(f"{API}/clients/pending")
        assert r.status_code in (401, 403)

    def test_execute_requires_auth(self):
        r = requests.post(f"{API}/clients/some-id/execute")
        assert r.status_code in (401, 403)

    def test_create_pending_client_persists_flag(self, auth_a):
        r = auth_a.post(f"{API}/clients", json={
            "date": "2025-12-15", "name": "TEST_PEND_CREATE",
            "status": "preventivo", "amount": 0.0, "pending": True,
        })
        assert r.status_code == 200
        c = r.json()
        try:
            assert c["pending"] is True
            # Should appear in /pending
            r = auth_a.get(f"{API}/clients/pending")
            assert r.status_code == 200
            ids = {x["id"] for x in r.json()}
            assert c["id"] in ids
            # Should NOT appear in date filter
            r = auth_a.get(f"{API}/clients", params={"date": "2025-12-15"})
            assert all(x["id"] != c["id"] for x in r.json())
            # Should NOT appear in month filter
            r = auth_a.get(f"{API}/clients", params={"month": "2025-12"})
            assert all(x["id"] != c["id"] for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_default_pending_is_false_backward_compat(self, auth_a):
        """Client posted without pending field → pending=False, appears in agenda."""
        r = auth_a.post(f"{API}/clients", json={
            "date": "2025-11-10", "name": "TEST_PEND_DEFAULT",
            "status": "preventivo", "amount": 0.0,
        })
        c = r.json()
        try:
            assert c.get("pending") is False
            # Appears in agenda
            r = auth_a.get(f"{API}/clients", params={"date": "2025-11-10"})
            assert any(x["id"] == c["id"] for x in r.json())
            # Does NOT appear in pending list
            r = auth_a.get(f"{API}/clients/pending")
            assert all(x["id"] != c["id"] for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_pending_sort_order_date_then_created_at(self, auth_a):
        """Pending list sorted by date asc, then created_at asc."""
        seeded = []
        try:
            uniq = uuid.uuid4().hex[:6].upper()
            for d in ["2026-03-15", "2026-01-10", "2026-02-05"]:
                r = auth_a.post(f"{API}/clients", json={
                    "date": d, "name": f"TEST_PEND_SORT_{uniq}_{d}",
                    "status": "preventivo", "amount": 0.0, "pending": True,
                })
                seeded.append(r.json()["id"])
            r = auth_a.get(f"{API}/clients/pending")
            ours = [x for x in r.json() if f"TEST_PEND_SORT_{uniq}" in x["name"]]
            assert len(ours) == 3
            dates = [x["date"] for x in ours]
            assert dates == sorted(dates), f"not asc: {dates}"
        finally:
            for cid in seeded:
                auth_a.delete(f"{API}/clients/{cid}")

    def test_execute_with_explicit_date_moves_to_agenda(self, auth_a):
        """Execute with date param sets pending=False and date=target."""
        r = auth_a.post(f"{API}/clients", json={
            "date": "2025-12-31", "name": "TEST_PEND_EXEC",
            "status": "preventivo", "amount": 200.0, "pending": True,
            "materials": [{"description": "tubo", "amount": 50.0, "source": "contanti"}],
            "payments": [{"id": str(uuid.uuid4()), "type": "acconto", "amount": 30.0,
                          "date": "2025-12-31", "method": "contanti"}],
        })
        c = r.json()
        try:
            target = "2025-10-20"
            r = auth_a.post(f"{API}/clients/{c['id']}/execute", params={"date": target})
            assert r.status_code == 200, r.text
            updated = r.json()
            assert updated["pending"] is False
            assert updated["date"] == target
            # Scheda preserved
            assert len(updated["materials"]) == 1
            assert updated["materials"][0]["description"] == "tubo"
            assert len(updated["payments"]) == 1
            assert updated["payments"][0]["amount"] == 30.0
            assert updated["amount"] == 200.0

            # Now appears in agenda for target date
            r = auth_a.get(f"{API}/clients", params={"date": target})
            assert any(x["id"] == c["id"] for x in r.json())
            # Disappears from pending
            r = auth_a.get(f"{API}/clients/pending")
            assert all(x["id"] != c["id"] for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_execute_without_date_defaults_today_utc(self, auth_a):
        r = auth_a.post(f"{API}/clients", json={
            "date": "2025-11-30", "name": "TEST_PEND_TODAY",
            "status": "preventivo", "amount": 0.0, "pending": True,
        })
        c = r.json()
        try:
            r = auth_a.post(f"{API}/clients/{c['id']}/execute")
            assert r.status_code == 200, r.text
            updated = r.json()
            today = datetime.utcnow().strftime("%Y-%m-%d")
            assert updated["date"] == today
            assert updated["pending"] is False
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_execute_404_when_not_pending(self, auth_a):
        """Already non-pending client cannot be re-executed."""
        r = auth_a.post(f"{API}/clients", json={
            "date": "2025-09-10", "name": "TEST_PEND_NOT_PEND",
            "status": "preventivo", "amount": 0.0, "pending": False,
        })
        c = r.json()
        try:
            r = auth_a.post(f"{API}/clients/{c['id']}/execute")
            assert r.status_code == 404
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_execute_404_for_nonexistent(self, auth_a):
        r = auth_a.post(f"{API}/clients/nonexistent-pend-xyz/execute")
        assert r.status_code == 404

    def test_pending_isolation_between_users(self, auth_a, auth_b):
        c = auth_a.post(f"{API}/clients", json={
            "date": "2025-08-01", "name": "TEST_PEND_ISO",
            "status": "preventivo", "amount": 0.0, "pending": True,
        }).json()
        try:
            # B cannot see in /pending
            r = auth_b.get(f"{API}/clients/pending")
            assert all(x["id"] != c["id"] for x in r.json())
            # B cannot execute A's pending client
            r = auth_b.post(f"{API}/clients/{c['id']}/execute")
            assert r.status_code == 404
            # A still sees it pending
            r = auth_a.get(f"{API}/clients/pending")
            assert any(x["id"] == c["id"] for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_unpaid_excludes_pending(self, auth_a):
        """Pending lavoro_eseguito with no payments must NOT appear in /unpaid."""
        c = auth_a.post(f"{API}/clients", json={
            "date": "2025-07-15", "name": "TEST_PEND_UNPAID",
            "status": "lavoro_eseguito", "amount": 500.0, "pending": True,
        }).json()
        try:
            r = auth_a.get(f"{API}/clients/unpaid")
            assert r.status_code == 200
            assert all(x["id"] != c["id"] for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_summary_excludes_pending(self, auth_a):
        """Pending clients must NOT count in summary totals."""
        seeded = []
        month = "2025-06"
        try:
            # Pending lavoro_eseguito with payment + materials → must NOT count
            cp = auth_a.post(f"{API}/clients", json={
                "date": "2025-06-10", "name": "TEST_PEND_SUM_PEND",
                "status": "lavoro_eseguito", "amount": 1000.0, "pending": True,
                "payment_method": "contanti",
                "materials": [{"description": "M", "amount": 200.0, "source": "contanti"}],
            }).json()
            seeded.append(cp["id"])
            # Non-pending with payment → counts
            cn = auth_a.post(f"{API}/clients", json={
                "date": "2025-06-12", "name": "TEST_PEND_SUM_NORMAL",
                "status": "lavoro_eseguito", "amount": 300.0,
                "payment_method": "contanti", "pending": False,
            }).json()
            seeded.append(cn["id"])
            r = auth_a.get(f"{API}/summary", params={"month": month})
            s = r.json()
            # The pending 1000 + 200 materials must NOT inflate
            assert s["incassi_by_method"]["contanti"] >= 300.0
            assert s["incassi_by_method"]["contanti"] < 1000.0  # pending excluded
            assert s["total_materials"] == 0.0  # only pending had materials
        finally:
            for cid in seeded:
                auth_a.delete(f"{API}/clients/{cid}")

    def test_round_trip_pending_to_agenda_preserves_scheda(self, auth_a):
        """Full round-trip with all scheda fields preserved."""
        payload = {
            "date": "2025-04-01", "name": "TEST_PEND_RT",
            "address": "Via Test 5", "phone": "1234567",
            "notes": "important", "status": "preventivo",
            "amount": 800.0, "vat_rate": 22, "withholding_rate": 4,
            "pending": True,
            "materials": [
                {"description": "Mat1", "amount": 100.0, "source": "contanti"},
                {"description": "Mat2", "amount": 50.0, "source": "conto_aziendale"},
            ],
            "payments": [
                {"id": str(uuid.uuid4()), "type": "acconto", "amount": 100.0,
                 "date": "2025-04-01", "method": "bonifico"},
            ],
        }
        c = auth_a.post(f"{API}/clients", json=payload).json()
        try:
            # Execute today
            r = auth_a.post(f"{API}/clients/{c['id']}/execute")
            assert r.status_code == 200
            u = r.json()
            assert u["pending"] is False
            assert u["address"] == "Via Test 5"
            assert u["phone"] == "1234567"
            assert u["notes"] == "important"
            assert u["amount"] == 800.0
            assert u["vat_rate"] == 22
            assert u["withholding_rate"] == 4
            assert len(u["materials"]) == 2
            assert sum(m["amount"] for m in u["materials"]) == 150.0
            assert len(u["payments"]) == 1
            assert u["payments"][0]["method"] == "bonifico"
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_search_may_include_pending(self, auth_a):
        """Spec: search MAY include pending clients (not enforced exclusion)."""
        uniq = uuid.uuid4().hex[:8].upper()
        c = auth_a.post(f"{API}/clients", json={
            "date": "2025-03-01", "name": f"TEST_PEND_SEARCH_{uniq}",
            "status": "preventivo", "amount": 0.0, "pending": True,
        }).json()
        try:
            r = auth_a.get(f"{API}/clients/search", params={"q": f"PEND_SEARCH_{uniq}"})
            assert r.status_code == 200
            ids = {x["id"] for x in r.json()}
            # Search includes pending (per spec)
            assert c["id"] in ids
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_toggle_pending_off_via_put_moves_to_agenda(self, auth_a):
        """PUT with pending=False moves backlog item to agenda for its date."""
        c = auth_a.post(f"{API}/clients", json={
            "date": "2025-02-20", "name": "TEST_PEND_TOGGLE",
            "status": "preventivo", "amount": 0.0, "pending": True,
        }).json()
        try:
            # Toggle off via PUT
            r = auth_a.put(f"{API}/clients/{c['id']}", json={
                "date": "2025-02-20", "name": "TEST_PEND_TOGGLE",
                "status": "preventivo", "amount": 0.0, "pending": False,
            })
            assert r.status_code == 200
            assert r.json()["pending"] is False
            # Now in agenda
            r = auth_a.get(f"{API}/clients", params={"date": "2025-02-20"})
            assert any(x["id"] == c["id"] for x in r.json())
            # Not in pending
            r = auth_a.get(f"{API}/clients/pending")
            assert all(x["id"] != c["id"] for x in r.json())
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")



# ---------- Iteration 7: GET /api/clients with from_date/to_date range ----------

class TestClientsRange:
    """list_clients now accepts ?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD (inclusive).
    Used by Agenda 'Settimana' (week view) which can span across two months."""

    def _mk(self, auth, date, name, pending=False, amount=100.0):
        r = auth.post(f"{API}/clients", json={
            "date": date, "name": name, "address": "", "phone": "", "notes": "",
            "status": "preventivo", "amount": amount, "pending": pending,
        })
        assert r.status_code == 200, r.text
        return r.json()

    def test_range_within_single_month(self, auth_a):
        created = []
        try:
            created.append(self._mk(auth_a, "2025-04-01", "TEST_RANGE_W1_A"))
            created.append(self._mk(auth_a, "2025-04-04", "TEST_RANGE_W1_B"))
            created.append(self._mk(auth_a, "2025-04-07", "TEST_RANGE_W1_C"))  # outside
            r = auth_a.get(f"{API}/clients", params={"from_date": "2025-04-01", "to_date": "2025-04-06"})
            assert r.status_code == 200
            ids = {c["id"] for c in r.json()}
            assert created[0]["id"] in ids
            assert created[1]["id"] in ids
            assert created[2]["id"] not in ids
        finally:
            for c in created:
                auth_a.delete(f"{API}/clients/{c['id']}")

    def test_range_spanning_two_months(self, auth_a):
        """Week Mar 31 – Apr 6 spans two months."""
        created = []
        try:
            created.append(self._mk(auth_a, "2025-03-30", "TEST_RANGE_W2_BEFORE"))  # outside
            created.append(self._mk(auth_a, "2025-03-31", "TEST_RANGE_W2_MON"))     # in
            created.append(self._mk(auth_a, "2025-04-02", "TEST_RANGE_W2_WED"))     # in
            created.append(self._mk(auth_a, "2025-04-06", "TEST_RANGE_W2_SUN"))     # in
            created.append(self._mk(auth_a, "2025-04-07", "TEST_RANGE_W2_AFTER"))   # outside
            r = auth_a.get(f"{API}/clients", params={"from_date": "2025-03-31", "to_date": "2025-04-06"})
            assert r.status_code == 200
            ids = {c["id"] for c in r.json()}
            assert created[1]["id"] in ids
            assert created[2]["id"] in ids
            assert created[3]["id"] in ids
            assert created[0]["id"] not in ids
            assert created[4]["id"] not in ids
        finally:
            for c in created:
                auth_a.delete(f"{API}/clients/{c['id']}")

    def test_range_excludes_pending(self, auth_a):
        created = []
        try:
            created.append(self._mk(auth_a, "2025-05-05", "TEST_RANGE_PEND_NORMAL"))
            created.append(self._mk(auth_a, "2025-05-06", "TEST_RANGE_PEND_BACKLOG", pending=True))
            r = auth_a.get(f"{API}/clients", params={"from_date": "2025-05-01", "to_date": "2025-05-11"})
            assert r.status_code == 200
            ids = {c["id"] for c in r.json()}
            assert created[0]["id"] in ids
            assert created[1]["id"] not in ids
        finally:
            for c in created:
                auth_a.delete(f"{API}/clients/{c['id']}")

    def test_date_param_takes_precedence_over_range(self, auth_a):
        created = []
        try:
            created.append(self._mk(auth_a, "2025-06-02", "TEST_RANGE_PREC_A"))
            created.append(self._mk(auth_a, "2025-06-03", "TEST_RANGE_PREC_B"))
            # Range covers both, but ?date= should win and return only 06-03
            r = auth_a.get(f"{API}/clients", params={
                "date": "2025-06-03", "from_date": "2025-06-01", "to_date": "2025-06-08",
            })
            assert r.status_code == 200
            ids = {c["id"] for c in r.json()}
            assert created[1]["id"] in ids
            assert created[0]["id"] not in ids
        finally:
            for c in created:
                auth_a.delete(f"{API}/clients/{c['id']}")

    def test_range_takes_precedence_over_month(self, auth_a):
        created = []
        try:
            created.append(self._mk(auth_a, "2025-07-15", "TEST_RANGE_VS_MONTH_IN"))
            created.append(self._mk(auth_a, "2025-07-25", "TEST_RANGE_VS_MONTH_OUT"))
            # month=2025-07 would return both; range narrows to 07-14..07-20
            r = auth_a.get(f"{API}/clients", params={
                "month": "2025-07", "from_date": "2025-07-14", "to_date": "2025-07-20",
            })
            assert r.status_code == 200
            ids = {c["id"] for c in r.json()}
            assert created[0]["id"] in ids
            assert created[1]["id"] not in ids
        finally:
            for c in created:
                auth_a.delete(f"{API}/clients/{c['id']}")

    def test_range_user_isolation(self, auth_a, auth_b):
        c_a = self._mk(auth_a, "2025-08-04", "TEST_RANGE_ISO_A")
        c_b = self._mk(auth_b, "2025-08-05", "TEST_RANGE_ISO_B")
        try:
            r = auth_a.get(f"{API}/clients", params={"from_date": "2025-08-01", "to_date": "2025-08-10"})
            assert r.status_code == 200
            ids_a = {c["id"] for c in r.json()}
            assert c_a["id"] in ids_a
            assert c_b["id"] not in ids_a
            r = auth_b.get(f"{API}/clients", params={"from_date": "2025-08-01", "to_date": "2025-08-10"})
            ids_b = {c["id"] for c in r.json()}
            assert c_b["id"] in ids_b
            assert c_a["id"] not in ids_b
        finally:
            auth_a.delete(f"{API}/clients/{c_a['id']}")
            auth_b.delete(f"{API}/clients/{c_b['id']}")



# ---------- Iteration 8: Idempotency keys for offline queue ----------

class TestIdempotency:
    """POST /api/clients|/expenses|/advances now accept Optional[str] id (idempotency key
    from the offline queue). Re-posting the same id for the same user must NOT create a
    duplicate; must return the existing record. Cross-user scope must be enforced."""

    def test_client_post_with_explicit_id_uses_that_id(self, auth_a):
        idem = str(uuid.uuid4())
        payload = {
            "id": idem, "date": TODAY, "name": "TEST_IDEMPO_C1",
            "status": "preventivo", "amount": 100.0,
        }
        try:
            r = auth_a.post(f"{API}/clients", json=payload)
            assert r.status_code == 200, r.text
            c = r.json()
            assert c["id"] == idem
            assert c["name"] == "TEST_IDEMPO_C1"
        finally:
            auth_a.delete(f"{API}/clients/{idem}")

    def test_client_post_without_id_still_generates_uuid(self, auth_a):
        payload = {"date": TODAY, "name": "TEST_IDEMPO_NOID",
                   "status": "preventivo", "amount": 0.0}
        r = auth_a.post(f"{API}/clients", json=payload)
        assert r.status_code == 200
        c = r.json()
        try:
            assert isinstance(c["id"], str) and len(c["id"]) >= 32
        finally:
            auth_a.delete(f"{API}/clients/{c['id']}")

    def test_client_repeat_post_same_id_idempotent(self, auth_a):
        idem = str(uuid.uuid4())
        payload = {
            "id": idem, "date": TODAY, "name": "TEST_IDEMPO_REPEAT",
            "status": "preventivo", "amount": 250.0,
        }
        try:
            r1 = auth_a.post(f"{API}/clients", json=payload)
            assert r1.status_code == 200
            # Second post with SAME id but different body → must return existing, not create new
            payload2 = dict(payload, name="TEST_IDEMPO_REPEAT_CHANGED", amount=999.0)
            r2 = auth_a.post(f"{API}/clients", json=payload2)
            assert r2.status_code == 200
            c2 = r2.json()
            # Idempotency: returns the original (not the modified payload)
            assert c2["id"] == idem
            assert c2["name"] == "TEST_IDEMPO_REPEAT"
            assert c2["amount"] == 250.0
            # Verify only ONE document exists for that date with that id
            r3 = auth_a.get(f"{API}/clients", params={"date": TODAY})
            assert r3.status_code == 200
            matches = [x for x in r3.json() if x["id"] == idem]
            assert len(matches) == 1
        finally:
            auth_a.delete(f"{API}/clients/{idem}")

    def test_expense_post_idempotent(self, auth_a):
        idem = str(uuid.uuid4())
        payload = {
            "id": idem, "date": TODAY, "category": "TEST_IDEMPO_EXP",
            "amount": 42.5, "source": "contanti",
        }
        try:
            r1 = auth_a.post(f"{API}/expenses", json=payload)
            assert r1.status_code == 200
            assert r1.json()["id"] == idem
            # Repeat
            r2 = auth_a.post(f"{API}/expenses", json=dict(payload, amount=999.0))
            assert r2.status_code == 200
            assert r2.json()["id"] == idem
            assert r2.json()["amount"] == 42.5  # original preserved
            # Confirm only one
            r3 = auth_a.get(f"{API}/expenses", params={"month": MONTH})
            matches = [x for x in r3.json() if x["id"] == idem]
            assert len(matches) == 1
        finally:
            auth_a.delete(f"{API}/expenses/{idem}")

    def test_advance_post_idempotent(self, auth_a):
        idem = str(uuid.uuid4())
        payload = {
            "id": idem, "date": TODAY, "worker_name": "TEST_IDEMPO_ADV",
            "amount": 75.0,
        }
        try:
            r1 = auth_a.post(f"{API}/advances", json=payload)
            assert r1.status_code == 200
            assert r1.json()["id"] == idem
            # Repeat
            r2 = auth_a.post(f"{API}/advances", json=dict(payload, amount=999.0))
            assert r2.status_code == 200
            assert r2.json()["id"] == idem
            assert r2.json()["amount"] == 75.0
            # Only one
            r3 = auth_a.get(f"{API}/advances", params={"date": TODAY})
            matches = [x for x in r3.json() if x["id"] == idem]
            assert len(matches) == 1
        finally:
            auth_a.delete(f"{API}/advances/{idem}")

    def test_idempotency_scoped_per_user(self, auth_a, auth_b):
        """User B posting the same id used by A must create a NEW record for B,
        not return A's. Idempotency check is scoped per user_id."""
        idem = str(uuid.uuid4())
        try:
            r_a = auth_a.post(f"{API}/clients", json={
                "id": idem, "date": TODAY, "name": "TEST_IDEMPO_SCOPE_A",
                "status": "preventivo", "amount": 100.0,
            })
            assert r_a.status_code == 200
            assert r_a.json()["name"] == "TEST_IDEMPO_SCOPE_A"

            r_b = auth_b.post(f"{API}/clients", json={
                "id": idem, "date": TODAY, "name": "TEST_IDEMPO_SCOPE_B",
                "status": "preventivo", "amount": 200.0,
            })
            assert r_b.status_code == 200
            # B's response is B's own client (NOT A's hijacked)
            assert r_b.json()["name"] == "TEST_IDEMPO_SCOPE_B"
            assert r_b.json()["id"] == idem  # they share id but isolated by user_id
            # User A still sees its original client
            r_a_get = auth_a.get(f"{API}/clients", params={"date": TODAY})
            a_match = [x for x in r_a_get.json() if x["id"] == idem]
            assert len(a_match) == 1
            assert a_match[0]["name"] == "TEST_IDEMPO_SCOPE_A"
        finally:
            auth_a.delete(f"{API}/clients/{idem}")
            auth_b.delete(f"{API}/clients/{idem}")

    def test_drain_replay_header_accepted(self, auth_a):
        """Backend must accept X-Drain-Replay: 1 header without rejecting."""
        idem = str(uuid.uuid4())
        try:
            r = auth_a.post(
                f"{API}/clients",
                json={"id": idem, "date": TODAY, "name": "TEST_IDEMPO_DRAIN",
                      "status": "preventivo", "amount": 0.0},
                headers={"X-Drain-Replay": "1"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["id"] == idem
        finally:
            auth_a.delete(f"{API}/clients/{idem}")



# ---------- Yearly Summary (NEW iteration 10) ----------

class TestYearlySummary:
    """Test GET /api/summary/year endpoint introduced for the Riepilogo 'Anno' tab."""

    def test_year_endpoint_shape(self, auth_a):
        """Endpoint returns expected structure with 12 month slots."""
        year = int(MONTH.split("-")[0])
        r = auth_a.get(f"{API}/summary/year", params={"year": year})
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["year", "months", "totals", "best_month", "worst_month"]:
            assert k in data, f"missing key {k}"
        assert data["year"] == year
        assert isinstance(data["months"], list)
        assert len(data["months"]) == 12
        # Each month entry must have monthly summary shape
        for i, m in enumerate(data["months"], start=1):
            assert m["month"] == f"{year:04d}-{i:02d}"
            for key in ["incassi_by_method", "total_incassi", "total_spese",
                        "total_advances", "total_materials", "balance", "counts"]:
                assert key in m, f"month {m['month']} missing {key}"
        # totals shape
        for key in ["total_incassi", "total_spese", "total_advances",
                    "total_materials", "balance"]:
            assert key in data["totals"]

    def test_year_empty_returns_nulls(self, auth_a):
        """A year with no activity at all → best_month/worst_month null, totals 0."""
        # Use a far past year unlikely to contain any user data
        r = auth_a.get(f"{API}/summary/year", params={"year": 1990})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["best_month"] is None
        assert data["worst_month"] is None
        assert data["totals"]["balance"] == 0
        assert data["totals"]["total_incassi"] == 0
        assert data["totals"]["total_spese"] == 0
        for m in data["months"]:
            assert m["balance"] == 0
            assert m["counts"]["clients"] == 0
            assert m["counts"]["expenses"] == 0
            assert m["counts"]["advances"] == 0

    def test_year_totals_match_sum_of_months(self, auth_a):
        """totals.balance == sum(months[i].balance) within rounding tolerance."""
        year_str, month_num = MONTH.split("-")
        year = int(year_str)
        seeded = {"clients": [], "expenses": [], "advances": []}
        try:
            r = auth_a.post(f"{API}/clients", json={
                "date": TODAY, "name": "TEST_year_sum",
                "status": "lavoro_eseguito", "payment_method": "contanti",
                "amount": 333.33,
            })
            seeded["clients"].append(r.json()["id"])
            r = auth_a.post(f"{API}/expenses", json={
                "date": TODAY, "category": "TEST_year_sum_exp",
                "amount": 11.11, "source": "contanti",
            })
            seeded["expenses"].append(r.json()["id"])
            r = auth_a.post(f"{API}/advances", json={
                "date": TODAY, "worker_name": "TEST_year_sum_w", "amount": 22.22,
            })
            seeded["advances"].append(r.json()["id"])

            r = auth_a.get(f"{API}/summary/year", params={"year": year})
            data = r.json()
            sum_balance = sum(m["balance"] for m in data["months"])
            assert abs(data["totals"]["balance"] - sum_balance) < 0.01
            sum_incassi = sum(m["total_incassi"] for m in data["months"])
            assert abs(data["totals"]["total_incassi"] - sum_incassi) < 0.01
            sum_spese = sum(m["total_spese"] for m in data["months"])
            assert abs(data["totals"]["total_spese"] - sum_spese) < 0.01
            # Current month (where seeds were inserted) has activity → best/worst not null
            current_month_key = MONTH
            assert data["best_month"] is not None
            assert data["worst_month"] is not None
            # The seeded month must be one of the active months (best or worst depending on signs)
            active_keys = [m["month"] for m in data["months"]
                           if m["counts"]["clients"] > 0 or m["counts"]["expenses"] > 0
                           or m["counts"]["advances"] > 0]
            assert current_month_key in active_keys
        finally:
            for cid in seeded["clients"]:
                auth_a.delete(f"{API}/clients/{cid}")
            for eid in seeded["expenses"]:
                auth_a.delete(f"{API}/expenses/{eid}")
            for aid in seeded["advances"]:
                auth_a.delete(f"{API}/advances/{aid}")

    def test_year_best_worst_excludes_empty_months(self, auth_a):
        """best_month/worst_month must be among months with at least one entity."""
        year = int(MONTH.split("-")[0])
        seeded = {"clients": []}
        try:
            r = auth_a.post(f"{API}/clients", json={
                "date": TODAY, "name": "TEST_year_bw",
                "status": "lavoro_eseguito", "payment_method": "contanti",
                "amount": 99.0,
            })
            seeded["clients"].append(r.json()["id"])
            r = auth_a.get(f"{API}/summary/year", params={"year": year})
            data = r.json()
            active_keys = [m["month"] for m in data["months"]
                           if m["counts"]["clients"] > 0 or m["counts"]["expenses"] > 0
                           or m["counts"]["advances"] > 0]
            assert data["best_month"] in active_keys
            assert data["worst_month"] in active_keys
        finally:
            for cid in seeded["clients"]:
                auth_a.delete(f"{API}/clients/{cid}")

    def test_year_user_isolation(self, auth_a, auth_b):
        """User B's year endpoint must NOT include user A's data."""
        year = int(MONTH.split("-")[0])
        seeded = {"clients": []}
        try:
            r = auth_a.post(f"{API}/clients", json={
                "date": TODAY, "name": "TEST_year_iso_A",
                "status": "lavoro_eseguito", "payment_method": "contanti",
                "amount": 777.0,
            })
            seeded["clients"].append(r.json()["id"])

            r_a = auth_a.get(f"{API}/summary/year", params={"year": year})
            r_b = auth_b.get(f"{API}/summary/year", params={"year": year})
            data_a = r_a.json()
            data_b = r_b.json()

            # User A's totals should include the 777 contanti
            assert data_a["totals"]["total_incassi"] >= 777.0
            # User B should NOT see this
            # (B may have other data from earlier tests, but its total_incassi
            #  should not include the 777 we just inserted for A)
            # Safest check: B's current-month total_incassi < 777 OR the difference shows isolation
            month_idx = int(MONTH.split("-")[1]) - 1
            b_month_incassi = data_b["months"][month_idx]["total_incassi"]
            a_month_incassi = data_a["months"][month_idx]["total_incassi"]
            assert a_month_incassi - b_month_incassi >= 776.99
        finally:
            for cid in seeded["clients"]:
                auth_a.delete(f"{API}/clients/{cid}")

    def test_year_unauth(self):
        """Endpoint requires authentication."""
        r = requests.get(f"{API}/summary/year", params={"year": 2025})
        assert r.status_code in (401, 403)
