# Iter43: pratica public_token (POST/PUT), public /api/public/impianto/{token} (no auth, no personal data, maintenance dates), quotes with prefilled lines
import os, re, uuid, calendar, pytest, requests
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
TODAY = datetime.now(ZoneInfo("Europe/Rome")).date()
HEX32 = re.compile(r"^[0-9a-f]{32}$")


def add_months(d, n):
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


class U:
    def __init__(self):
        email = f"testuser+iter43{uuid.uuid4().hex[:10]}@italserrande.test"
        r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                          json={"email": email, "password": "TestPassword123!", "returnSecureToken": True})
        if r.status_code != 200:
            pytest.skip("firebase signup failed")
        j = r.json()
        self.tok, self.uid = j["idToken"], j["localId"]
        self.h = {"Authorization": "Bearer " + self.tok}
        self.docs, self.contr, self.quotes = [], [], []

    def doc(self, **kw):
        r = requests.post(f"{BASE}/documenti", headers=self.h, json=kw)
        assert r.status_code == 200, r.text
        self.docs.append(r.json()["id"])
        return r.json()

    def contratto(self, **kw):
        r = requests.post(f"{BASE}/contratti", headers=self.h, json=kw)
        assert r.status_code == 200, r.text
        self.contr.append(r.json()["id"])
        return r.json()

    def close(self):
        for i in self.quotes:
            requests.delete(f"{BASE}/quotes/{i}", headers=self.h)
        mdb.documenti.delete_many({"id": {"$in": self.docs}, "user_id": self.uid})
        mdb.contratti.delete_many({"id": {"$in": self.contr}, "user_id": self.uid})
        mdb.documenti_counters.delete_many({"user_id": self.uid})
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": self.tok})


@pytest.fixture(scope="module")
def u():
    x = U(); yield x; x.close()


def pub(token):
    return requests.get(f"{BASE}/public/impianto/{token}")


def test_post_pratica_has_token_other_kinds_not(u):
    p = u.doc(kind="pratica", cliente="TEST_Rossi Mario", indirizzo="Via Test 1", data="2026-03-10",
              fields={"tipo_chiusura": "sezionale", "modello": "TEST_Mod", "comune": "Roma (RM)"})
    assert HEX32.match(p.get("public_token") or ""), p
    ce = u.doc(kind="ce", cliente="TEST_x", data="2026-03-10")
    assert "public_token" not in ce
    lst = requests.get(f"{BASE}/documenti?kind=pratica", headers=u.h).json()
    assert [x["public_token"] for x in lst if x["id"] == p["id"]] == [p["public_token"]]


def test_put_old_pratica_generates_token(u):
    did = str(uuid.uuid4())
    mdb.documenti.insert_one({"id": did, "user_id": u.uid, "kind": "pratica", "cliente": "TEST_Old", "indirizzo": "Via Old 2",
                              "data": "2025-01-05", "anno": "2025", "numero": 99, "fields": {}})
    u.docs.append(did)
    r = requests.put(f"{BASE}/documenti/{did}", headers=u.h, json={"fields": {"modello": "TEST_M2"}})
    assert r.status_code == 200
    tok = r.json().get("public_token")
    assert HEX32.match(tok or ""), r.json()
    assert mdb.documenti.find_one({"id": did})["public_token"] == tok
    # second PUT keeps the same token
    r2 = requests.put(f"{BASE}/documenti/{did}", headers=u.h, json={"cliente": "TEST_Old2"})
    assert r2.json()["public_token"] == tok
    j = pub(tok).json()
    assert j["matricola"] == "99/2025" and j["modello"] == "TEST_M2" and j["anno_installazione"] == "2025"


def test_public_no_personal_data_and_basic_fields(u):
    p = u.doc(kind="pratica", cliente="TEST_Privato Segreto", indirizzo="Via Segreta 7", data="2026-04-02",
              fields={"tipo_chiusura": "basculante", "modello": "TEST_Ballan", "matricola": "TEST-MAT-1", "comune": "Fiumicino (RM)"})
    r = pub(p["public_token"])  # no auth header
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["tipo_chiusura"] == "basculante" and j["modello"] == "TEST_Ballan" and j["matricola"] == "TEST-MAT-1"
    assert j["data_installazione"] == "2026-04-02" and j["anno_installazione"] == "2026" and j["comune"] == "Fiumicino (RM)"
    assert j["ultima_manutenzione"] is None and j["prossima_manutenzione"] is None
    for k in ("cliente", "indirizzo", "user_id", "_id", "telefono", "email", "fields", "public_token"):
        assert k not in j
    blob = str(j)
    assert "Segreto" not in blob and "Via Segreta" not in blob


