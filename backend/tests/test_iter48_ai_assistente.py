# Iter48: AI assistant — bozze approve/link/storico/delete+numbering, quote collega/lavoro, isolation, multi-turn chat with real Haiku.
import time, uuid
import pytest, requests
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
PW = "TestPassword123!"
S = {}


class U:
    def __init__(self, tag):
        self.email = f"testuser+iter48{tag}{uuid.uuid4().hex[:8]}@italserrande.test"
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
        for c in ("clients", "quotes", "contratti", "quote_settings"):
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


def _bozza(u, cliente="TEST_BOZZA ROSSI", lavoro_id=None):
    pid = uuid.uuid4().hex
    mdb.ai_proposte.insert_one({"id": pid, "uid": u.uid, "stato": "da_approvare", "created_at": "2026-11-01T10:00:00+00:00",
                                "cliente": cliente, "indirizzo": "VIA TEST 1", "oggetto": "OFFERTA", "righe": ["Serranda 3x2", "Motore"],
                                "note": "", "lavoro_id": lavoro_id, "assistente": "test"})
    return pid


def _job(u, name):
    r = u.req("POST", "/clients", json={"name": name, "address": "Via Test 9", "phone": "0000000000", "date": "2026-12-01", "pending": True})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


# ---- Bozze: approve with link to existing job
def test_approve_with_link(A, B):
    jid = _job(A, "TEST_JOB Link")
    S["jid"] = jid
    pid = _bozza(A)
    st = A.req("GET", "/assistente/stato").json()
    assert pid in [p["id"] for p in st["proposte"]]
    assert "number" not in [p for p in st["proposte"] if p["id"] == pid][0]
    # B cannot approve A's bozza nor link to A's job
    assert B.req("POST", f"/assistente/proposte/{pid}/approva", json={"lavoro_id": jid}).status_code == 404
    r = A.req("POST", f"/assistente/proposte/{pid}/approva", json={"lavoro_id": jid})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["lavoro_id"] == jid and d["number"] == "001"
    S["q1"], S["p1"] = d["quote_id"], pid
    assert A.req("GET", f"/quotes/{d['quote_id']}/lavoro").json()["id"] == jid
    job = mdb.clients.find_one({"id": jid})
    assert job["quote_ref"] == d["quote_id"] and job["quote_number"] == "001"
    assert mdb.quotes.find_one({"id": d["quote_id"]})["client_id"] == jid
    # double approve
    assert A.req("POST", f"/assistente/proposte/{pid}/approva", json={}).status_code == 404
    st = A.req("GET", "/assistente/stato").json()
    assert pid in [p["id"] for p in st["storico"]] and pid not in [p["id"] for p in st["proposte"]]


def test_approve_without_body_and_bad_job(A):
    pid = _bozza(A, "TEST_BOZZA NOBODY")
    r = A.req("POST", f"/assistente/proposte/{pid}/approva")
    assert r.status_code == 200, r.text
    assert r.json()["number"] == "002" and r.json()["lavoro_id"] is None
    S["q2"], S["p2"] = r.json()["quote_id"], pid
    pid3 = _bozza(A, "TEST_BOZZA BADJOB")
    r = A.req("POST", f"/assistente/proposte/{pid3}/approva", json={"lavoro_id": "nope"})
    assert r.status_code == 200, r.text
    assert r.json()["lavoro_id"] is None
    S["q3"], S["p3"] = r.json()["quote_id"], pid3
    q3 = mdb.quotes.find_one({"id": S["q3"]})
    print("client_id on bad-job quote:", q3.get("client_id"))


def test_storico_delete_and_number_recovery(A, B):
    # delete last approved (003) -> next number reused
    assert B.req("DELETE", f"/assistente/proposte/{S['p3']}/storico").status_code == 404
    assert A.req("DELETE", f"/assistente/proposte/{S['p3']}/storico").status_code == 200
    assert mdb.quotes.find_one({"id": S["q3"]})["is_deleted"] is True
    st = A.req("GET", "/assistente/stato").json()
    assert S["p3"] not in [p["id"] for p in st["storico"]]
    pid = _bozza(A, "TEST_BOZZA RENUM")
    r = A.req("POST", f"/assistente/proposte/{pid}/approva", json={})
    assert r.json()["number"] == "003", r.json()
    # delete a middle one (001, linked) -> job quote_ref cleared; counter not lowered
    assert A.req("DELETE", f"/assistente/proposte/{S['p1']}/storico").status_code == 200
    job = mdb.clients.find_one({"id": S["jid"]})
    assert job["quote_ref"] == ""
    print("quote_number after delete:", job.get("quote_number"))
    S["stale_quote_number"] = job.get("quote_number")
    assert A.req("GET", f"/quotes/{S['q1']}/lavoro").json() == {}
    pid = _bozza(A, "TEST_BOZZA NEXT")
    assert A.req("POST", f"/assistente/proposte/{pid}/approva", json={}).json()["number"] == "004"


def test_scarta_ripristina_elimina(A):
    pid = _bozza(A, "TEST_BOZZA SCARTA")
    assert A.req("DELETE", f"/assistente/proposte/{pid}").status_code == 200
    assert A.req("DELETE", f"/assistente/proposte/{pid}").status_code == 404
    assert A.req("POST", f"/assistente/proposte/{pid}/ripristina").status_code == 200
    assert A.req("POST", f"/assistente/proposte/{pid}/ripristina").status_code == 404
    st = A.req("GET", "/assistente/stato").json()
    assert pid in [p["id"] for p in st["proposte"]]
    assert A.req("DELETE", f"/assistente/proposte/{pid}/storico").status_code == 404  # da_approvare not in storico
    A.req("DELETE", f"/assistente/proposte/{pid}")
    assert A.req("DELETE", f"/assistente/proposte/{pid}/storico").status_code == 200
    assert A.req("POST", f"/assistente/proposte/{pid}/ripristina").status_code == 404


