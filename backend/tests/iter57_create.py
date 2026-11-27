# Iter57: create TEST_ pratiche (6 tipi) for the ephemeral user in /tmp/iter55_ui.json; prints ids as JSON
import json, requests
ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
d = json.load(open("/tmp/iter55_ui.json"))
r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                  json={"email": d["email"], "password": "TestPassword123!", "returnSecureToken": True}).json()
h = {"Authorization": "Bearer " + r["idToken"]}
common = {"esito": "positivo", "n_radiocomandi": "2", "sicurezze": ["fotocellule", "coste", "rilevamento"],
          "cliente_tel": "0000000000", "cliente_cf": "TSTTST00A01H501X", "responsabile": "TEST_Resp",
          "chiusura": {"produttore": "TEST_Prod", "modello": "M1", "anno": "2020", "matricola": "CH1", "ante": "1", "peso": "80", "ce": "si"},
          "automazione": {"produttore": "Nice", "modello": "Run", "matricola": "AU1", "alimentazione": "230 Vac"},
          "consegna": {}}
specs = [
    ("tapparella", "condominiale", "impulsivo", {"intervento": "nuovo", "modifiche": ["motore", "sicurezze"], "modifica_sostanziale": "si"}),
    ("avvolgibile", "pubblico", "automatico", {"intervento": "esistente", "modifiche": ["motore"], "modifica_sostanziale": "no"}),
    ("sezionale", "privato", "uomo_presente", {}),
    ("basculante", "commerciale", "impulsivo", {"in_vista": "si"}),
    ("scorrevole", "industriale", "impulsivo", {"in_vista": "no"}),
    ("battente", "privato", "automatico", {}),
]
out = {}
for i, (tipo, uso, cmd, extra) in enumerate(specs):
    fields = {**common, "tipo_chiusura": tipo, "uso": uso, "comando_tipo": cmd, "matricola": f"M57{i}", **extra}
    body = {"kind": "pratica", "cliente": f"TEST_Iter57 {tipo}", "indirizzo": "Via Test 1", "data": "2026-11-10", "fields": fields}
    x = requests.post(f"{BASE}/documenti", json=body, headers=h)
    out[tipo] = x.json().get("id")
    print(x.status_code, tipo, out[tipo])
json.dump(out, open("/tmp/iter57_ids.json", "w"))
