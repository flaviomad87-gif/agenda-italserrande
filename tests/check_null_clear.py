"""Verify: PUT /api/time-entries strips null fields, so clock_out cannot be cleared."""
import time
import uuid

import requests
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
KEY = env["REACT_APP_FIREBASE_API_KEY"]
BASE = env["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
email = f"nullcheck-{int(time.time())}{uuid.uuid4().hex[:4]}@italserrande.test"
tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
    json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}, timeout=20,
).json()["idToken"]
s = requests.Session()
s.headers.update({"Authorization": f"Bearer {tok}"})
emp = s.get(f"{BASE}/employees", timeout=30).json()[0]["id"]
e = s.post(f"{BASE}/time-entries", json={
    "employee_id": emp, "date": "2027-09-01",
    "clock_in": "2027-09-01T08:00:00.000Z", "clock_out": "2027-09-01T17:00:00.000Z",
}, timeout=30).json()
print("created:", e["clock_in"], e["clock_out"])
r = s.put(f"{BASE}/time-entries/{e['id']}", json={"clock_out": None, "clock_in": e["clock_in"]}, timeout=30)
print("PUT clock_out=None ->", r.status_code, r.json().get("clock_out"))
after = s.get(f"{BASE}/time-entries?date=2027-09-01", timeout=30).json()[0]
print("persisted clock_out after attempted clear:", after["clock_out"])
print("BUG" if after["clock_out"] else "OK cleared")
s.delete(f"{BASE}/time-entries/{e['id']}", timeout=30)