def test_quote_collega_and_change(A, B):
    j2 = _job(A, "TEST_JOB Second")
    q = S["q2"]
    assert B.req("POST", f"/quotes/{q}/collega", json={"lavoro_id": j2}).status_code == 404
    assert A.req("POST", f"/quotes/{q}/collega", json={"lavoro_id": "nope"}).status_code == 404
    assert A.req("POST", f"/quotes/{q}/collega", json={}).status_code == 422
    r = A.req("POST", f"/quotes/{q}/collega", json={"lavoro_id": S["jid"]})
    assert r.status_code == 200 and r.json()["lavoro_nome"]
    r = A.req("POST", f"/quotes/{q}/collega", json={"lavoro_id": j2})
    assert r.status_code == 200
    assert A.req("GET", f"/quotes/{q}/lavoro").json()["id"] == j2
    assert mdb.clients.find_one({"id": S["jid"]})["quote_ref"] == ""
    assert B.req("GET", f"/quotes/{q}/lavoro").json() == {}
    # search used by JobPicker
    res = A.req("GET", "/clients/search", params={"q": "TEST_JOB"}).json()
    assert {S["jid"], j2} <= {c["id"] for c in res}
    assert B.req("GET", "/clients/search", params={"q": "TEST_JOB"}).json() == []


# ---- Real Haiku multi-turn chat with tool actions (one long conversation)
def _send(A, cid, testo):
    r = A.req("POST", "/assistente/chat", json={"id": cid, "model": "haiku", "testo": testo})
    assert r.status_code == 200, f"{testo!r}: {r.status_code} {r.text[:300]}"
    d = r.json()
    if not d["in_attesa"]:
        S.setdefault("verbal_confirm", []).append(d["messaggi"][-1]["text"][:200])
    return d


def _confirm(A, cid, ok=True):
    r = A.req("POST", f"/assistente/chat/{cid}/conferma", json={"ok": ok})
    assert r.status_code == 200, r.text[:300]
    return r.json()


def test_chat_multiturn_actions(A):
    A.req("PUT", "/assistente/credito", json={"ricarica": 5, "soglia": 1, "azzera": True})
    d = _send(A, None, "Crea un lavoro per TEST_CHAT Bianchi, indirizzo Via Prova 7, lista prossimi, nota: motore rotto.")
    cid = d["id"]
    print("1", d["in_attesa"], d["messaggi"][-1])
    assert d["in_attesa"] and d["in_attesa"][0]["name"] == "crea_lavoro"
    d = _confirm(A, cid)
    print("1c", d["messaggi"][-1])
    job = mdb.clients.find_one({"user_id": A.uid, "name": {"$regex": "BIANCHI", "$options": "i"}})
    assert job
    d = _send(A, cid, "Spostalo in agenda per il giorno 2026-12-10.")
    print("2", d["in_attesa"], d["messaggi"][-1])
    assert d["in_attesa"] and d["in_attesa"][0]["name"] == "modifica_lavoro"
    d = _confirm(A, cid)
    job = mdb.clients.find_one({"id": job["id"]})
    print("2c", job.get("date"), job.get("pending"), d["messaggi"][-1])
    assert job["date"] == "2026-12-10"
    d = _send(A, cid, "Registra un acconto di 50 euro in contanti su questo lavoro.")
    print("3", d["in_attesa"], d["messaggi"][-1])
    assert d["in_attesa"] and d["in_attesa"][0]["name"] == "registra_pagamento"
    d = _confirm(A, cid)
    job = mdb.clients.find_one({"id": job["id"]})
    print("3c", job.get("payments"), d["messaggi"][-1])
    d = _send(A, cid, "Prepara una bozza di preventivo per questo lavoro con una riga: Sostituzione motore serranda 220V. Non cercare altri preventivi.")
    print("4", d["in_attesa"], d["messaggi"][-1])
    assert d["in_attesa"] and d["in_attesa"][0]["name"] == "prepara_preventivo"
    d = _confirm(A, cid)
    b = mdb.ai_proposte.find_one({"uid": A.uid, "stato": "da_approvare", "cliente": {"$regex": "BIANCHI"}})
    assert b and "number" not in b
    print("bozza lavoro_id", b.get("lavoro_id"), job["id"])
    S["chat_bozza"] = b["id"]
    d = _send(A, cid, "Ho cambiato idea: scarta quella bozza.")
    print("5", d["in_attesa"], d["messaggi"][-1])
    assert d["in_attesa"] and d["in_attesa"][0]["name"] == "scarta_bozza"
    d = _confirm(A, cid)
    assert mdb.ai_proposte.find_one({"id": b["id"]})["stato"] == "scartata"
    st = A.req("GET", "/assistente/stato").json()
    azioni = [a["azione"] for a in st["attivita"]]
    print("attivita", azioni)
    assert {"Nuovo lavoro", "Bozza preventivo", "Bozza scartata"} <= set(azioni)
    c = A.req("GET", "/assistente/credito").json()
    assert 0 < c["speso"] < 1 and c["residuo"] < 5
    g = A.req("GET", f"/assistente/chat/{cid}").json()
    assert g["in_attesa"] is None and len([m for m in g["messaggi"] if m["role"] == "user"]) == 5
    print("verbal_confirm", S.get("verbal_confirm"))
