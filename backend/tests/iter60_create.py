# Iter60: create TEST_ pratiche (avvolgibile molle/tubolare, sezionale, tapparella, scorrevole), 1 Solo CE, 1 Registro for user in /tmp/iter55_ui.json
import json, requests
ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
d = json.load(open("/tmp/iter55_ui.json"))
r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                  json={"email": d["email"], "password": "TestPassword123!", "returnSecureToken": True}).json()
h = {"Authorization": "Bearer " + r["idToken"]}
common = {"esito": "positivo", "n_radiocomandi": "2", "sicurezze": ["fotocellule", "coste", "rilevamento", "finecorsa"],
          "responsabile": "TEST_Resp", "comune": "Roma", "modello": "TEST_Mod", "motore": "Nice", "centralina": "C1",
          "anno_installazione": "2026", "larghezza": "3000", "altezza": "2500",
          "dm37": {"responsabile": "TEST_Mario", "tipo": "nuovo"}}
specs = [
    ("avv_molle", "avvolgibile", "privato", {"config_serranda": "molle", "schema": {"continuita_ohm": "0.15", "isolamento": "250", "tempo_diff": "22", "cavo": "FG160R16"}}),
    ("avv_tubolare", "avvolgibile", "condominiale", {"config_serranda": "tubolare"}),
    ("sezionale", "sezionale", "privato", {}),
    ("tapparella", "tapparella", "privato", {}),
    ("scorrevole", "scorrevole", "industriale", {}),
]
out = {}
for i, (key, tipo, uso, extra) in enumerate(specs):
    fields = {**common, "tipo_chiusura": tipo, "uso": uso, "comando_tipo": "impulsivo", "matricola": f"M60{i}", **extra}
    body = {"kind": "pratica", "cliente": f"TEST_Iter60 {key}", "indirizzo": "Via Test 1", "data": "2026-11-10", "fields": fields}
    x = requests.post(f"{BASE}/documenti", json=body, headers=h)
    out[key] = x.json().get("id"); print(x.status_code, key, out[key])
x = requests.post(f"{BASE}/documenti", json={"kind": "ce", "cliente": "TEST_Iter60 soloce", "indirizzo": "Via Test 3", "data": "2026-11-10", "fields": {"tipologia": "Serranda", "norma_riferimento": "UNI EN 13241"}}, headers=h)
out["ce"] = x.json().get("id"); print(x.status_code, "ce", out["ce"])
x = requests.post(f"{BASE}/documenti", json={"kind": "manutenzione", "cliente": "TEST_Iter60 reg", "indirizzo": "Via Test 4", "data": "2026-11-10", "fields": {"tipi": ["riparazione"], "descrizione": "TEST"}}, headers=h)
out["reg"] = x.json().get("id"); print(x.status_code, "reg", out["reg"])
json.dump(out, open("/tmp/iter60_ids.json", "w"))
