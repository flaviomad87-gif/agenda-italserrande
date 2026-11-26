# Iter47: in-app AI chat (/api/assistente/chat, conferma, credito) with real Anthropic calls (Haiku), isolation A/B.
import time, uuid
import pytest, requests
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
ROOT = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/")
BASE = ROOT + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
PW = "TestPassword123!"


class U:
    def __init__(self, tag):
        self.email = f"testuser+iter47{tag}{uuid.uuid4().hex[:8]}@italserrande.test"
        r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                          json={"email": self.email, "password": PW, "returnSecureToken": True})
        if r.status_code != 200:
            pytest.skip("firebase signup failed")
        j = r.json()
        self.tok, self.uid = j["idToken"], j["localId"]
        self.h = {"Authorization": "Bearer " + self.tok}

    def req(self, m, path, **kw):
        return requests.request(m, BASE + path, headers=self.h, timeout=150, **kw)

    def close(self):
        u = self.uid
        for c in ("clients", "quotes", "contratti"):
            mdb[c].delete_many({"user_id": u})
        for c in ("ai_proposte", "ai_attivita", "ai_chats", "ai_settings", "ai_tokens"):
            mdb[c].delete_many({"uid": u})
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": self.tok})


@pytest.fixture(scope="module")
def A():
    x = U("a"); yield x; x.close()


@pytest.fixture(scope="module")
def B():
    x = U("b"); yield x; x.close()


S = {}


def test_auth_required():
    assert requests.get(f"{BASE}/assistente/credito").status_code in (401, 403)
    assert requests.post(f"{BASE}/assistente/chat", json={"testo": "ciao"}).status_code in (401, 403)


# ---- Credito counter
def test_credito_default_and_updates(A):
    c = A.req("GET", "/assistente/credito").json()
    assert c["impostato"] is False and c["caricato"] == 0 and c["avviso"] is False and c["chiave"] is True
    c = A.req("PUT", "/assistente/credito", json={"ricarica": 10, "soglia": 2, "azzera": True}).json()
    assert c["caricato"] == 10 and c["residuo"] == 10 and c["speso"] == 0 and c["impostato"] and not c["avviso"]
    c = A.req("PUT", "/assistente/credito", json={"ricarica": 5, "soglia": 2}).json()
    assert c["caricato"] == 15 and c["residuo"] == 15
    c = A.req("PUT", "/assistente/credito", json={"ricarica": 0, "soglia": 20}).json()
    assert c["caricato"] == 15 and c["soglia"] == 20 and c["avviso"] is True and c["esaurito"] is False
    c = A.req("PUT", "/assistente/credito", json={"ricarica": 10, "soglia": 2, "azzera": True}).json()
    assert c["caricato"] == 10 and not c["avviso"]
    assert A.req("GET", "/assistente/credito").json()["caricato"] == 10
    for bad in ({"ricarica": -1}, {"soglia": -1}, {"ricarica": 99999}, {"ricarica": "abc"}):
        assert A.req("PUT", "/assistente/credito", json=bad).status_code == 422, bad


def test_chat_validation(A):
    assert A.req("POST", "/assistente/chat", json={"testo": ""}).status_code == 422
    assert A.req("POST", "/assistente/chat", json={"testo": "x", "model": "opus"}).status_code == 422
    assert A.req("POST", "/assistente/chat", json={"testo": "x", "id": "nope"}).status_code == 404
    assert A.req("GET", "/assistente/chat/nope").status_code == 404
    assert A.req("POST", "/assistente/chat/nope/conferma", json={"ok": True}).status_code == 404


# ---- Real chat (Haiku)
def test_chat_simple_question(A):
    t = time.time()
    r = A.req("POST", "/assistente/chat", json={"model": "haiku", "testo": "Quanti lavori ho nei prossimi lavori? Rispondi in una riga."})
    print("latency", time.time() - t, r.status_code, r.text[:500])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["model"] == "haiku" and d["messaggi"][0]["role"] == "user" and d["messaggi"][-1]["role"] == "assistant"
    assert d["costo_risposta"] > 0 and d["costo_chat"] > 0
    assert d["credito"]["speso"] > 0 and d["credito"]["residuo"] < 10
    S["chat1"] = d["id"]
    g = A.req("GET", f"/assistente/chat/{d['id']}").json()
    assert len(g["messaggi"]) == len(d["messaggi"])
    lst = A.req("GET", "/assistente/chat").json()
    assert d["id"] in [c["id"] for c in lst]


