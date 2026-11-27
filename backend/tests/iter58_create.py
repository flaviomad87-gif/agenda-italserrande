# Iter58: create TEST_ pratiche (6 tipi + tapparella 2027 + minimal) and 2 verifiche for the ephemeral user in /tmp/iter55_ui.json
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
    ("tapparella", "tapparella", "condominiale", "impulsivo", "2026-11-10", {"intervento": "nuovo"}),
    ("tapparella27", "tapparella", "privato", "automatico", "2027-02-01", {}),
    ("avvolgibile", "avvolgibile", "pubblico", "automatico", "2026-11-10", {"intervento": "esistente", "modifiche": ["motore"], "modifica_sostanziale": "no"}),
    ("sezionale", "sezionale", "privato", "uomo_presente", "2026-11-10", {}),
    ("basculante", "basculante", "commerciale", "impulsivo", "2026-11-10", {"in_vista": "si"}),
    ("scorrevole", "scorrevole", "industriale", "impulsivo", "2026-11-10", {"in_vista": "no"}),
    ("battente", "battente", "privato", "automatico", "2027-03-01", {}),
]
out = {}
for i, (key, tipo, uso, cmd, data, extra) in enumerate(specs):
    fields = {**common, "tipo_chiusura": tipo, "uso": uso, "comando_tipo": cmd, "matricola": f"M58{i}", **extra}
    body = {"kind": "pratica", "cliente": f"TEST_Iter58 {key}", "indirizzo": "Via Test 1", "data": data, "fields": fields}
    x = requests.post(f"{BASE}/documenti", json=body, headers=h)
    out[key] = x.json().get("id"); print(x.status_code, key, out[key])
x = requests.post(f"{BASE}/documenti", json={"kind": "pratica", "cliente": "TEST_Iter58 minimo", "indirizzo": "", "data": "2026-11-10", "fields": {"tipo_chiusura": "sezionale"}}, headers=h)
out["minimo"] = x.json().get("id"); print(x.status_code, "minimo", out["minimo"])
for tipo in ("tapparella", "sezionale"):
    x = requests.post(f"{BASE}/documenti", json={"kind": "verifica", "cliente": f"TEST_Iter58 ver {tipo}", "indirizzo": "Via Test 2", "data": "2026-11-10",
                                                   "fields": {"tipo_chiusura": tipo, "esito": "non_conforme", "punti": {}, "note_punti": {}}}, headers=h)
    out[f"ver_{tipo}"] = x.json().get("id"); print(x.status_code, "ver", tipo, out[f"ver_{tipo}"])
json.dump(out, open("/tmp/iter58_ids.json", "w"))
