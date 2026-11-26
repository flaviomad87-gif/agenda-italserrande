# Iter45: full regression - clients lifecycle, quotes, rilievi, photos (GridFS), documenti/public, contratti,
# materials, expenses, advances, employees/time entries, summaries, isolation A/B, validation, no 500s/ObjectId
import io, os, re, uuid, pytest, requests
from datetime import date, timedelta
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
MONTH = "2027-03"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


class U:
    def __init__(self, tag):
        email = f"testuser+iter45{tag}{uuid.uuid4().hex[:8]}@italserrande.test"
        r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                          json={"email": email, "password": "TestPassword123!", "returnSecureToken": True})
        if r.status_code != 200:
            pytest.skip("firebase signup failed")
        j = r.json()
        self.tok, self.uid = j["idToken"], j["localId"]
        self.h = {"Authorization": "Bearer " + self.tok}

    def req(self, m, path, **kw):
        return requests.request(m, BASE + path, headers=self.h, timeout=30, **kw)

    def close(self):
        u = self.uid
        for c in ("clients", "quotes", "rilievi_sezionali", "documenti", "documenti_counters", "contratti", "materials",
                  "expenses", "recurring_expenses", "advances", "employees", "time_entries", "quote_settings"):
            mdb[c].delete_many({"user_id": u})
        for p in mdb.job_photos.find({"user_id": u}):
            if p.get("file_id"):
                mdb.photo_files.files.delete_one({"_id": p["file_id"]}); mdb.photo_files.chunks.delete_many({"files_id": p["file_id"]})
        mdb.job_photos.delete_many({"user_id": u})
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": self.tok})


@pytest.fixture(scope="module")
def A():
    x = U("a"); yield x; x.close()


@pytest.fixture(scope="module")
def B():
    x = U("b"); yield x; x.close()


def no_oid(obj):
    assert "'_id'" not in str(obj) and "ObjectId" not in str(obj)


