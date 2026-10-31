import json, time, uuid, requests
from dotenv import dotenv_values
env = dotenv_values("/app/frontend/.env")
KEY = env["REACT_APP_FIREBASE_API_KEY"]; API = env["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
email = f"testuser+i36ui{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                  json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}).json()
h = {"Authorization": f"Bearer {r['idToken']}"}
a = requests.post(f"{API}/clients", headers=h, json={"date": "2027-03-10", "name": "TEST_Linked", "pending": True,
                  "to_quote": True, "quote_ref": "abc", "quote_number": "021"}).json()
b = requests.post(f"{API}/clients", headers=h, json={"date": "2027-03-10", "name": "TEST_Plain", "pending": True,
                  "to_quote": True}).json()
out = {"email": email, "password": "TestPassword123!", "token": r["idToken"], "linked": a["id"], "plain": b["id"]}
json.dump(out, open("/tmp/iter36_seed.json", "w"))
print(json.dumps(out))
