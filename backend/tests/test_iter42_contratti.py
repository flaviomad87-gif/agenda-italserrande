# Iter42: /api/contratti (CRUD, scadenze, visite, isolation), invia-promemoria idempotency, cron webhook
import os, uuid, calendar, pytest, requests
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from pymongo import MongoClient

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
SECRET = BENV.get("WEBHOOK_CRON_SECRET", "").strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
TODAY = datetime.now(ZoneInfo("Europe/Rome")).date()


def add_months(d, n):
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def _signup():
    email = f"testuser+iter42{uuid.uuid4().hex[:10]}@italserrande.test"
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True})
    if r.status_code != 200:
        pytest.skip("firebase signup failed")
    return r.json()["idToken"], email


class U:
    def __init__(self):
        self.tok, self.email = _signup()
        self.h = {"Authorization": "Bearer " + self.tok}
        self.ids = []

    def post(self, **kw):
        r = requests.post(f"{BASE}/contratti", headers=self.h, json=kw)
        if r.status_code == 200:
            self.ids.append(r.json()["id"])
        return r

    def close(self):
        for i in self.ids:
            requests.delete(f"{BASE}/contratti/{i}", headers=self.h)
        mdb.contratti.delete_many({"id": {"$in": self.ids}})
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": self.tok})


@pytest.fixture(scope="module")
def u():
    x = U(); yield x; x.close()


@pytest.fixture(scope="module")
def u2():
    x = U(); yield x; x.close()


def test_no_token_403():
    assert requests.get(f"{BASE}/contratti").status_code in (401, 403)
    assert requests.post(f"{BASE}/contratti", json={"data_inizio": "2026-01-01"}).status_code in (401, 403)


def test_create_numbering_and_compute(u):
    start = add_months(TODAY, -6) + timedelta(days=5)  # prossima in 5 days
    r = u.post(cliente="TEST_A", data_inizio=start.isoformat(), impianti=[{"descrizione": "Serranda", "matricola": "M1"}])
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["numero"] == 1 and a["anno"] == start.isoformat()[:4]
    assert a["owner_email"] == u.email
    assert a["frequenza_mesi"] == 6 and a["durata_mesi"] == 12
    assert a["prossima_visita"] == add_months(start, 6).isoformat()
    assert a["data_fine"] == add_months(start, 12).isoformat()
    assert [s["tipo"] for s in a["scadenze"]] == ["visita"]
    assert "_id" not in a and "user_id" not in a and "reminded" not in a
    b = u.post(cliente="TEST_B", data_inizio=start.isoformat()).json()
    assert b["numero"] == 2


def test_tacit_renewal_and_not_due(u):
    old = add_months(TODAY, -14)
    c = u.post(cliente="TEST_OLD", data_inizio=old.isoformat(), durata_mesi=12).json()
    assert c["data_fine"] == add_months(old, 24).isoformat()  # advanced past today
    assert c["data_fine"] >= TODAY.isoformat()
    fresh = u.post(cliente="TEST_FRESH", data_inizio=TODAY.isoformat(), frequenza_mesi=3, durata_mesi=24).json()
    assert fresh["prossima_visita"] == add_months(TODAY, 3).isoformat() and fresh["scadenze"] == []
    assert fresh["data_fine"] == add_months(TODAY, 24).isoformat()


def test_no_renewal_fine_scadenza(u):
    start = add_months(TODAY, -12) + timedelta(days=10)
    c = u.post(cliente="TEST_NOREN", data_inizio=start.isoformat(), rinnovo_tacito=False, frequenza_mesi=12).json()
    tipi = sorted(s["tipo"] for s in c["scadenze"])
    assert tipi == ["fine", "visita"], c["scadenze"]


def test_list_sorted_and_in_scadenza(u):
    lst = requests.get(f"{BASE}/contratti", headers=u.h).json()
    pv = [c["prossima_visita"] for c in lst]
    assert pv == sorted(pv) and len(lst) >= 5
    due = requests.get(f"{BASE}/contratti/in-scadenza", headers=u.h).json()
    names = {c["cliente"] for c in due}
    assert "TEST_A" in names and "TEST_FRESH" not in names
    assert all(c["scadenze"] for c in due)


