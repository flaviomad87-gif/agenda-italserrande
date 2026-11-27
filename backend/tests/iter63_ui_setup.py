# Iter63 full audit setup/cleanup: ephemeral Firebase user. Usage: python iter63_ui_setup.py setup|token|cleanup
import json, sys, uuid, requests
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
F = "/tmp/iter63_ui.json"
COLLS = ["advances", "ai_attivita", "ai_chats", "ai_proposte", "ai_settings", "clients", "contratti", "documenti",
         "documenti_counters", "employees", "expenses", "job_photos", "jobs", "materials", "photo_files",
         "quote_settings", "quotes", "recurring_expenses", "rilievi_sezionali", "time_entries"]


def signin(d):
    return requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                         json={"email": d["email"], "password": "TestPassword123!", "returnSecureToken": True}).json()


if sys.argv[1] == "setup":
    email = f"testuser+iter63ui{uuid.uuid4().hex[:8]}@italserrande.test"
    j = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}).json()
    d = {"email": email, "uid": j["localId"]}
    json.dump(d, open(F, "w"))
    print(json.dumps(d))
elif sys.argv[1] == "token":
    print(signin(json.load(open(F)))["idToken"])
elif sys.argv[1] == "count":
    d = json.load(open(F))
    for c in COLLS:
        n = mdb[c].count_documents({"user_id": d["uid"]})
        if n:
            print(c, n)
else:
    d = json.load(open(F))
    r = signin(d)
    for c in COLLS:
        print(c, mdb[c].delete_many({"user_id": d["uid"]}).deleted_count)
    for c in ("ai_chats", "ai_settings", "ai_proposte", "ai_attivita"):  # AI collections key on "uid"
        print(c, mdb[c].delete_many({"uid": d["uid"]}).deleted_count)
    if sys.argv[1] != "cleanup-keep":  # cleanup-keep: wipe data but keep the Firebase account (signUp rate limit)
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": r["idToken"]})
    print("cleaned", d["uid"])
