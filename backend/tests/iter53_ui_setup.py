# Iter52 UI setup/cleanup: ephemeral Firebase user for Pratica retest. Usage: python iter52_ui_setup.py setup|cleanup
import json, sys, uuid, requests
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
F = "/tmp/iter53_ui.json"

if sys.argv[1] == "setup":
    email = f"testuser+iter53ui{uuid.uuid4().hex[:8]}@italserrande.test"
    j = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}).json()
    d = {"email": email, "uid": j["localId"]}
    json.dump(d, open(F, "w"))
    print(json.dumps(d))
elif sys.argv[1] == "dump":
    d = json.load(open(F))
    for x in mdb["documenti"].find({"user_id": d["uid"]}, {"_id": 0}):
        fl = x.get("fields", {})
        print(x.get("id"), x.get("cliente"), fl.get("tipo_chiusura"), fl.get("uso"), "sito" in fl, fl.get("responsabile"),
              fl.get("verifiche_consegna"), (fl.get("componenti") or {}).get("motoriduttore"))
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