def test_visite_recompute(u):
    a = [c for c in requests.get(f"{BASE}/contratti", headers=u.h).json() if c["cliente"] == "TEST_A"][0]
    v1 = (TODAY - timedelta(days=2)).isoformat()
    r = requests.post(f"{BASE}/contratti/{a['id']}/visite", headers=u.h, json={"data": v1, "nota": "ok"})
    assert r.status_code == 200
    j = r.json()
    assert j["prossima_visita"] == add_months(TODAY - timedelta(days=2), 6).isoformat() and j["scadenze"] == []
    assert j["ultima_visita"] == v1
    older = (TODAY - timedelta(days=60)).isoformat()
    j = requests.post(f"{BASE}/contratti/{a['id']}/visite", headers=u.h, json={"data": older}).json()
    assert j["ultima_visita"] == v1 and len(j["visite"]) == 2
    assert requests.post(f"{BASE}/contratti/{a['id']}/visite", headers=u.h, json={"data": "xx"}).status_code == 422


def test_put_disdetto_excluded(u):
    b = [c for c in requests.get(f"{BASE}/contratti", headers=u.h).json() if c["cliente"] == "TEST_B"][0]
    r = requests.put(f"{BASE}/contratti/{b['id']}", headers=u.h, json={**b, "stato": "disdetto", "note": "TEST_n"})
    assert r.status_code == 200 and r.json()["stato"] == "disdetto" and r.json()["scadenze"] == []
    assert r.json()["numero"] == b["numero"]
    due = requests.get(f"{BASE}/contratti/in-scadenza", headers=u.h).json()
    assert b["id"] not in [c["id"] for c in due]
    got = [c for c in requests.get(f"{BASE}/contratti", headers=u.h).json() if c["id"] == b["id"]][0]
    assert got["note"] == "TEST_n"


def test_isolation(u, u2):
    cid = u.ids[0]
    assert requests.get(f"{BASE}/contratti", headers=u2.h).json() == []
    assert requests.put(f"{BASE}/contratti/{cid}", headers=u2.h, json={"data_inizio": "2026-01-01"}).status_code == 404
    assert requests.post(f"{BASE}/contratti/{cid}/visite", headers=u2.h, json={"data": "2026-01-01"}).status_code == 404
    assert requests.delete(f"{BASE}/contratti/{cid}", headers=u2.h).status_code == 404


def test_invia_promemoria_idempotent(u):
    mdb.contratti.update_many({"id": {"$in": u.ids}}, {"$set": {"owner_email": "delivered@resend.dev"}})
    r = requests.post(f"{BASE}/contratti/invia-promemoria", headers=u.h, timeout=60)
    assert r.status_code == 200 and r.json()["inviati"] == 1, r.text
    docs = list(mdb.contratti.find({"id": {"$in": u.ids}, "reminded.0": {"$exists": True}}))
    assert docs
    r2 = requests.post(f"{BASE}/contratti/invia-promemoria", headers=u.h, timeout=60)
    assert r2.json()["inviati"] == 0


def test_delete_soft(u):
    cid = u.ids[-1]
    assert requests.delete(f"{BASE}/contratti/{cid}", headers=u.h).status_code == 200
    assert cid not in [c["id"] for c in requests.get(f"{BASE}/contratti", headers=u.h).json()]
    assert mdb.contratti.find_one({"id": cid})["is_deleted"] is True
    assert requests.delete(f"{BASE}/contratti/{cid}", headers=u.h).status_code in (200, 404)


def test_cron_auth_and_dedupe():
    assert requests.post(f"{BASE}/cron/manutenzioni", json={}).status_code == 401
    assert requests.post(f"{BASE}/cron/manutenzioni", json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert SECRET
    wid = "TEST_" + uuid.uuid4().hex
    h = {"Authorization": "Bearer " + SECRET, "X-Webhook-Id": wid}
    r = requests.post(f"{BASE}/cron/manutenzioni", json={}, headers=h, timeout=10)
    assert r.status_code == 200 and r.json() == {"ok": True}
    r2 = requests.post(f"{BASE}/cron/manutenzioni", json={}, headers=h, timeout=10)
    assert r2.json() == {"ok": True, "duplicate": True}
    mdb.cron_runs.delete_one({"_id": wid})


def test_cron_empty_body():
    # scheduler may POST without body; should still ack 2xx
    r = requests.post(f"{BASE}/cron/manutenzioni", headers={"Authorization": "Bearer " + SECRET}, timeout=10)
    assert r.status_code == 200, f"empty body -> {r.status_code} {r.text}"


def test_root_message():
    r = requests.get(f"{BASE}/")
    assert r.status_code == 200 and "message" in r.json()
