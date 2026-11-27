# Iter49 UI setup/cleanup: ephemeral Firebase user + one "old style" pratica (no sito/componenti). Usage: python iter49_ui_setup.py setup|cleanup
import json, sys, uuid, requests
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
F = "/tmp/iter49_ui.json"

if sys.argv[1] == "setup":
    email = f"testuser+iter49ui{uuid.uuid4().hex[:8]}@italserrande.test"
    j = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}).json()
    h = {"Authorization": "Bearer " + j["idToken"]}
    old = {"kind": "pratica", "cliente": "TEST_OLD Pratica", "indirizzo": "Via Vecchia 1", "data": "2026-06-10",
           "fields": {"tipo_chiusura": "sezionale", "sicurezze": ["fotocellule"], "comando_tipo": "impulsivo", "esito": "positivo",
                      "modello": "SEZ-1", "motore": "Nice", "centralina": "Nice MC", "n_radiocomandi": "2",
                      "includi": {"ce": True, "collaudo": True, "rischi": True, "manuale": True, "dm37": True, "registro": True, "targhetta": True}}}
    r = requests.post(f"{BASE}/documenti", headers=h, json=old)
    print("old pratica", r.status_code, r.text[:200])
    d = {"email": email, "uid": j["localId"], "tok": j["idToken"], "old_id": r.json().get("id")}
    json.dump(d, open(F, "w"))
    print(json.dumps(d))
else:
    d = json.load(open(F))
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                      json={"email": d["email"], "password": "TestPassword123!", "returnSecureToken": True}).json()
    h = {"Authorization": "Bearer " + r["idToken"]}
    docs = requests.get(f"{BASE}/documenti", headers=h).json()
    for x in docs if isinstance(docs, list) else []:
        print("delete", x["id"], requests.delete(f"{BASE}/documenti/{x['id']}", headers=h).status_code)
    for c in ("documenti", "clients", "photos"):
        print(c, mdb[c].delete_many({"user_id": d["uid"]}).deleted_count)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": r["idToken"]})
    print("cleaned", d["uid"])
