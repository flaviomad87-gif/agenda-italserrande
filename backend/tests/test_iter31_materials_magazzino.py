"""Iteration 31 — Magazzino (materials CRUD), isolation, auth, time-entries idempotency,
clients payments preservation, summary + suppliers."""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
KEY = os.environ.get("REACT_APP_FIREBASE_API_KEY") or _env.get("REACT_APP_FIREBASE_API_KEY")
SIGNUP_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}"
MONTH = "2027-04"


def _signup():
    email = f"testuser+i31{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    r = requests.post(SIGNUP_URL, json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}, timeout=20)
    assert r.status_code == 200, r.text[:300]
    return r.json()["idToken"]


def _sess():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {_signup()}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def a():
    return _sess()


@pytest.fixture(scope="module")
def b():
    return _sess()


# ---------- Auth ----------
ENDPOINTS = [
    "/clients", "/employees", "/time-entries", "/materials", f"/expenses?month={MONTH}",
    f"/advances?month={MONTH}", f"/suppliers/summary?month={MONTH}", f"/summary?month={MONTH}",
    "/summary/year?year=2027", "/recurring-expenses", "/clients/pending",
]


@pytest.mark.parametrize("ep", ENDPOINTS)
def test_endpoint_ok_with_auth(a, ep):
    r = a.get(f"{API}{ep}", timeout=60)
    assert r.status_code == 200, f"{ep}: {r.status_code} {r.text[:200]}"


@pytest.mark.parametrize("ep", ENDPOINTS)
def test_endpoint_rejects_without_auth(ep):
    r = requests.get(f"{API}{ep}", timeout=30)
    assert r.status_code in (401, 403), f"{ep}: {r.status_code}"


# ---------- Materials CRUD ----------
class TestMaterials:
    def test_full_crud(self, a):
        r1 = a.post(f"{API}/materials", json={"name": "TEST_Zeta motore", "quantity": 2, "notes": "n"})
        assert r1.status_code == 200, r1.text
        m1 = r1.json()
        assert m1["name"] == "TEST_Zeta motore" and m1["quantity"] == 2 and "_id" not in m1
        r2 = a.post(f"{API}/materials", json={"name": "TEST_Alfa lamella", "quantity": 0})
        m2 = r2.json()
        lst = a.get(f"{API}/materials").json()
        names = [x["name"] for x in lst]
        assert names == sorted(names)
        assert names.index("TEST_Alfa lamella") < names.index("TEST_Zeta motore")

        # PUT
        r = a.put(f"{API}/materials/{m1['id']}", json={"name": "TEST_Zeta motore 2", "quantity": 5})
        assert r.status_code == 200 and r.json()["quantity"] == 5 and r.json()["name"] == "TEST_Zeta motore 2"
        got = [x for x in a.get(f"{API}/materials").json() if x["id"] == m1["id"]][0]
        assert got["quantity"] == 5 and got["notes"] == "n"

        # adjust +
        r = a.post(f"{API}/materials/{m1['id']}/adjust?delta=3")
        assert r.status_code == 200 and r.json()["quantity"] == 8
        r = a.post(f"{API}/materials/{m1['id']}/adjust?delta=-1")
        assert r.json()["quantity"] == 7
        # clamp to 0
        r = a.post(f"{API}/materials/{m1['id']}/adjust?delta=-100")
        assert r.json()["quantity"] == 0
        r = a.post(f"{API}/materials/{m2['id']}/adjust?delta=-1")
        assert r.json()["quantity"] == 0

        # 404s
        assert a.post(f"{API}/materials/nope/adjust?delta=1").status_code == 404
        assert a.put(f"{API}/materials/nope", json={"quantity": 1}).status_code == 404

        # DELETE
        for m in (m1, m2):
            assert a.delete(f"{API}/materials/{m['id']}").status_code == 200
        ids = [x["id"] for x in a.get(f"{API}/materials").json()]
        assert m1["id"] not in ids and m2["id"] not in ids
        assert a.delete(f"{API}/materials/{m1['id']}").status_code == 404

    def test_idempotent_post(self, a):
        mid = str(uuid.uuid4())
        r1 = a.post(f"{API}/materials", json={"id": mid, "name": "TEST_Idem", "quantity": 1})
        r2 = a.post(f"{API}/materials", json={"id": mid, "name": "TEST_Idem changed", "quantity": 9})
        assert r1.status_code == r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"] == mid
        assert r2.json()["name"] == "TEST_Idem"
        assert len([x for x in a.get(f"{API}/materials").json() if x["id"] == mid]) == 1
        a.delete(f"{API}/materials/{mid}")

    def test_validation_missing_name(self, a):
        r = a.post(f"{API}/materials", json={"quantity": 1})
        assert r.status_code == 422

    def test_isolation(self, a, b):
        m = a.post(f"{API}/materials", json={"name": "TEST_Isol A", "quantity": 4}).json()
        assert m["id"] not in [x["id"] for x in b.get(f"{API}/materials").json()]
        assert b.post(f"{API}/materials/{m['id']}/adjust?delta=1").status_code == 404
        assert b.put(f"{API}/materials/{m['id']}", json={"quantity": 99}).status_code == 404
        assert b.delete(f"{API}/materials/{m['id']}").status_code == 404
        # same id posted by B must not return A's doc
        rb = b.post(f"{API}/materials", json={"id": m["id"], "name": "TEST_B hijack", "quantity": 1})
        if rb.status_code == 200:
            assert rb.json()["name"] == "TEST_B hijack", "B received A's document via id collision"
        got = [x for x in a.get(f"{API}/materials").json() if x["id"] == m["id"]]
        assert got and got[0]["quantity"] == 4
        a.delete(f"{API}/materials/{m['id']}")
        b.delete(f"{API}/materials/{m['id']}")


