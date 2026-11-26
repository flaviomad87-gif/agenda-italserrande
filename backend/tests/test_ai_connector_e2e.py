"""Prova completa del collegamento assistente IA: scoperta OAuth, autorizzazione, MCP, refresh."""
import base64
import hashlib
import json
import os
import re
import secrets
from urllib.parse import parse_qs, urlparse

import requests

BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL=")][0]
EMAIL, PW = "layout.test.jun26@italserrande.test", "TestPassword123!"
CB = "https://claude.ai/api/mcp/auth_callback"


def step(n, ok, info=""):
    print(("OK  " if ok else "ERR ") + n, info)
    assert ok, n


r = requests.post(f"{BASE}/api/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
step("401 senza token", r.status_code == 401 and "resource_metadata" in r.headers.get("WWW-Authenticate", ""))
meta_url = re.search(r'resource_metadata="([^"]+)"', r.headers["WWW-Authenticate"]).group(1)
pr = requests.get(meta_url).json()
step("protected resource", pr["resource"].endswith("/api/mcp"), pr["authorization_servers"])
asm = requests.get(f"{pr['authorization_servers'][0]}/.well-known/oauth-authorization-server")
step("AS metadata root", asm.status_code == 200 and "json" in asm.headers.get("content-type", ""), asm.status_code)
asm = asm.json()
reg = requests.post(asm["registration_endpoint"], json={"client_name": "Claude", "redirect_uris": [CB]}).json()
cid = reg["client_id"]
ver = secrets.token_urlsafe(48)
chal = base64.urlsafe_b64encode(hashlib.sha256(ver.encode()).digest()).rstrip(b"=").decode()
p = {"response_type": "code", "client_id": cid, "redirect_uri": CB, "code_challenge": chal, "code_challenge_method": "S256", "state": "xyz", "scope": "agenda offline_access"}
page = requests.get(asm["authorization_endpoint"], params=p)
step("pagina login", page.status_code == 200 and "Autorizza" in page.text)
req = re.search(r'name="req" value="([^"]+)"', page.text).group(1)
bad = requests.post(asm["authorization_endpoint"], data={"req": req, "action": "allow", "email": EMAIL, "password": "sbagliata"}, allow_redirects=False)
step("password errata respinta", bad.status_code == 200 and "non corretti" in bad.text)
ok = requests.post(asm["authorization_endpoint"], data={"req": req, "action": "allow", "email": EMAIL, "password": PW}, allow_redirects=False)
loc = urlparse(ok.headers.get("location", ""))
q = parse_qs(loc.query)
step("redirect con code", ok.status_code == 302 and q.get("state") == ["xyz"] and "code" in q)
wrong = requests.post(asm["token_endpoint"], data={"grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": CB, "client_id": cid, "code_verifier": "x" * 50})
step("PKCE errato respinto", wrong.status_code == 400)
# il codice è monouso: dopo il tentativo errato serve un nuovo giro
page = requests.get(asm["authorization_endpoint"], params=p)
req = re.search(r'name="req" value="([^"]+)"', page.text).group(1)
ok = requests.post(asm["authorization_endpoint"], data={"req": req, "action": "allow", "email": EMAIL, "password": PW}, allow_redirects=False)
code = parse_qs(urlparse(ok.headers["location"]).query)["code"][0]
tok = requests.post(asm["token_endpoint"], data={"grant_type": "authorization_code", "code": code, "redirect_uri": CB, "client_id": cid, "code_verifier": ver}).json()
step("token", "access_token" in tok and "refresh_token" in tok)
H = {"Authorization": f"Bearer {tok['access_token']}"}


def rpc(method, params=None, rid=1):
    return requests.post(f"{BASE}/api/mcp", headers=H, json={"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}).json()


init = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t"}})
step("initialize", init["result"]["protocolVersion"] == "2025-06-18")
n = requests.post(f"{BASE}/api/mcp", headers=H, json={"jsonrpc": "2.0", "method": "notifications/initialized"})
step("notifica 202", n.status_code == 202)
tools = rpc("tools/list")["result"]["tools"]
step("tools/list", len(tools) == 14, [t["name"] for t in tools])


def call(name, args):
    res = rpc("tools/call", {"name": name, "arguments": args})["result"]
    return res, (json.loads(res["content"][0]["text"]) if not res.get("isError") and res["content"][0]["type"] == "text" else None)


res, out = call("crea_lavoro", {"nome": "TEST_AI Rossi Mario", "indirizzo": "Via Roma 1", "lista": "prossimi", "appuntamento": "2026-12-03T09:30", "note": "Serranda bloccata"})
step("crea_lavoro", out and out["creato"]["lista"] == "prossimi", out)
jid = out["creato"]["id"]
res, out = call("cerca_lavori", {"testo": "TEST_AI"})
step("cerca_lavori", any(l["id"] == jid for l in out["lavori"]))
res, out = call("agenda", {"dal": "2026-12-01", "al": "2026-12-05"})
step("agenda appuntamenti", any(l["id"] == jid for l in out["appuntamenti"]))
res, out = call("modifica_lavoro", {"id": jid, "sposta_in": "agenda", "data": "2026-12-04", "aggiungi_nota": "Portare molle", "importo": 350})
step("modifica_lavoro", out and out["aggiornato"]["lista"] == "agenda" and out["aggiornato"]["data"] == "2026-12-04", out)
res, out = call("registra_pagamento", {"id": jid, "importo": 100, "tipo": "acconto", "metodo": "contanti"})
step("registra_pagamento", out and out["aggiornato"]["incassato"] == 100)
res, out = call("registra_pagamento", {"id": jid, "importo": -5})
step("pagamento negativo = errore", res.get("isError") is True)
res, out = call("scheda_lavoro", {"id": jid})
step("scheda_lavoro", out and "Portare molle" in out["lavoro"]["note"])
res, out = call("prepara_preventivo", {"cliente": "test_ai rossi", "righe": ["Fornitura serranda avvolgibile", "Motore tubolare"], "lavoro_id": jid})
step("prepara_preventivo", out and out["bozza"])
for name, args in [("cerca_preventivi", {}), ("cerca_documenti", {}), ("contratti_manutenzione", {"solo_in_scadenza": True}), ("elenco_lavori", {"lista": "da_incassare"}), ("foto_lavoro", {"id": jid})]:
    res, out = call(name, args)
    step(name, not res.get("isError"), str(out)[:120])
res, out = call("scheda_lavoro", {"id": "inesistente"})
step("id inesistente = errore", res.get("isError") is True)
ref = requests.post(asm["token_endpoint"], data={"grant_type": "refresh_token", "refresh_token": tok["refresh_token"], "client_id": cid}).json()
step("refresh", "access_token" in ref)
old = requests.post(f"{BASE}/api/mcp", headers=H, json={"jsonrpc": "2.0", "id": 1, "method": "ping"})
step("vecchio token invalidato", old.status_code == 401)
H["Authorization"] = f"Bearer {ref['access_token']}"
step("nuovo token", "result" in rpc("ping"))
reuse = requests.post(asm["token_endpoint"], data={"grant_type": "refresh_token", "refresh_token": tok["refresh_token"], "client_id": cid})
step("refresh vecchio respinto", reuse.status_code == 400)
os.environ["AI_JOB_ID"] = jid
open("/tmp/ai_e2e.json", "w").write(json.dumps({"job": jid, "access": ref["access_token"]}))
print("TUTTO OK")
