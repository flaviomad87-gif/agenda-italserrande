# Iter65 helper: sign in kept account, print token/uid, credito state, count data. Usage: python iter65_setup.py info|token|count
import json, sys, requests
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
EMAIL = "testuser+yr1777994990@italserrande.test"
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]

j = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                  json={"email": EMAIL, "password": "TestPassword123!", "returnSecureToken": True}).json()
tok, uid = j["idToken"], j["localId"]
if sys.argv[1] == "token":
    print(tok)
elif sys.argv[1] == "info":
    print("uid", uid)
    print("credito", requests.get(f"{BASE}/assistente/credito", headers={"Authorization": f"Bearer {tok}"}).json())
    print("ai_settings", mdb.ai_settings.find_one({"uid": uid}, {"_id": 0}))
elif sys.argv[1] == "count":
    for c in mdb.list_collection_names():
        n = mdb[c].count_documents({"$or": [{"user_id": uid}, {"uid": uid}]})
        if n:
            print(c, n)