def test_public_contract_by_address_case_insensitive(u):
    p = u.doc(kind="pratica", cliente="TEST_C", indirizzo="Via Contratto 10", data="2026-01-10", fields={"tipo_chiusura": "sezionale"})
    start = add_months(TODAY, -2)
    c = u.contratto(cliente="TEST_C", indirizzo="  via CONTRATTO 10 ", data_inizio=start.isoformat())
    j = pub(p["public_token"]).json()
    assert j["prossima_manutenzione"] == c["prossima_visita"], (j, c)
    assert j["ultima_manutenzione"] == c.get("ultima_visita")


def test_public_contract_by_matricola(u):
    p = u.doc(kind="pratica", cliente="TEST_D", indirizzo="Via Diversa 1", data="2026-01-10",
              fields={"tipo_chiusura": "sezionale", "matricola": "TEST-MAT-XYZ"})
    start = add_months(TODAY, -3)
    c = u.contratto(cliente="TEST_D", indirizzo="Altro indirizzo", data_inizio=start.isoformat(),
                    impianti=[{"descrizione": "Sezionale", "matricola": "test-mat-xyz"}])
    v = (TODAY - timedelta(days=5)).isoformat()
    c = requests.post(f"{BASE}/contratti/{c['id']}/visite", headers=u.h, json={"data": v}).json()
    j = pub(p["public_token"]).json()
    assert j["ultima_manutenzione"] == v and j["prossima_manutenzione"] == c["prossima_visita"], (j, c)


def test_public_disdetto_contract_ignored_and_registro_used(u):
    p = u.doc(kind="pratica", cliente="TEST_E", indirizzo="Via Registro 3", data="2026-01-10", fields={})
    c = u.contratto(cliente="TEST_E", indirizzo="Via Registro 3", data_inizio=add_months(TODAY, -1).isoformat())
    requests.put(f"{BASE}/contratti/{c['id']}", headers=u.h, json={**c, "stato": "disdetto"})
    j = pub(p["public_token"]).json()
    assert j["prossima_manutenzione"] is None
    u.doc(kind="manutenzione", cliente="TEST_E", indirizzo="VIA REGISTRO 3", data="2026-02-15")
    u.doc(kind="manutenzione", cliente="TEST_E", indirizzo="via registro 3", data="2026-05-20")
    u.doc(kind="manutenzione", cliente="TEST_E", indirizzo="Via Altrove 9", data="2026-09-01")
    j = pub(p["public_token"]).json()
    assert j["ultima_manutenzione"] == "2026-05-20", j


def test_public_404s(u):
    assert pub(uuid.uuid4().hex).status_code == 404
    assert pub("abc").status_code == 404
    p = u.doc(kind="pratica", cliente="TEST_Del", data="2026-01-10")
    assert pub(p["public_token"]).status_code == 200
    assert requests.delete(f"{BASE}/documenti/{p['id']}", headers=u.h).status_code == 200
    assert pub(p["public_token"]).status_code == 404


def test_quote_with_prefilled_lines(u):
    lines = ["Porta sezionale A, misure foro L 2500 x H 2200 mm", "Motorizzazione con centralina di comando"]
    r = requests.post(f"{BASE}/quotes", headers=u.h, json={
        "clientName": "TEST_ROSSI", "clientAddress": "VIA TEST 1",
        "lineItems": [{"id": str(uuid.uuid4()), "description": d, "amount": 0, "vatRate": 22} for d in lines]})
    assert r.status_code == 200, r.text
    q = r.json(); u.quotes.append(q["id"])
    g = requests.get(f"{BASE}/quotes/{q['id']}", headers=u.h).json()
    assert [li["description"] for li in g["lineItems"]] == lines
    assert all(li["amount"] == 0 for li in g["lineItems"])
