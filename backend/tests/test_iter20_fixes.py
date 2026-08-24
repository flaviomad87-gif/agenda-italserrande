"""Iteration 20 — retest of the 3 iter19 defect fixes (backend part).

RETEST 1: PUT /api/time-entries/{id} must accept explicit nulls so that
clock_out (and clock_in / notes) can be cleared.
Also re-checks employees PUT null-stripping behaviour (reported as minor in i19).
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
FIREBASE_API_KEY = os.environ.get("REACT_APP_FIREBASE_API_KEY") or _env.get("REACT_APP_FIREBASE_API_KEY")
SIGNUP_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
PASSWORD = "TestPassword123!"
DATE = "2027-03-11"


def _signup():
    email = f"testuser+i20{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    r = requests.post(SIGNUP_URL, json={"email": email, "password": PASSWORD, "returnSecureToken": True}, timeout=20)
    assert r.status_code == 200, f"Firebase signUp failed: {r.status_code} {r.text[:300]}"
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {_signup()}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def employee(auth):
    r = auth.get(f"{API}/employees", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()[0]


@pytest.fixture
def entry(auth, employee):
    """Create a full entry 08:00-18:00 and clean it up afterwards."""
    payload = {
        "employee_id": employee["id"],
        "date": DATE,
        "clock_in": f"{DATE}T08:00:00Z",
        "clock_out": f"{DATE}T18:00:00Z",
        "break_minutes": 60,
        "notes": "TEST_iter20",
    }
    r = auth.post(f"{API}/time-entries", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["clock_in"] is not None and e["clock_out"] is not None
    yield e
    auth.delete(f"{API}/time-entries/{e['id']}", timeout=30)


# ---------- RETEST 1 ----------

class TestClearClockOut:
    def test_put_null_clock_out_clears_value(self, auth, entry):
        r = auth.put(f"{API}/time-entries/{entry['id']}", json={"clock_out": None}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["clock_out"] is None, f"PUT response still has clock_out={body['clock_out']}"
        # clock_in must be untouched
        assert body["clock_in"] == entry["clock_in"]
        assert "_id" not in body

        g = auth.get(f"{API}/time-entries?date={DATE}", timeout=30)
        assert g.status_code == 200, g.text
        found = [x for x in g.json() if x["id"] == entry["id"]]
        assert len(found) == 1
        assert found[0]["clock_out"] is None, f"persisted clock_out={found[0]['clock_out']}"
        assert found[0]["clock_in"] == entry["clock_in"]

    def test_put_null_notes_and_clock_in(self, auth, entry):
        r = auth.put(f"{API}/time-entries/{entry['id']}", json={"notes": None, "clock_in": None}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["notes"] is None
        assert r.json()["clock_in"] is None
        g = auth.get(f"{API}/time-entries?date={DATE}", timeout=30)
        doc = [x for x in g.json() if x["id"] == entry["id"]][0]
        assert doc["clock_in"] is None and doc["notes"] is None

    def test_omitted_fields_are_not_touched(self, auth, entry):
        r = auth.put(f"{API}/time-entries/{entry['id']}", json={"break_minutes": 30}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["break_minutes"] == 30
        assert body["clock_in"] == entry["clock_in"]
        assert body["clock_out"] == entry["clock_out"]
        assert body["notes"] == "TEST_iter20"

    def test_reset_clock_out_after_clearing(self, auth, entry):
        auth.put(f"{API}/time-entries/{entry['id']}", json={"clock_out": None}, timeout=30)
        r = auth.put(f"{API}/time-entries/{entry['id']}", json={"clock_out": f"{DATE}T17:00:00Z"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["clock_out"] == f"{DATE}T17:00:00Z"
        g = auth.get(f"{API}/time-entries?date={DATE}", timeout=30)
        doc = [x for x in g.json() if x["id"] == entry["id"]][0]
        assert doc["clock_out"] == f"{DATE}T17:00:00Z"

    def test_put_unknown_entry_404(self, auth):
        r = auth.put(f"{API}/time-entries/does-not-exist", json={"clock_out": None}, timeout=30)
        assert r.status_code == 404, r.text


# ---------- employees PUT (rename fix is FE-side; verify API contract) ----------

class TestEmployeeUpdate:
    def test_rename_and_hours_persist(self, auth):
        c = auth.post(f"{API}/employees", json={"name": "TEST_i20 Emp", "daily_hours": 8}, timeout=30)
        assert c.status_code == 200, c.text
        emp = c.json()
        try:
            r = auth.put(f"{API}/employees/{emp['id']}", json={"name": "TEST_i20 Renamed"}, timeout=30)
            assert r.status_code == 200, r.text
            assert r.json()["name"] == "TEST_i20 Renamed"
            assert r.json()["daily_hours"] == 8

            r = auth.put(f"{API}/employees/{emp['id']}", json={"daily_hours": 6}, timeout=30)
            assert r.status_code == 200, r.text
            assert r.json()["daily_hours"] == 6
            assert r.json()["name"] == "TEST_i20 Renamed"

            lst = auth.get(f"{API}/employees", timeout=30).json()
            doc = [x for x in lst if x["id"] == emp["id"]][0]
            assert doc["name"] == "TEST_i20 Renamed" and doc["daily_hours"] == 6
        finally:
            auth.delete(f"{API}/employees/{emp['id']}", timeout=30)
