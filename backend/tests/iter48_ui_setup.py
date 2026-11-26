# Iter48 UI setup/cleanup: ephemeral Firebase user + TEST_ jobs + one AI bozza. Usage: python iter48_ui_setup.py setup|cleanup
import json, sys, uuid, requests
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
F = "/tmp/iter48_ui.json"

if sys.argv[1] == "setup":
    email = f"testuser+iter48ui{uuid.uuid4().hex[:8]}@italserrande.test"
    j = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}).json()
    h = {"Authorization": "Bearer " + j["idToken"]}
    jobs = [requests.post(f"{BASE}/clients", headers=h, json={"name": n, "address": "Via Test 9", "phone": "0000000000", "date": "2026-12-01", "pending": True}).json()["id"]
            for n in ("TEST_UI Verdi", "TEST_UI Neri")]
    pid = uuid.uuid4().hex
    mdb.ai_proposte.insert_one({"id": pid, "uid": j["localId"], "stato": "da_approvare", "created_at": "2026-11-20T10:00:00+00:00",
                                "cliente": "TEST_UI VERDI", "indirizzo": "VIA TEST 9", "oggetto": "OFFERTA", "righe": ["Serranda 3x2"],
                                "note": "", "lavoro_id": None, "assistente": "test"})
    requests.put(f"{BASE}/assistente/credito", headers=h, json={"ricarica": 5, "soglia": 1, "azzera": True})
    d = {"email": email, "uid": j["localId"], "tok": j["idToken"], "jobs": jobs, "pid": pid}
    json.dump(d, open(F, "w"))
    print(json.dumps(d))
else:
    d = json.load(open(F))
    u = d["uid"]
    for c in ("clients", "quotes", "contratti", "quote_settings"):
        mdb[c].delete_many({"user_id": u})
    for c in ("ai_proposte", "ai_attivita", "ai_chats", "ai_settings", "ai_tokens"):
        mdb[c].delete_many({"uid": u})
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                      json={"email": d["email"], "password": "TestPassword123!", "returnSecureToken": True}).json()
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": r["idToken"]})
    print("cleaned", u)
