# Iter63 single-user API regression (used when Firebase signUp is rate-limited).
# Needs an existing Firebase test user: ITER63_EMAIL env (password TestPassword123!).
import os
import uuid

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
KEY = os.environ["REACT_APP_FIREBASE_API_KEY"]
EMAIL = os.environ.get("ITER63_EMAIL")


@pytest.fixture(scope="module")
def s():
    if not EMAIL:
        pytest.skip("ITER63_EMAIL not set")
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                      json={"email": EMAIL, "password": "TestPassword123!", "returnSecureToken": True}, timeout=15)
    if r.status_code != 200:
        pytest.skip("signin failed")
    ss = requests.Session()
    ss.headers.update({"Authorization": "Bearer " + r.json()["idToken"]})
    return ss


# Auth gates
def test_auth_required():
    for p in ["/clients", "/expenses", "/contratti", "/documenti", "/quotes", "/materials", "/rilievi-sezionali"]:
        assert requests.get(BASE + p, timeout=15).status_code in (401, 403), p


def test_bad_token():
    r = requests.get(BASE + "/clients", headers={"Authorization": "Bearer xxx"}, timeout=15)
    assert r.status_code == 401


# Clients CRUD
def test_client_crud(s):
    r = s.post(BASE + "/clients", json={"name": "TEST_I63 cli", "date": "2026-11-27", "pending": True, "amount": 500})
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["name"] == "TEST_I63 cli" and "_id" not in c
    assert any(x["id"] == c["id"] for x in s.get(BASE + "/clients/pending").json())
    u = s.put(f"{BASE}/clients/{c['id']}", json={"name": "TEST_I63 cli2", "date": "2026-11-27"})
    assert u.status_code == 200 and u.json()["name"] == "TEST_I63 cli2"
    assert s.delete(f"{BASE}/clients/{c['id']}").status_code == 200
    assert not any(x["id"] == c["id"] for x in s.get(BASE + "/clients/pending").json())


def test_client_validation(s):
    assert s.post(BASE + "/clients", json={"date": "2026-11-27"}).status_code == 422
    assert s.put(f"{BASE}/clients/{uuid.uuid4()}", json={"name": "x", "date": "2026-11-27"}).status_code == 404
    assert s.delete(f"{BASE}/clients/{uuid.uuid4()}").status_code == 404


# Expenses CRUD
def test_expense_crud(s):
    r = s.post(BASE + "/expenses", json={"category": "TEST_I63 spesa", "date": "2026-11-27", "amount": 12.5})
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["amount"] == 12.5
    lst = s.get(BASE + "/expenses", params={"month": "2026-11"}).json()
    assert any(x["id"] == e["id"] for x in lst)
    u = s.put(f"{BASE}/expenses/{e['id']}", json={"category": "TEST_I63 spesa", "date": "2026-11-27", "amount": 20})
    assert u.status_code == 200 and u.json()["amount"] == 20
    assert s.delete(f"{BASE}/expenses/{e['id']}").status_code == 200


# Contratti
def test_contratto_crud(s):
    r = s.post(BASE + "/contratti", json={"cliente": "TEST_I63 contr", "indirizzo": "Via X", "data_inizio": "2026-11-27",
                                          "durata_mesi": 12, "frequenza_mesi": 6, "impianti": [{"descrizione": "S", "matricola": "M"}]})
    assert r.status_code == 200, r.text
    c = r.json()
    v = s.post(f"{BASE}/contratti/{c['id']}/visite", json={"data": "2026-11-28", "nota": "t"})
    assert v.status_code == 200, v.text
    assert s.delete(f"{BASE}/contratti/{c['id']}").status_code == 200
    assert not any(x["id"] == c["id"] for x in s.get(BASE + "/contratti").json())


# Documenti incl. public impianto
def test_documenti_and_public(s):
    r = s.post(BASE + "/documenti", json={"kind": "pratica", "cliente": "TEST_I63 prat", "indirizzo": "Via P", "data": "2026-11-27",
                                          "fields": {"tipo_chiusura": "sezionale"}})
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d["public_token"]
    p = requests.get(f"{BASE}/public/impianto/{tok}", timeout=15)
    assert p.status_code == 200 and p.json()["tipo_chiusura"] == "sezionale"
    assert "cliente" not in p.json()
    assert requests.get(f"{BASE}/public/impianto/short", timeout=15).status_code == 404
    assert s.post(BASE + "/documenti", json={"kind": "bogus"}).status_code == 422
    assert s.post(BASE + "/documenti", json={"kind": "ce", "data": "27/11/2026"}).status_code == 422
    assert s.delete(f"{BASE}/documenti/{d['id']}").status_code == 200
    assert requests.get(f"{BASE}/public/impianto/{tok}", timeout=15).status_code == 404


# Quotes
def test_quote_crud(s):
    r = s.post(BASE + "/quotes", json={"clientName": "TEST_I63 q", "lineItems": [{"description": "a", "amount": 100, "vatRate": 22}]})
    assert r.status_code == 200, r.text
    q = r.json()
    g = s.get(f"{BASE}/quotes/{q['id']}")
    assert g.status_code == 200
    assert s.delete(f"{BASE}/quotes/{q['id']}").status_code == 200
    assert s.get(f"{BASE}/quotes/{q['id']}").status_code == 404


# Materials and rilievi
def test_materials_rilievi(s):
    m = s.post(BASE + "/materials", json={"name": "TEST_I63 vite", "quantity": 3})
    assert m.status_code == 200, m.text
    assert s.delete(f"{BASE}/materials/{m.json()['id']}").status_code == 200
    r = s.post(BASE + "/rilievi-sezionali", json={"ditta": "TEST_I63 ril"})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    assert s.get(f"{BASE}/rilievi-sezionali/{rid}").status_code == 200
    assert s.delete(f"{BASE}/rilievi-sezionali/{rid}").status_code == 200
    assert s.get(f"{BASE}/rilievi-sezionali/{rid}").status_code == 404


# Summary/badges endpoints used by AppShell
def test_badges_and_credito(s):
    for p in ["/clients/unpaid", "/clients/awaiting", "/clients/to-quote", "/clients/to-invoice", "/contratti/in-scadenza",
              "/assistente/credito", "/employees"]:
        assert s.get(BASE + p).status_code == 200, p
