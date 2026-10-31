import json, time, uuid, requests
from dotenv import dotenv_values
env = dotenv_values("/app/frontend/.env")
KEY = env["REACT_APP_FIREBASE_API_KEY"]; API = env["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
email = f"testuser+i32ui{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                  json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}).json()
h = {"Authorization": f"Bearer {r['idToken']}"}
c = requests.post(f"{API}/clients", headers=h, json={"date": "2027-03-10", "name": "TEST_Cliente Rilievo",
                  "address": "Via Roma 1, Milano", "pending": True}).json()
out = {"email": email, "password": "TestPassword123!", "token": r["idToken"], "client_id": c.get("id"), "client": c}
json.dump(out, open("/tmp/iter32_seed.json", "w"))
print(json.dumps(out)[:600])