def _ask_create(A, name):
    r = A.req("POST", "/assistente/chat", json={"model": "haiku", "testo": f"Crea un lavoro per {name}, indirizzo Via Test 5, nella lista prossimi lavori, nota: serranda bloccata. Non chiedere altro."})
    assert r.status_code == 200, r.text
    d = r.json()
    print("pending", d["in_attesa"], d["messaggi"][-1])
    if not d["in_attesa"]:
        # KNOWN ISSUE: model asks textual "sì" first (INSTRUCTIONS conflict) -> double confirmation
        S.setdefault("double_confirm", 0)
        S["double_confirm"] += 1
        r = A.req("POST", "/assistente/chat", json={"id": d["id"], "model": "haiku", "testo": "Sì, procedi."})
        assert r.status_code == 200, r.text
        d = r.json()
        print("pending after si", d["in_attesa"], d["messaggi"][-1])
    assert d["in_attesa"], f"no pending action: {d['messaggi'][-1]}"
    assert d["in_attesa"][0]["name"] == "crea_lavoro"
    return d


def test_pending_cancel(A):
    d = _ask_create(A, "TEST_CHAT Annulla")
    cid = d["id"]
    # 409 while pending
    r = A.req("POST", "/assistente/chat", json={"id": cid, "model": "haiku", "testo": "altro"})
    assert r.status_code == 409
    assert A.req("GET", f"/assistente/chat/{cid}").json()["in_attesa"]
    r = A.req("POST", f"/assistente/chat/{cid}/conferma", json={"ok": False})
    assert r.status_code == 200, r.text
    d = r.json()
    print("cancel reply", d["messaggi"][-1])
    assert not d["in_attesa"]
    assert mdb.clients.count_documents({"user_id": A.uid}) == 0
    assert A.req("POST", f"/assistente/chat/{cid}/conferma", json={"ok": True}).status_code == 404


def test_pending_confirm(A, B):
    d = _ask_create(A, "TEST_CHAT Conferma")
    cid = d["id"]
    S["chat2"] = cid
    # isolation: B cannot read/confirm/post
    assert B.req("GET", f"/assistente/chat/{cid}").status_code == 404
    assert B.req("POST", f"/assistente/chat/{cid}/conferma", json={"ok": True}).status_code == 404
    assert B.req("POST", "/assistente/chat", json={"id": cid, "testo": "x"}).status_code == 404
    assert cid not in [c["id"] for c in B.req("GET", "/assistente/chat").json()]
    r = A.req("POST", f"/assistente/chat/{cid}/conferma", json={"ok": True})
    assert r.status_code == 200, r.text
    print("confirm reply", r.json()["messaggi"][-1])
    jobs = list(mdb.clients.find({"user_id": A.uid}, {"_id": 0}))
    assert len(jobs) == 1 and "TEST_CHAT" in jobs[0]["name"].upper()
    pend = A.req("GET", "/clients/pending").json()
    assert jobs[0]["id"] in [c["id"] for c in pend]
    st = A.req("GET", "/assistente/stato").json()
    att = [a for a in st["attivita"] if a["azione"] == "Nuovo lavoro"]
    assert att and att[0]["assistente"] == "Chat agenda · Haiku 5.5", att
    # double confirm
    assert A.req("POST", f"/assistente/chat/{cid}/conferma", json={"ok": True}).status_code == 404
    assert mdb.clients.count_documents({"user_id": A.uid}) == 1
    # B unaffected
    assert B.req("GET", "/assistente/stato").json()["attivita"] == []
    assert B.req("GET", "/assistente/credito").json()["speso"] == 0