# ---------- Time entries idempotency ----------
def test_time_entries_idempotent(a):
    emp = a.post(f"{API}/employees", json={"name": "TEST_IT31", "daily_hours": 8}).json()
    d = "2027-04-10"  # saturday
    r1 = a.post(f"{API}/time-entries", json={"employee_id": emp["id"], "date": d, "clock_in": "2027-04-10T08:00:00Z", "break_minutes": 0})
    r2 = a.post(f"{API}/time-entries", json={"employee_id": emp["id"], "date": d, "clock_out": "2027-04-10T08:30:00Z"})
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    rows = a.get(f"{API}/time-entries?date={d}&employee_id={emp['id']}").json()
    assert len(rows) == 1
    assert rows[0]["clock_in"].startswith("2027-04-10T08:00") and rows[0]["clock_out"].startswith("2027-04-10T08:30")
    assert rows[0]["break_minutes"] == 0
    a.delete(f"{API}/time-entries/{rows[0]['id']}")
    a.delete(f"{API}/employees/{emp['id']}")


# ---------- Clients ----------
class TestClients:
    def test_create_search_zero_payment_preserved(self, a):
        payload = {
            "name": "TEST_Rossi Serranda", "date": f"{MONTH}-05", "amount": 1000, "status": "lavoro_eseguito",
            "vat_rate": 0, "materials": [{"description": "Motore", "amount": 200, "supplier": "TEST_Forn1", "source": "contanti"}],
            "payments": [{"type": "saldo", "amount": 0, "method": "bonifico"}],
        }
        r = a.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        c = r.json()
        assert len(c["payments"]) == 1 and c["payments"][0]["method"] == "bonifico" and c["payments"][0]["amount"] == 0
        lst = a.get(f"{API}/clients?month={MONTH}").json()
        got = [x for x in lst if x["id"] == c["id"]][0]
        assert len(got["payments"]) == 1 and got["payments"][0]["method"] == "bonifico"
        s = a.get(f"{API}/clients/search?q=rossi").json()
        assert c["id"] in [x["id"] for x in s]
        assert a.get(f"{API}/clients/search?q=zzzznotexist").json() == []

        # suppliers summary
        sup = a.get(f"{API}/suppliers/summary?month={MONTH}").json()
        names = {x["name"]: x for x in sup["suppliers"]}
        assert "TEST_Forn1" in names and names["TEST_Forn1"]["total"] == 200
        assert names["TEST_Forn1"]["total_contanti"] == 200

        # monthly summary keys
        sm = a.get(f"{API}/summary?month={MONTH}").json()
        print("SUMMARY margine_by_method:", sm.get("incassi_margine_by_method"), "balance", sm.get("balance"))
        assert "incassi_margine_by_method" in sm
        a.delete(f"{API}/clients/{c['id']}")

    def test_legacy_payment_method_fallback(self, a):
        c = a.post(f"{API}/clients", json={"name": "TEST_Legacy", "date": f"{MONTH}-06", "amount": 500,
                                            "status": "lavoro_eseguito", "vat_rate": 0, "payment_method": "contanti"}).json()
        sm = a.get(f"{API}/summary?month={MONTH}").json()
        assert sm["incassi_margine_by_method"]["contanti"] >= 500
        a.delete(f"{API}/clients/{c['id']}")
