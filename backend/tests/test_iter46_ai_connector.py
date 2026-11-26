# Iter46: AI connector - OAuth 2.1 (metadata, DCR, authorize page, PKCE, refresh rotation), MCP JSON-RPC tools,
# /api/assistente (stato, approva/scarta bozze, scollega), A/B isolation. Uses ephemeral Firebase users only.
import base64, hashlib, io, json, re, secrets, uuid
from urllib.parse import parse_qs, urlparse
import pytest, requests
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
ROOT = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/")
BASE = ROOT + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
CB = "https://claude.ai/api/mcp/auth_callback"
PW = "TestPassword123!"
from PIL import Image as _I
_b = io.BytesIO(); _I.new("RGB", (40, 30), (200, 50, 50)).save(_b, "PNG"); PNG = _b.getvalue()


class U:
    def __init__(self, tag):
        self.email = f"testuser+iter46{tag}{uuid.uuid4().hex[:8]}@italserrande.test"
        r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                          json={"email": self.email, "password": PW, "returnSecureToken": True})
        if r.status_code != 200:
            pytest.skip("firebase signup failed")
        j = r.json()
        self.tok, self.uid = j["idToken"], j["localId"]
        self.h = {"Authorization": "Bearer " + self.tok}
        self.access = None

    def req(self, m, path, **kw):
        return requests.request(m, BASE + path, headers=self.h, timeout=30, **kw)

    def rpc(self, method, params=None, rid=1, token=None):
        return requests.post(f"{BASE}/mcp", headers={"Authorization": f"Bearer {token or self.access}"},
                             json={"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}, timeout=60)

    def call(self, name, args):
        res = self.rpc("tools/call", {"name": name, "arguments": args})
        assert res.status_code == 200, res.text
        res = res.json()["result"]
        out = None
        if not res.get("isError") and res["content"][0]["type"] == "text":
            try:
                out = json.loads(res["content"][0]["text"])
            except Exception:
                out = res["content"][0]["text"]
        return res, out

    def job(self, jid):
        return mdb.clients.find_one({"id": jid, "user_id": self.uid}, {"_id": 0})

    def close(self):
        u = self.uid
        for c in ("clients", "quotes", "contratti", "quote_settings", "job_photos"):
            mdb[c].delete_many({"user_id": u})
        for c in ("ai_tokens", "ai_proposte", "ai_attivita"):
            mdb[c].delete_many({"uid": u})
        mdb.ai_oauth_codes.delete_many({"uid": u})
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": self.tok})


CLIENT_IDS = []


def register():
    r = requests.post(f"{BASE}/oauth/register", json={"client_name": "TEST_Claude", "redirect_uris": [CB]})
    assert r.status_code == 201, r.text
    CLIENT_IDS.append(r.json()["client_id"])
    return r.json()["client_id"]


def pkce():
    ver = secrets.token_urlsafe(48)
    return ver, base64.urlsafe_b64encode(hashlib.sha256(ver.encode()).digest()).rstrip(b"=").decode()


def auth_params(cid, chal, state="st1"):
    return {"response_type": "code", "client_id": cid, "redirect_uri": CB, "code_challenge": chal,
            "code_challenge_method": "S256", "state": state, "scope": "agenda offline_access"}


def get_code(cid, chal, email, state="st1"):
    page = requests.get(f"{BASE}/oauth/authorize", params=auth_params(cid, chal, state))
    req = re.search(r'name="req" value="([^"]+)"', page.text).group(1)
    ok = requests.post(f"{BASE}/oauth/authorize", data={"req": req, "action": "allow", "email": email, "password": PW}, allow_redirects=False)
    assert ok.status_code == 302, ok.text[:300]
    return parse_qs(urlparse(ok.headers["location"]).query)


def connect(u):
    cid = register()
    ver, chal = pkce()
    code = get_code(cid, chal, u.email)["code"][0]
    tok = requests.post(f"{BASE}/oauth/token", data={"grant_type": "authorization_code", "code": code, "redirect_uri": CB,
                                                    "client_id": cid, "code_verifier": ver}).json()
    u.access, u.refresh, u.cid = tok["access_token"], tok["refresh_token"], cid
    return tok


@pytest.fixture(scope="module")
def A():
    x = U("a"); connect(x); yield x; x.close()


@pytest.fixture(scope="module")
def B():
    x = U("b"); connect(x); yield x; x.close()


@pytest.fixture(scope="module", autouse=True)
def cleanup_clients():
    yield
    mdb.ai_clients.delete_many({"client_id": {"$in": CLIENT_IDS}})


# ---- Discovery / metadata
def test_mcp_401_with_metadata():
    r = requests.post(f"{BASE}/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    assert r.status_code == 401
    wa = r.headers.get("WWW-Authenticate", "")
    meta = re.search(r'resource_metadata="([^"]+)"', wa).group(1)
    pr = requests.get(meta)
    assert pr.status_code == 200 and pr.json()["resource"] == f"{ROOT}/api/mcp"
    assert pr.json()["authorization_servers"] == [ROOT]
    # bad bearer also 401
    assert requests.post(f"{BASE}/mcp", headers={"Authorization": "Bearer nope"}, json={}).status_code == 401


def test_well_known_root_and_api():
    for url in (f"{ROOT}/.well-known/oauth-authorization-server", f"{BASE}/.well-known/oauth-authorization-server",
                f"{ROOT}/.well-known/oauth-protected-resource", f"{ROOT}/.well-known/oauth-protected-resource/api/mcp",
                f"{ROOT}/.well-known/openid-configuration"):
        r = requests.get(url)
        assert r.status_code == 200 and "json" in r.headers.get("content-type", ""), url
    asm = requests.get(f"{ROOT}/.well-known/oauth-authorization-server").json()
    assert asm["token_endpoint"] == f"{ROOT}/api/oauth/token"
    assert asm["code_challenge_methods_supported"] == ["S256"]


def test_register_validation():
    assert requests.post(f"{BASE}/oauth/register", json={"redirect_uris": ["http://evil.com/cb"]}).status_code == 400
    assert requests.post(f"{BASE}/oauth/register", json={}).status_code == 400
    cid = register()
    assert isinstance(cid, str) and len(cid) > 10


# ---- Authorize page
def test_authorize_page_and_errors():
    cid = register()
    ver, chal = pkce()
    page = requests.get(f"{BASE}/oauth/authorize", params=auth_params(cid, chal))
    assert page.status_code == 200 and "Autorizza" in page.text and "TEST_Claude" in page.text
    assert requests.get(f"{BASE}/oauth/authorize", params={**auth_params(cid, chal), "client_id": "unknown"}).status_code == 400
    assert requests.get(f"{BASE}/oauth/authorize", params={**auth_params(cid, chal), "redirect_uri": "https://evil.com/cb"}).status_code == 400
    r = requests.get(f"{BASE}/oauth/authorize", params={**auth_params(cid, chal), "code_challenge_method": "plain"}, allow_redirects=False)
    assert r.status_code == 302 and "error=invalid_request" in r.headers["location"]


def test_authorize_wrong_password_and_deny(A):
    cid = register()
    ver, chal = pkce()
    page = requests.get(f"{BASE}/oauth/authorize", params=auth_params(cid, chal, "s-deny"))
    req = re.search(r'name="req" value="([^"]+)"', page.text).group(1)
    bad = requests.post(f"{BASE}/oauth/authorize", data={"req": req, "action": "allow", "email": A.email, "password": "sbagliata"}, allow_redirects=False)
    assert bad.status_code == 200 and "non corretti" in bad.text
    deny = requests.post(f"{BASE}/oauth/authorize", data={"req": req, "action": "deny"}, allow_redirects=False)
    assert deny.status_code == 302
    q = parse_qs(urlparse(deny.headers["location"]).query)
    assert q["error"] == ["access_denied"] and q["state"] == ["s-deny"]
    assert deny.headers["location"].startswith(CB)
    # req consumed
    again = requests.post(f"{BASE}/oauth/authorize", data={"req": req, "action": "allow", "email": A.email, "password": PW}, allow_redirects=False)
    assert again.status_code == 400


# ---- Token: PKCE, single-use code, refresh rotation
def test_token_pkce_single_use_and_refresh(A):
    cid = register()
    ver, chal = pkce()
    q = get_code(cid, chal, A.email, "s2")
    assert q["state"] == ["s2"]
    wrong = requests.post(f"{BASE}/oauth/token", data={"grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": CB, "client_id": cid, "code_verifier": "x" * 50})
    assert wrong.status_code == 400 and wrong.json()["error"] == "invalid_grant"
    # code consumed even by a failed attempt
    again = requests.post(f"{BASE}/oauth/token", data={"grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": CB, "client_id": cid, "code_verifier": ver})
    assert again.status_code == 400
    q = get_code(cid, chal, A.email)
    tok = requests.post(f"{BASE}/oauth/token", data={"grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": CB, "client_id": cid, "code_verifier": ver})
    assert tok.status_code == 200
    tok = tok.json()
    assert tok["token_type"] == "Bearer" and tok["expires_in"] == 3600
    # code reuse after success
    assert requests.post(f"{BASE}/oauth/token", data={"grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": CB, "client_id": cid, "code_verifier": ver}).status_code == 400
    assert A.rpc("ping", token=tok["access_token"]).status_code == 200
    ref = requests.post(f"{BASE}/oauth/token", data={"grant_type": "refresh_token", "refresh_token": tok["refresh_token"], "client_id": cid})
    assert ref.status_code == 200
    ref = ref.json()
    assert A.rpc("ping", token=tok["access_token"]).status_code == 401
    assert A.rpc("ping", token=ref["access_token"]).json()["result"] == {}
    assert requests.post(f"{BASE}/oauth/token", data={"grant_type": "refresh_token", "refresh_token": tok["refresh_token"], "client_id": cid}).status_code == 400
    assert requests.post(f"{BASE}/oauth/token", data={"grant_type": "password"}).json()["error"] == "unsupported_grant_type"


# ---- MCP protocol
def test_mcp_protocol(A):
    init = A.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t"}}).json()
    assert init["result"]["protocolVersion"] == "2025-06-18" and "instructions" in init["result"]
    assert A.rpc("initialize", {"protocolVersion": "1999-01-01"}).json()["result"]["protocolVersion"] in ("2025-06-18",)
    n = requests.post(f"{BASE}/mcp", headers={"Authorization": f"Bearer {A.access}"}, json={"jsonrpc": "2.0", "method": "notifications/initialized"})
    assert n.status_code == 202
    assert A.rpc("ping").json()["result"] == {}
    tools = A.rpc("tools/list").json()["result"]["tools"]
    names = {t["name"] for t in tools}
    assert len(tools) == 14
    assert names == {"cerca_lavori", "agenda", "elenco_lavori", "scheda_lavoro", "foto_lavoro", "cerca_preventivi", "cerca_documenti",
                     "leggi_documento", "contratti_manutenzione", "crea_lavoro", "modifica_lavoro", "registra_pagamento",
                     "registra_visita_manutenzione", "prepara_preventivo"}
    assert not any(re.search(r"cancell|elimin|delete", t["name"]) for t in tools)
    assert all(t["annotations"]["destructiveHint"] is False for t in tools)
    assert A.rpc("foo/bar").json()["error"]["code"] == -32601
    batch = requests.post(f"{BASE}/mcp", headers={"Authorization": f"Bearer {A.access}"},
                          json=[{"jsonrpc": "2.0", "id": 1, "method": "ping"}, {"jsonrpc": "2.0", "method": "notifications/x"}])
    assert batch.status_code == 200 and len(batch.json()) == 1
    bad = requests.post(f"{BASE}/mcp", headers={"Authorization": f"Bearer {A.access}", "Content-Type": "application/json"}, data="{nope")
    assert bad.status_code == 400
    assert requests.get(f"{BASE}/mcp").status_code == 405


# ---- MCP tools full flow
def test_tools_flow(A):
    res, out = A.call("crea_lavoro", {"nome": "TEST_AI Rossi Mario", "indirizzo": "Via Roma 1", "lista": "prossimi",
                                      "appuntamento": "2026-12-03T09:30", "note": "Serranda bloccata"})
    assert out and out["creato"]["lista"] == "prossimi", res
    jid = out["creato"]["id"]
    A.jid = jid
    # appears in app list (Prossimi lavori)
    pend = A.req("GET", "/clients/pending").json()
    assert jid in [c["id"] for c in pend]
    _, out = A.call("cerca_lavori", {"testo": "TEST_AI"})
    assert any(l["id"] == jid for l in out["lavori"])
    _, out = A.call("agenda", {"dal": "2026-12-01", "al": "2026-12-05"})
    assert any(l["id"] == jid for l in out["appuntamenti"])
    _, out = A.call("agenda", {})
    assert "oggi" in out
    res, _ = A.call("agenda", {"dal": "not-a-date"})
    assert res.get("isError") is True
    _, out = A.call("elenco_lavori", {"lista": "prossimi"})
    assert jid in [l["id"] for l in out["lavori"]]
    res, _ = A.call("elenco_lavori", {"lista": "boh"})
    assert res.get("isError") is True
    _, out = A.call("modifica_lavoro", {"id": jid, "sposta_in": "agenda", "data": "2026-12-04", "aggiungi_nota": "Portare molle", "importo": 350})
    assert out["aggiornato"]["lista"] == "agenda" and out["aggiornato"]["data"] == "2026-12-04"
    got = A.job(jid)
    assert got["pending"] is False and got["amount"] == 350 and "Portare molle" in got["notes"] and "Serranda bloccata" in got["notes"]
    res, _ = A.call("modifica_lavoro", {"id": jid})
    assert res.get("isError") is True
    _, out = A.call("registra_pagamento", {"id": jid, "importo": 100, "tipo": "acconto", "metodo": "contanti"})
    assert out["aggiornato"]["incassato"] == 100
    assert sum(p["amount"] for p in A.job(jid)["payments"]) == 100
    res, _ = A.call("registra_pagamento", {"id": jid, "importo": -5})
    assert res.get("isError") is True
    res, _ = A.call("registra_pagamento", {"id": jid, "importo": "abc"})
    assert res.get("isError") is True
    _, out = A.call("scheda_lavoro", {"id": jid})
    assert "Portare molle" in out["lavoro"]["note"] and out["foto"]["quante"] == 0
    res, _ = A.call("scheda_lavoro", {"id": "inesistente"})
    assert res.get("isError") is True
    res, _ = A.call("scheda_lavoro", {"id": jid, "extra": 1})
    assert res.get("isError") is True
    res, _ = A.call("strumento_finto", {})
    assert res.get("isError") is True


def test_foto_lavoro_images(A):
    jid = A.jid
    _, out = A.call("foto_lavoro", {"id": jid})
    assert out["foto"] == []
    r = A.req("POST", f"/clients/{jid}/photos", files={"file": ("a.png", io.BytesIO(PNG), "image/png")})
    assert r.status_code == 200, r.text
    res, _ = A.call("foto_lavoro", {"id": jid})
    imgs = [b for b in res["content"] if b["type"] == "image"]
    assert len(imgs) == 1 and imgs[0]["mimeType"] == "image/jpeg"
    assert base64.b64decode(imgs[0]["data"])[:2] == b"\xff\xd8"


def test_preventivi_documenti_contratti(A):
    _, out = A.call("cerca_preventivi", {})
    assert out == {"preventivi": []}
    _, out = A.call("cerca_documenti", {})
    assert "documenti" in out
    res, _ = A.call("leggi_documento", {"id": "nope"})
    assert res.get("isError") is True
    c = A.req("POST", "/contratti", json={"cliente": "TEST_AI CONDOMINIO", "indirizzo": "Via Test 2", "data_inizio": "2026-01-10", "frequenza_mesi": 6})
    assert c.status_code == 200, c.text
    cid = c.json()["id"]
    _, out = A.call("contratti_manutenzione", {"testo": "TEST_AI"})
    assert [x["id"] for x in out["contratti"]] == [cid]
    _, out = A.call("contratti_manutenzione", {"solo_in_scadenza": True})
    assert "contratti" in out
    _, out = A.call("registra_visita_manutenzione", {"contratto_id": cid, "data": "2026-11-05", "nota": "TEST_ok"})
    assert out["ultima_visita"] == "2026-11-05", out
    got = [x for x in A.req("GET", "/contratti").json() if x["id"] == cid][0]
    assert got["ultima_visita"] == "2026-11-05"
    res, _ = A.call("registra_visita_manutenzione", {"contratto_id": "nope"})
    assert res.get("isError") is True
    res, _ = A.call("registra_visita_manutenzione", {"contratto_id": cid, "data": "xx"})
    assert res.get("isError") is True, "invalid visit date should be an error"


def test_prepara_preventivo_and_approve(A):
    res, out = A.call("prepara_preventivo", {"cliente": "test_ai rossi", "righe": ["Fornitura serranda avvolgibile", "Motore tubolare"], "lavoro_id": A.jid})
    assert out and out["bozza"], res
    pid = out["bozza"]
    res, _ = A.call("prepara_preventivo", {"cliente": "x", "righe": []})
    assert res.get("isError") is True
    res, _ = A.call("prepara_preventivo", {"cliente": "x", "righe": ["a"], "lavoro_id": "nope"})
    assert res.get("isError") is True
    st = A.req("GET", "/assistente/stato").json()
    assert st["mcp_url"] == f"{ROOT}/api/mcp"
    p = [x for x in st["proposte"] if x["id"] == pid][0]
    assert p["cliente"] == "TEST_AI ROSSI" and len(p["righe"]) == 2
    azioni = [a["azione"] for a in st["attivita"]]
    for a in ("Nuovo lavoro", "Lavoro modificato", "Pagamento registrato", "Bozza preventivo", "Visita manutenzione"):
        assert a in azioni
    assert len(st["collegamenti"]) >= 1
    ap = A.req("POST", f"/assistente/proposte/{pid}/approva")
    assert ap.status_code == 200, ap.text
    qid = ap.json()["quote_id"]
    q = A.req("GET", f"/quotes/{qid}").json()
    assert [l["description"] for l in q["lineItems"]] == ["Fornitura serranda avvolgibile", "Motore tubolare"]
    assert all(l["amount"] == 0 for l in q["lineItems"])
    assert A.req("POST", f"/assistente/proposte/{pid}/approva").status_code == 404
    _, out = A.call("cerca_preventivi", {"testo": "serranda"})
    assert any(x["id"] == qid for x in out["preventivi"])
    # scarta
    _, out = A.call("prepara_preventivo", {"cliente": "TEST_scarta", "righe": ["riga"]})
    pid2 = out["bozza"]
    assert A.req("DELETE", f"/assistente/proposte/{pid2}").status_code == 200
    assert pid2 not in [x["id"] for x in A.req("GET", "/assistente/stato").json()["proposte"]]
    assert A.req("DELETE", f"/assistente/proposte/{pid2}").status_code == 404


# ---- Isolation
def test_isolation(A, B):
    jid = A.jid
    for name, args in (("scheda_lavoro", {"id": jid}), ("modifica_lavoro", {"id": jid, "nome": "HACK"}),
                       ("registra_pagamento", {"id": jid, "importo": 1}), ("prepara_preventivo", {"cliente": "x", "righe": ["a"], "lavoro_id": jid})):
        res, _ = B.call(name, args)
        assert res.get("isError") is True, name
    _, out = B.call("cerca_lavori", {"testo": "TEST_AI"})
    assert out["lavori"] == []
    res, _ = B.call("foto_lavoro", {"id": jid})
    assert "image" not in [b["type"] for b in res["content"]]
    _, out = B.call("contratti_manutenzione", {})
    assert out["contratti"] == []
    assert A.job(jid)["name"] == "TEST_AI Rossi Mario"
    st_b = B.req("GET", "/assistente/stato").json()
    assert st_b["proposte"] == [] and all(a["azione"] != "Nuovo lavoro" for a in st_b["attivita"])
    conn_a = A.req("GET", "/assistente/stato").json()["collegamenti"][0]["id"]
    assert B.req("DELETE", f"/assistente/collegamenti/{conn_a}").status_code == 404
    pid = A.call("prepara_preventivo", {"cliente": "TEST_iso", "righe": ["a"]})[1]["bozza"]
    assert B.req("POST", f"/assistente/proposte/{pid}/approva").status_code == 404
    assert B.req("DELETE", f"/assistente/proposte/{pid}").status_code == 404


def test_assistente_requires_firebase():
    assert requests.get(f"{BASE}/assistente/stato").status_code in (401, 403)


# ---- Revoke (run last)
def test_zz_revoke(B):
    st = B.req("GET", "/assistente/stato").json()
    conn = st["collegamenti"][0]["id"]
    assert B.rpc("ping").status_code == 200
    assert B.req("DELETE", f"/assistente/collegamenti/{conn}").status_code == 200
    assert B.rpc("ping").status_code == 401
    ref = requests.post(f"{BASE}/oauth/token", data={"grant_type": "refresh_token", "refresh_token": B.refresh, "client_id": B.cid})
    assert ref.status_code == 400
    assert conn not in [c["id"] for c in B.req("GET", "/assistente/stato").json()["collegamenti"]]
