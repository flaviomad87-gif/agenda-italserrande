"""Iteration 19 — Employees & Time tracking (banca ore) backend tests.

Covers T1-T5 from the review request:
 T1 auto-seed of Alfonso Pomponio / Bruno Pucci on first GET /api/employees
 T2 employees CRUD + sort_order + delete does not remove historical time entries
 T3 POST /api/time-entries (+404 on unknown employee)
 T4 PUT /api/time-entries (clock_out), GET filters (?date, ?from_date&to_date)
 T5 user_id scoping between two users
 T12 worked-minutes / delta arithmetic replicated on the returned data
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


def _signup() -> str:
    email = f"testuser+i19{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    r = requests.post(SIGNUP_URL, json={"email": email, "password": PASSWORD, "returnSecureToken": True}, timeout=20)
    assert r.status_code == 200, f"Firebase signUp failed: {r.status_code} {r.text[:300]}"
    return r.json()["idToken"]


def _session(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_a():
    return _session(_signup())


@pytest.fixture(scope="module")
def auth_b():
    return _session(_signup())


# ---------- T1: auto-seed ----------

class TestSeedEmployees:
    def test_auth_required(self):
        r = requests.get(f"{API}/employees", timeout=20)
        assert r.status_code in (401, 403), r.text

    def test_first_get_seeds_two_employees(self, auth_a):
        r = auth_a.get(f"{API}/employees", timeout=30)
        assert r.status_code == 200, r.text
        emps = r.json()
        names = [e["name"] for e in emps]
        assert names == ["Alfonso Pomponio", "Bruno Pucci"], names
        for e in emps:
            assert e["daily_hours"] == 8
            assert e["active"] is True
            assert e["default_break_minutes"] == 60
            assert isinstance(e["id"], str) and e["id"]
            assert "_id" not in e

    def test_second_get_does_not_reseed(self, auth_a):
        r = auth_a.get(f"{API}/employees", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) == 2, r.json()


# ---------- T2: employees CRUD ----------

class TestEmployeeCrud:
    def test_create_update_delete(self, auth_a):
        before = auth_a.get(f"{API}/employees", timeout=30).json()
        max_sort = max(e.get("sort_order", 0) for e in before)

        r = auth_a.post(f"{API}/employees", json={"name": "TEST_Carlo Rossi", "daily_hours": 6}, timeout=30)
        assert r.status_code == 200, r.text
        emp = r.json()
        assert emp["name"] == "TEST_Carlo Rossi"
        assert emp["daily_hours"] == 6
        assert emp["sort_order"] == max_sort + 1
        emp_id = emp["id"]

        # persisted?
        listed = auth_a.get(f"{API}/employees", timeout=30).json()
        assert any(e["id"] == emp_id and e["daily_hours"] == 6 for e in listed)

        # update
        u = auth_a.put(f"{API}/employees/{emp_id}", json={"name": "TEST_Carlo Bianchi", "daily_hours": 7.5}, timeout=30)
        assert u.status_code == 200, u.text
        assert u.json()["name"] == "TEST_Carlo Bianchi"
        assert u.json()["daily_hours"] == 7.5
        listed = auth_a.get(f"{API}/employees", timeout=30).json()
        got = [e for e in listed if e["id"] == emp_id][0]
        assert got["name"] == "TEST_Carlo Bianchi" and got["daily_hours"] == 7.5

        # historical entry for this employee
        ent = auth_a.post(f"{API}/time-entries", json={
            "employee_id": emp_id, "date": "2027-03-10",
            "clock_in": "2027-03-10T08:00:00.000Z", "clock_out": "2027-03-10T17:00:00.000Z",
            "break_minutes": 60,
        }, timeout=30)
        assert ent.status_code == 200, ent.text
        entry_id = ent.json()["id"]

        # delete employee
        d = auth_a.delete(f"{API}/employees/{emp_id}", timeout=30)
        assert d.status_code == 200, d.text
        assert d.json().get("deleted") is True
        listed = auth_a.get(f"{API}/employees", timeout=30).json()
        assert all(e["id"] != emp_id for e in listed)

        # historical time entry survives
        ents = auth_a.get(f"{API}/time-entries?date=2027-03-10", timeout=30).json()
        assert any(e["id"] == entry_id for e in ents), "historical time entry was deleted with the employee"

        # cleanup
        auth_a.delete(f"{API}/time-entries/{entry_id}", timeout=30)

    def test_update_unknown_employee_404(self, auth_a):
        r = auth_a.put(f"{API}/employees/{uuid.uuid4()}", json={"name": "x"}, timeout=30)
        assert r.status_code == 404, r.status_code

    def test_delete_unknown_employee_404(self, auth_a):
        r = auth_a.delete(f"{API}/employees/{uuid.uuid4()}", timeout=30)
        assert r.status_code == 404, r.status_code

    def test_create_employee_missing_name_422(self, auth_a):
        r = auth_a.post(f"{API}/employees", json={"daily_hours": 8}, timeout=30)
        assert r.status_code == 422, r.status_code


# ---------- T3 / T4 / T12: time entries ----------

class TestTimeEntries:
    @pytest.fixture(scope="class")
    def emp_id(self, auth_a):
        return auth_a.get(f"{API}/employees", timeout=30).json()[0]["id"]

    @pytest.fixture(scope="class")
    def created(self):
        return []

    @pytest.fixture(scope="class", autouse=True)
    def cleanup(self, auth_a, created):
        yield
        for eid in created:
            auth_a.delete(f"{API}/time-entries/{eid}", timeout=30)

    def test_create_entry(self, auth_a, emp_id, created):
        r = auth_a.post(f"{API}/time-entries", json={
            "employee_id": emp_id, "date": "2027-04-01",
            "clock_in": "2027-04-01T08:00:00.000Z", "break_minutes": 60,
        }, timeout=30)
        assert r.status_code == 200, r.text
        e = r.json()
        created.append(e["id"])
        assert e["employee_id"] == emp_id
        assert e["date"] == "2027-04-01"
        assert e["clock_out"] is None
        assert e["break_minutes"] == 60
        assert "_id" not in e

    def test_create_entry_unknown_employee_404(self, auth_a):
        r = auth_a.post(f"{API}/time-entries", json={
            "employee_id": str(uuid.uuid4()), "date": "2027-04-01",
            "clock_in": "2027-04-01T08:00:00.000Z",
        }, timeout=30)
        assert r.status_code == 404, r.status_code

    def test_clock_out_via_put(self, auth_a, emp_id, created):
        entry_id = created[0]
        r = auth_a.put(f"{API}/time-entries/{entry_id}",
                       json={"clock_out": "2027-04-01T17:00:00.000Z"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["clock_out"] == "2027-04-01T17:00:00.000Z"
        # persisted
        got = auth_a.get(f"{API}/time-entries?date=2027-04-01", timeout=30).json()
        row = [x for x in got if x["id"] == entry_id][0]
        assert row["clock_out"] == "2027-04-01T17:00:00.000Z"
        assert row["clock_in"] == "2027-04-01T08:00:00.000Z"
        # T12: 9h - 60m break = 8h worked, delta 0 vs daily_hours 8
        worked = (17 - 8) * 60 - row["break_minutes"]
        assert worked == 480

    def test_put_unknown_entry_404(self, auth_a):
        r = auth_a.put(f"{API}/time-entries/{uuid.uuid4()}", json={"clock_out": "2027-04-01T17:00:00.000Z"}, timeout=30)
        assert r.status_code == 404

    def test_filter_by_date_and_range(self, auth_a, emp_id, created):
        for d, cin, cout in [
            ("2027-04-02", "2027-04-02T08:00:00.000Z", "2027-04-02T18:00:00.000Z"),  # 9h -> +1h
            ("2027-04-03", "2027-04-03T08:00:00.000Z", "2027-04-03T16:00:00.000Z"),  # 7h -> -1h
            ("2027-05-05", "2027-05-05T08:00:00.000Z", "2027-05-05T17:00:00.000Z"),  # other month
        ]:
            r = auth_a.post(f"{API}/time-entries", json={
                "employee_id": emp_id, "date": d, "clock_in": cin, "clock_out": cout, "break_minutes": 60,
            }, timeout=30)
            assert r.status_code == 200, r.text
            created.append(r.json()["id"])

        single = auth_a.get(f"{API}/time-entries?date=2027-04-02", timeout=30)
        assert single.status_code == 200
        assert [x["date"] for x in single.json()] == ["2027-04-02"]

        rng = auth_a.get(f"{API}/time-entries?from_date=2027-04-01&to_date=2027-04-30", timeout=30)
        assert rng.status_code == 200
        dates = sorted(x["date"] for x in rng.json())
        assert dates == ["2027-04-01", "2027-04-02", "2027-04-03"], dates

        by_emp = auth_a.get(f"{API}/time-entries?from_date=2027-04-01&to_date=2027-05-31&employee_id={emp_id}", timeout=30)
        assert by_emp.status_code == 200
        assert len(by_emp.json()) == 4
        assert all(x["employee_id"] == emp_id for x in by_emp.json())

        # T12 deltas computed from persisted data (daily 8h)
        rows = {x["date"]: x for x in rng.json()}

        def worked(x):
            h_in = int(x["clock_in"][11:13]); h_out = int(x["clock_out"][11:13])
            return (h_out - h_in) * 60 - x["break_minutes"]

        assert worked(rows["2027-04-02"]) - 480 == 60
        assert worked(rows["2027-04-03"]) - 480 == -60

    def test_delete_entry(self, auth_a, emp_id, created):
        r = auth_a.post(f"{API}/time-entries", json={
            "employee_id": emp_id, "date": "2027-04-20", "clock_in": "2027-04-20T09:00:00.000Z",
        }, timeout=30)
        entry_id = r.json()["id"]
        d = auth_a.delete(f"{API}/time-entries/{entry_id}", timeout=30)
        assert d.status_code == 200, d.text
        got = auth_a.get(f"{API}/time-entries?date=2027-04-20", timeout=30).json()
        assert all(x["id"] != entry_id for x in got)
        assert auth_a.delete(f"{API}/time-entries/{entry_id}", timeout=30).status_code == 404


# ---------- T5: user scoping ----------

class TestUserScoping:
    def test_users_do_not_see_each_other(self, auth_a, auth_b):
        a_emps = auth_a.get(f"{API}/employees", timeout=30).json()
        b_emps = auth_b.get(f"{API}/employees", timeout=30).json()
        a_ids = {e["id"] for e in a_emps}
        b_ids = {e["id"] for e in b_emps}
        assert a_ids.isdisjoint(b_ids), "employee ids shared between users"
        assert len(b_emps) == 2  # b gets its own seed

        # B creates an entry
        r = auth_b.post(f"{API}/time-entries", json={
            "employee_id": b_emps[0]["id"], "date": "2027-06-01",
            "clock_in": "2027-06-01T08:00:00.000Z", "clock_out": "2027-06-01T17:00:00.000Z",
        }, timeout=30)
        assert r.status_code == 200, r.text
        b_entry = r.json()["id"]

        a_view = auth_a.get(f"{API}/time-entries?date=2027-06-01", timeout=30).json()
        assert all(x["id"] != b_entry for x in a_view), "user A can see user B time entry"

        # A cannot mutate B's data
        assert auth_a.put(f"{API}/time-entries/{b_entry}", json={"break_minutes": 0}, timeout=30).status_code == 404
        assert auth_a.delete(f"{API}/time-entries/{b_entry}", timeout=30).status_code == 404
        assert auth_a.put(f"{API}/employees/{b_emps[0]['id']}", json={"name": "hack"}, timeout=30).status_code == 404
        assert auth_a.delete(f"{API}/employees/{b_emps[0]['id']}", timeout=30).status_code == 404

        auth_b.delete(f"{API}/time-entries/{b_entry}", timeout=30)

    def test_a_cannot_create_entry_for_b_employee(self, auth_a, auth_b):
        b_emp = auth_b.get(f"{API}/employees", timeout=30).json()[0]["id"]
        r = auth_a.post(f"{API}/time-entries", json={
            "employee_id": b_emp, "date": "2027-06-02", "clock_in": "2027-06-02T08:00:00.000Z",
        }, timeout=30)
        assert r.status_code == 404, r.status_code
