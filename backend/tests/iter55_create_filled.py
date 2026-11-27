# Iter55: create a filled TEST_ pratica (regression of normal print) for the ephemeral user in /tmp/iter55_ui.json
import json, requests
ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
d = json.load(open("/tmp/iter55_ui.json"))
r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                  json={"email": d["email"], "password": "TestPassword123!", "returnSecureToken": True}).json()
h = {"Authorization": "Bearer " + r["idToken"]}
body = {"kind": "pratica", "cliente": "TEST_Cliente Iter55", "indirizzo": "Via Test 1", "data": "2026-11-10",
        "fields": {"tipo_chiusura": "avvolgibile", "esito": "positivo", "matricola": "M55", "uso": "privato",
                   "comando_tipo": "impulsivo", "n_radiocomandi": "2",
                   "sicurezze": ["fotocellule", "coste", "rilevamento"]}}
x = requests.post(f"{BASE}/documenti", json=body, headers=h)
print(x.status_code, x.json().get("id"), x.json().get("numero"))
