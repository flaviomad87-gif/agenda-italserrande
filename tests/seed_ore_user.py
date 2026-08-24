"""Create an ephemeral Firebase user for iteration 19 frontend testing."""
import json
import time
import uuid

import requests
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
KEY = env["REACT_APP_FIREBASE_API_KEY"]
BASE = env["REACT_APP_BACKEND_URL"].rstrip("/")
PASSWORD = "TestPassword123!"
email = f"ore-iter19-{int(time.time())}{uuid.uuid4().hex[:4]}@italserrande.test"

r = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
    json={"email": email, "password": PASSWORD, "returnSecureToken": True}, timeout=20,
)
r.raise_for_status()
token = r.json()["idToken"]
out = {"email": email, "password": PASSWORD, "base_url": BASE}
with open("/app/test_reports/ore_seed_result.json", "w") as fh:
    json.dump(out, fh, indent=2)
print(json.dumps(out, indent=2))
print("employees:", requests.get(f"{BASE}/api/employees", headers={"Authorization": f"Bearer {token}"}, timeout=30).json())
