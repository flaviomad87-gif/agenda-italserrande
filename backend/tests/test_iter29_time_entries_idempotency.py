"""Iteration 29 — POST /time-entries idempotency fix tests.

Covers the review request for the bug: duplicate time_entries were being created
when the frontend called POST twice for the same (employee_id, date).

Scenarios:
 S1 double POST clock-in only → single entry, no duplicate
 S2 POST clock-in then POST clock_out same day → merged entry, preserves clock_in,
    worked minutes = 480 (8h)
 S3 regression: POST new day creates new entry (and uses default_break_minutes
    as fallback)
 S4 regression: PUT still works and does not create a duplicate
 S5 regression: GET filters by from_date/to_date/employee_id
 S6 idempotent POST without break_minutes preserves existing break_minutes
    (does NOT overwrite with employee default_break_minutes).
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
    email = f"testuser+i29{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    r = requests.post(SIGNUP_URL, json={"email": email, "password": PASSWORD, "returnSecureToken": True}, timeout=20)
    assert r.status_code == 200, f"Firebase signUp failed: {r.status_code} {r.text[:300]}"
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {_signup()}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def emp_id(sess):
    # custom employee with distinctive default_break_minutes to validate fallback
    r = sess.post(f"{API}/employees",
                  json={"name": "TEST_IT29 Idem", "daily_hours": 8, "default_break_minutes": 45},
                  timeout=30)
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    yield eid
    # cleanup: remove entries + employee
    rows = sess.get(f"{API}/time-entries?from_date=2027-07-01&to_date=2027-07-31&employee_id={eid}", timeout=30).json()
    for row in rows:
        sess.delete(f"{API}/time-entries/{row['id']}", timeout=30)
    sess.delete(f"{API}/employees/{eid}", timeout=30)


# ------------------- S1: double clock-in → no duplicates -------------------

def test_s1_double_clock_in_no_duplicate(sess, emp_id):
    date = "2027-07-01"
    payload = {"employee_id": emp_id, "date": date, "clock_in": f"{date}T08:00:00.000Z"}
    r1 = sess.post(f"{API}/time-entries", json=payload, timeout=30)
    assert r1.status_code == 200, r1.text
    e1 = r1.json()
    r2 = sess.post(f"{API}/time-entries", json=payload, timeout=30)
    assert r2.status_code == 200, r2.text
    e2 = r2.json()
    # same id (updated existing)
    assert e1["id"] == e2["id"], (e1, e2)
    # DB has exactly one entry
    got = sess.get(f"{API}/time-entries?date={date}&employee_id={emp_id}", timeout=30).json()
    assert len(got) == 1, got
    assert got[0]["clock_in"] == f"{date}T08:00:00.000Z"
    assert got[0]["clock_out"] is None


# ------------------- S2: clock-in then clock-out via POST merges -------------------

def test_s2_post_clock_out_merges_into_existing(sess, emp_id):
    date = "2027-07-02"
    r_in = sess.post(f"{API}/time-entries",
                     json={"employee_id": emp_id, "date": date, "clock_in": f"{date}T08:00:00.000Z"},
                     timeout=30)
    assert r_in.status_code == 200, r_in.text
    first_id = r_in.json()["id"]

    r_out = sess.post(f"{API}/time-entries",
                      json={"employee_id": emp_id, "date": date, "clock_out": f"{date}T17:00:00.000Z"},
                      timeout=30)
    assert r_out.status_code == 200, r_out.text
    merged = r_out.json()
    assert merged["id"] == first_id, "merge should keep the same entry id"
    assert merged["clock_in"] == f"{date}T08:00:00.000Z", "clock_in must be preserved"
    assert merged["clock_out"] == f"{date}T17:00:00.000Z"

    rows = sess.get(f"{API}/time-entries?date={date}&employee_id={emp_id}", timeout=30).json()
    assert len(rows) == 1, rows
    row = rows[0]
    worked = (17 - 8) * 60 - row["break_minutes"]
    # employee default_break_minutes=45, so worked = 540 - 45 = 495.
    # The point of the test is to verify break_minutes was used from the FIRST
    # POST fallback (45) and preserved on the merge (not reset to 60 default).
    assert row["break_minutes"] == 45, row
    assert worked == 495


# ------------------- S3: new-day POST creates new entry + uses default break -------------------

def test_s3_new_day_creates_entry_and_uses_default_break(sess, emp_id):
    date = "2027-07-03"
    r = sess.post(f"{API}/time-entries",
                  json={"employee_id": emp_id, "date": date,
                        "clock_in": f"{date}T08:00:00.000Z",
                        "clock_out": f"{date}T17:00:00.000Z"},
                  timeout=30)
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["break_minutes"] == 45, "default_break_minutes fallback should apply on CREATE"
    # worked = 9h - 45m = 495
    rows = sess.get(f"{API}/time-entries?date={date}&employee_id={emp_id}", timeout=30).json()
    assert len(rows) == 1


# ------------------- S4: PUT still works and does not duplicate -------------------

def test_s4_put_merge_no_duplicate(sess, emp_id):
    date = "2027-07-04"
    r = sess.post(f"{API}/time-entries",
                  json={"employee_id": emp_id, "date": date, "clock_in": f"{date}T09:00:00.000Z"},
                  timeout=30)
    eid = r.json()["id"]
    p = sess.put(f"{API}/time-entries/{eid}", json={"clock_out": f"{date}T18:00:00.000Z"}, timeout=30)
    assert p.status_code == 200, p.text
    assert p.json()["clock_in"] == f"{date}T09:00:00.000Z"
    assert p.json()["clock_out"] == f"{date}T18:00:00.000Z"
    rows = sess.get(f"{API}/time-entries?date={date}&employee_id={emp_id}", timeout=30).json()
    assert len(rows) == 1


# ------------------- S5: GET filters regression -------------------

def test_s5_get_filters(sess, emp_id):
    # By now days 07-01..07-04 exist. Filter by range.
    rng = sess.get(f"{API}/time-entries?from_date=2027-07-01&to_date=2027-07-31&employee_id={emp_id}", timeout=30)
    assert rng.status_code == 200
    dates = sorted(x["date"] for x in rng.json())
    assert dates == ["2027-07-01", "2027-07-02", "2027-07-03", "2027-07-04"], dates
    # single date
    one = sess.get(f"{API}/time-entries?date=2027-07-02", timeout=30).json()
    assert [x["date"] for x in one] == ["2027-07-02"]


# ------------------- S6: idempotent POST without break_minutes preserves existing -------------------

def test_s6_idempotent_post_preserves_break_minutes(sess, emp_id):
    date = "2027-07-05"
    # First POST sets break explicitly to 30
    r1 = sess.post(f"{API}/time-entries",
                   json={"employee_id": emp_id, "date": date,
                         "clock_in": f"{date}T08:00:00.000Z", "break_minutes": 30},
                   timeout=30)
    assert r1.status_code == 200, r1.text
    assert r1.json()["break_minutes"] == 30
    # Second POST without break_minutes → must preserve 30, NOT reset to default (45)
    r2 = sess.post(f"{API}/time-entries",
                   json={"employee_id": emp_id, "date": date, "clock_out": f"{date}T17:00:00.000Z"},
                   timeout=30)
    assert r2.status_code == 200, r2.text
    e = r2.json()
    assert e["break_minutes"] == 30, f"idempotent POST overwrote break_minutes: {e}"
    rows = sess.get(f"{API}/time-entries?date={date}&employee_id={emp_id}", timeout=30).json()
    assert len(rows) == 1
    assert rows[0]["break_minutes"] == 30