def mk_client(u, **kw):
    body = {"date": f"{MONTH}-10", "name": "TEST_cliente", "amount": 1000, "vat_rate": 22, **kw}
    r = u.req("POST", "/clients", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ---- Auth / health
def test_auth_required():
    assert requests.get(BASE + "/clients").status_code in (401, 403)
    assert requests.get(BASE + "/clients", headers={"Authorization": "Bearer xxx"}).status_code == 401


def test_me(A):
    r = A.req("GET", "/me"); assert r.status_code == 200; assert r.json().get("uid") == A.uid


# ---- Clients lifecycle
def test_client_lifecycle(A):
    c = mk_client(A, pending=True, appointment_at=f"{MONTH}-12T09:30")
    no_oid(c)
    assert c["id"] in [x["id"] for x in A.req("GET", "/clients/pending").json()]
    # to_quote
    up = A.req("PUT", f"/clients/{c['id']}", json={**c, "to_quote": True}).json()
    assert up["to_quote"] is True
    assert c["id"] in [x["id"] for x in A.req("GET", "/clients/to-quote").json()]
    assert c["id"] not in [x["id"] for x in A.req("GET", "/clients/pending").json()]
    # awaiting
    up = A.req("PUT", f"/clients/{c['id']}", json={**up, "to_quote": False, "awaiting_materials": True}).json()
    assert c["id"] in [x["id"] for x in A.req("GET", "/clients/awaiting").json()]
    # execute
    r = A.req("POST", f"/clients/{c['id']}/execute", params={"date": f"{MONTH}-15"})
    assert r.status_code == 200 and r.json()["pending"] is False and r.json()["date"] == f"{MONTH}-15"
    assert r.json()["appointment_at"] == f"{MONTH}-12T09:30"
    assert c["id"] in [x["id"] for x in A.req("GET", "/clients", params={"date": f"{MONTH}-15"}).json()]
    assert A.req("POST", f"/clients/{c['id']}/execute").status_code == 404
    # to-invoice
    A.req("PUT", f"/clients/{c['id']}", json={**r.json(), "to_invoice": True})
    assert c["id"] in [x["id"] for x in A.req("GET", "/clients/to-invoice").json()]
    # week range
    wk = A.req("GET", "/clients", params={"from_date": f"{MONTH}-14", "to_date": f"{MONTH}-20"}).json()
    assert c["id"] in [x["id"] for x in wk]


def test_reorder_and_search(A):
    a = mk_client(A, name="TEST_ordA zzq", pending=True); b = mk_client(A, name="TEST_ordB", pending=True)
    assert A.req("PUT", "/clients/pending/reorder", json={"ids": [b["id"], a["id"]]}).status_code == 200
    ids = [x["id"] for x in A.req("GET", "/clients/pending").json()]
    assert ids.index(b["id"]) < ids.index(a["id"])
    s = A.req("GET", "/clients/search", params={"q": "zzq"}).json()
    assert [x["id"] for x in s] == [a["id"]]
    assert A.req("GET", "/clients/search", params={"q": "("}).status_code == 200


def test_payments_unpaid_and_delete_payment(A):
    c = mk_client(A, status="lavoro_eseguito", amount=1000, vat_rate=22, withholding_rate=None,
                  payments=[{"type": "acconto", "amount": 500, "method": "contanti", "date": f"{MONTH}-10"},
                            {"type": "acconto", "amount": 200, "method": "pos", "date": f"{MONTH}-11"}])
    un = {x["id"]: x for x in A.req("GET", "/clients/unpaid").json()}
    assert un[c["id"]]["to_collect"] == 1220 and un[c["id"]]["paid"] == 700 and un[c["id"]]["balance"] == 520
    pid = c["payments"][1]["id"]
    assert A.req("DELETE", f"/clients/{c['id']}/payments/{pid}").json()["remaining"] == 1
    assert A.req("DELETE", f"/clients/{c['id']}/payments/nope").status_code == 404


def test_client_withholding(A):
    c = mk_client(A, status="lavoro_eseguito", amount=1000, vat_rate=22, withholding_rate=4)
    un = {x["id"]: x for x in A.req("GET", "/clients/unpaid").json()}
    assert un[c["id"]]["to_collect"] == 1180


def test_client_404s(A):
    fake = str(uuid.uuid4())
    assert A.req("PUT", f"/clients/{fake}", json={"date": f"{MONTH}-01", "name": "x"}).status_code == 404
    assert A.req("DELETE", f"/clients/{fake}").status_code == 404


def test_client_idempotent_id(A):
    cid = str(uuid.uuid4())
    a = mk_client(A, id=cid); b = mk_client(A, id=cid)
    assert a["id"] == b["id"] == cid
    assert mdb.clients.count_documents({"id": cid}) == 1


# ---- Validation (expected failures are real findings)
def test_client_invalid_date_rejected(A):
    r = A.req("POST", "/clients", json={"date": "not-a-date", "name": "TEST_bad"})
    assert r.status_code == 422, f"invalid date accepted: {r.status_code}"


@pytest.mark.skip(reason="importi negativi ammessi: sconti/note di credito")
def test_client_negative_amount_rejected(A):
    r = A.req("POST", "/clients", json={"date": f"{MONTH}-01", "name": "TEST_neg", "amount": -100})
    assert r.status_code == 422, f"negative amount accepted: {r.status_code}"


def test_execute_invalid_date_rejected(A):
    c = mk_client(A, pending=True)
    r = A.req("POST", f"/clients/{c['id']}/execute", params={"date": "31/02/2027"})
    assert r.status_code in (400, 422), f"execute accepted invalid date: {r.status_code}"


def test_contratto_invalid_date_rejected(A):
    r = A.req("POST", "/contratti", json={"cliente": "TEST_c", "data_inizio": "garbage"})
    assert r.status_code == 422, f"invalid data_inizio accepted: {r.status_code} {r.text[:150]}"


def test_summary_bad_month_no_500(A):
    for m in ("2027-13", "abc", ""):
        r = A.req("GET", "/summary", params={"month": m}); assert r.status_code < 500, (m, r.status_code)
        r = A.req("GET", "/suppliers/summary", params={"month": m}); assert r.status_code < 500
        r = A.req("GET", "/payments/by-method", params={"month": m}); assert r.status_code < 500


# ---- Quotes
def test_quotes_numbering_and_unlink(A):
    q1 = A.req("POST", "/quotes", json={"clientName": " test_q ", "lineItems": [{"description": "a", "amount": 100, "vatRate": 22}]}).json()
    q2 = A.req("POST", "/quotes", json={"clientName": "TEST_q2"}).json()
    assert int(q2["number"]) == int(q1["number"]) + 1 and q1["clientName"] == "TEST_Q"
    no_oid(q1)
    c = mk_client(A, quote_ref=q1["id"])
    up = A.req("PUT", f"/quotes/{q1['id']}", json={"subject": "NEW"}).json()
    assert up["subject"] == "NEW" and up["number"] == q1["number"]
    assert A.req("DELETE", f"/quotes/{q1['id']}").status_code == 200
    assert A.req("GET", f"/quotes/{q1['id']}").status_code == 404
    got = [x for x in A.req("GET", "/clients", params={"month": MONTH}).json() if x["id"] == c["id"]][0]
    assert got["quote_ref"] == ""
    q3 = A.req("POST", "/quotes", json={"clientName": "TEST_q3"}).json()
    assert int(q3["number"]) == int(q2["number"]) + 1


@pytest.mark.skip(reason="righe negative ammesse: sconti")
def test_quote_negative_amount(A):
    r = A.req("POST", "/quotes", json={"clientName": "TEST_n", "lineItems": [{"description": "x", "amount": -50, "vatRate": 22}]})
    assert r.status_code == 422, f"negative quote line accepted: {r.status_code}"


# ---- Rilievi
def test_rilievi_crud(A):
    c = mk_client(A)
    r = A.req("POST", "/rilievi-sezionali", json={"rif": "TEST_r", "client_id": c["id"], "h": "2500", "l": "3000", "motore": True}).json()
    no_oid(r)
    assert A.req("GET", "/rilievi-sezionali", params={"client_id": c["id"]}).json()[0]["id"] == r["id"]
    assert A.req("PUT", f"/rilievi-sezionali/{r['id']}", json={"colore": "RAL9010"}).json()["colore"] == "RAL9010"
    assert A.req("GET", f"/rilievi-sezionali/{r['id']}").json()["h"] == "2500"
    assert A.req("DELETE", f"/rilievi-sezionali/{r['id']}").status_code == 200
    assert A.req("GET", f"/rilievi-sezionali/{r['id']}").status_code == 404


# ---- Photos GridFS
def test_photos_gridfs(A, B):
    c = mk_client(A)
    r = A.req("POST", f"/clients/{c['id']}/photos", files={"file": ("a.png", io.BytesIO(PNG), "image/png")})
    assert r.status_code == 200, r.text
    p = r.json(); no_oid(p)
    assert [x["id"] for x in A.req("GET", f"/clients/{c['id']}/photos").json()] == [p["id"]]
    f = A.req("GET", f"/photos/{p['id']}/file")
    assert f.status_code == 200 and f.content == PNG and f.headers["content-type"] == "image/png"
    assert B.req("GET", f"/photos/{p['id']}/file").status_code == 404
    assert B.req("DELETE", f"/photos/{p['id']}").status_code == 404
    assert A.req("POST", f"/clients/{c['id']}/photos", files={"file": ("a.txt", b"hi", "text/plain")}).status_code == 400
    assert A.req("DELETE", f"/photos/{p['id']}").status_code == 200
    assert A.req("GET", f"/photos/{p['id']}/file").status_code == 404
    assert A.req("GET", f"/clients/{c['id']}/photos").json() == []


@pytest.mark.skip(reason="le foto si caricano anche su bozze non ancora salvate (draftId, verifica-, pratica-); lista/file filtrati per utente")
def test_photo_upload_to_foreign_client_rejected(A, B):
    c = mk_client(A)
    r = B.req("POST", f"/clients/{c['id']}/photos", files={"file": ("a.png", io.BytesIO(PNG), "image/png")})
    assert r.status_code == 404, f"B uploaded photo to A's job id: {r.status_code}"


# ---- Documenti + public
def test_documenti_and_public(A, B):
    d1 = A.req("POST", "/documenti", json={"kind": "pratica", "cliente": "TEST_Mario Rossi", "indirizzo": "Via Test 1", "data": "2027-03-01",
                                         "fields": {"modello": "M1", "tipo_chiusura": "serranda"}}).json()
    d2 = A.req("POST", "/documenti", json={"kind": "pratica", "cliente": "TEST_x", "data": "2027-04-01"}).json()
    assert d2["numero"] == d1["numero"] + 1 and d1["anno"] == "2027" and len(d1["public_token"]) == 32
    ce = A.req("POST", "/documenti", json={"kind": "ce", "data": "2027-03-01"}).json()
    assert ce["numero"] == 1 and "public_token" not in ce
    pub = requests.get(f"{BASE}/public/impianto/{d1['public_token']}").json()
    assert pub["modello"] == "M1" and "TEST_Mario" not in str(pub) and "Via Test" not in str(pub)
    assert requests.get(f"{BASE}/public/impianto/short").status_code == 404
    assert B.req("PUT", f"/documenti/{d1['id']}", json={"cliente": "hack"}).status_code == 404
    assert B.req("DELETE", f"/documenti/{d1['id']}").status_code == 404
    assert B.req("GET", "/documenti").json() == []
    assert A.req("DELETE", f"/documenti/{d1['id']}").status_code == 200
    assert requests.get(f"{BASE}/public/impianto/{d1['public_token']}").status_code == 404
    assert A.req("POST", "/documenti", json={"kind": "bogus"}).status_code == 422


# ---- Contratti
def test_contratti(A, B):
    start = date.today() - timedelta(days=180)
    c = A.req("POST", "/contratti", json={"cliente": "TEST_k", "data_inizio": start.isoformat(), "frequenza_mesi": 6}).json()
    assert c["numero"] >= 1 and c["giorni_alla_visita"] <= 15
    assert c["id"] in [x["id"] for x in A.req("GET", "/contratti/in-scadenza").json()]
    v = A.req("POST", f"/contratti/{c['id']}/visite", json={"data": date.today().isoformat(), "nota": "ok"}).json()
    assert v["ultima_visita"] == date.today().isoformat() and v["giorni_alla_visita"] > 150
    assert c["id"] not in [x["id"] for x in A.req("GET", "/contratti/in-scadenza").json()]
    assert A.req("POST", f"/contratti/{c['id']}/visite", json={"data": "xx"}).status_code == 422
    assert A.req("POST", "/contratti", json={"data_inizio": "2027-01-01", "frequenza_mesi": 0}).status_code == 422
    assert B.req("GET", "/contratti").json() == []
    assert B.req("PUT", f"/contratti/{c['id']}", json={"data_inizio": "2027-01-01"}).status_code == 404
    assert A.req("DELETE", f"/contratti/{c['id']}").status_code == 200
    assert A.req("PUT", f"/contratti/{c['id']}", json={"data_inizio": "2027-01-01"}).status_code == 404


# ---- Materials
def test_materials(A, B):
    m = A.req("POST", "/materials", json={"name": "TEST_vite", "quantity": 2}).json()
    assert A.req("POST", f"/materials/{m['id']}/adjust", params={"delta": 3}).json()["quantity"] == 5
    assert A.req("POST", f"/materials/{m['id']}/adjust", params={"delta": -10}).json()["quantity"] == 0
    assert B.req("POST", f"/materials/{m['id']}/adjust", params={"delta": 1}).status_code == 404
    assert A.req("POST", f"/materials/{m['id']}/adjust", params={"delta": "abc"}).status_code == 422
    assert A.req("DELETE", f"/materials/{m['id']}").status_code == 200


def test_material_negative_quantity_on_create(A):
    r = A.req("POST", "/materials", json={"name": "TEST_neg", "quantity": -5})
    assert r.status_code == 422, f"negative stock accepted on create: {r.json().get('quantity')}"


# ---- Expenses / recurring / advances
def test_expenses_advances(A, B):
    e = A.req("POST", "/expenses", json={"date": f"{MONTH}-05", "category": "TEST_affitto", "amount": 300}).json()
    assert e["id"] in [x["id"] for x in A.req("GET", "/expenses", params={"month": MONTH}).json()]
    assert B.req("DELETE", f"/expenses/{e['id']}").status_code == 404
    rc = A.req("POST", "/recurring-expenses", json={"category": "TEST_ric", "amount": 50}).json()
    ap = A.req("POST", "/recurring-expenses/apply", params={"month": MONTH})
    assert ap.status_code == 200, ap.text
    ap2 = A.req("POST", "/recurring-expenses/apply", params={"month": MONTH})
    exp = [x for x in A.req("GET", "/expenses", params={"month": MONTH}).json() if x.get("recurring_id") == rc["id"]]
    assert len(exp) == 1, f"recurring applied {len(exp)} times"
    a = A.req("POST", "/advances", json={"date": f"{MONTH}-05", "worker_name": "TEST_w", "amount": 100}).json()
    assert B.req("DELETE", f"/advances/{a['id']}").status_code == 404
    assert A.req("DELETE", f"/advances/{a['id']}").status_code == 200
    s = A.req("GET", "/summary", params={"month": MONTH}); assert s.status_code == 200; no_oid(s.json())
    assert A.req("GET", "/summary/year", params={"year": "2027"}).status_code == 200


# ---- Employees
def test_employee_clock_defaults_saved(A):
    e = A.req("POST", "/employees", json={"name": "TEST_emp", "default_clock_in": "07:30", "default_clock_out": "16:30"}).json()
    assert e["default_clock_in"] == "07:30" and e["default_clock_out"] == "16:30", f"clock defaults ignored: {e}"


def test_time_entries(A, B):
    e = A.req("POST", "/employees", json={"name": "TEST_emp2"}).json()
    t = A.req("POST", "/time-entries", json={"employee_id": e["id"], "date": f"{MONTH}-03", "clock_in": f"{MONTH}-03T08:00"}).json()
    t2 = A.req("POST", "/time-entries", json={"employee_id": e["id"], "date": f"{MONTH}-03", "clock_out": f"{MONTH}-03T17:00"}).json()
    assert t["id"] == t2["id"] and t2["clock_out"]
    assert B.req("POST", "/time-entries", json={"employee_id": e["id"], "date": f"{MONTH}-03"}).status_code == 404
    assert B.req("PUT", f"/time-entries/{t['id']}", json={"notes": "x"}).status_code == 404


# ---- Isolation clients/quotes/rilievi
def test_isolation_core(A, B):
    c = mk_client(A, name="TEST_isoA")
    q = A.req("POST", "/quotes", json={"clientName": "TEST_isoq"}).json()
    r = A.req("POST", "/rilievi-sezionali", json={"rif": "TEST_iso"}).json()
    assert B.req("GET", "/clients", params={"month": MONTH}).json() == []
    assert B.req("GET", "/clients/search", params={"q": "TEST_iso"}).json() == []
    assert B.req("PUT", f"/clients/{c['id']}", json={"date": f"{MONTH}-01", "name": "hack"}).status_code == 404
    assert B.req("DELETE", f"/clients/{c['id']}").status_code == 404
    assert B.req("GET", f"/quotes/{q['id']}").status_code == 404
    assert B.req("PUT", f"/quotes/{q['id']}", json={"subject": "h"}).status_code == 404
    assert B.req("DELETE", f"/quotes/{q['id']}").status_code == 404
    assert B.req("GET", f"/rilievi-sezionali/{r['id']}").status_code == 404
    assert B.req("PUT", f"/clients/{c['id']}/execute").status_code in (404, 405)
    # B posts a client with A's id: must not touch A's doc
    B.req("POST", "/clients", json={"id": c["id"], "date": f"{MONTH}-01", "name": "TEST_hijack"})
    assert mdb.clients.find_one({"id": c["id"], "user_id": A.uid})["name"] == "TEST_isoA"
