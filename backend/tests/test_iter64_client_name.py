# Iter64: POST /api/clients name validation + PUT regression (single kept Firebase user via ITER63_EMAIL)
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
KEY = os.environ["REACT_APP_FIREBASE_API_KEY"]
EMAIL = os.environ.get("ITER63_EMAIL")
CREATED = []


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
    yield ss
    for cid in CREATED:
        ss.delete(f"{BASE}/clients/{cid}")


def _detail(r):
    d = r.json().get("detail")
    return d if isinstance(d, str) else str(d)


def test_missing_name(s):
    r = s.post(BASE + "/clients", json={"date": "2026-11-27"})
    print("missing:", r.status_code, r.text[:300])
    assert r.status_code == 422
    assert "Il nome del cliente è obbligatorio" in _detail(r)


@pytest.mark.parametrize("name", ["", "   ", "\t"])
def test_blank_name(s, name):
    r = s.post(BASE + "/clients", json={"name": name, "date": "2026-11-27"})
    assert r.status_code == 422, r.text
    assert "Il nome del cliente è obbligatorio" in _detail(r)


def test_null_name(s):
    r = s.post(BASE + "/clients", json={"name": None, "date": "2026-11-27"})
    print("null:", r.status_code, r.text[:300])
    assert r.status_code == 422


def test_valid_and_put(s):
    r = s.post(BASE + "/clients", json={"name": "TEST_I64 cli", "date": "2026-11-27", "pending": True, "amount": 100})
    assert r.status_code == 200, r.text
    c = r.json()
    CREATED.append(c["id"])
    assert c["name"] == "TEST_I64 cli"
    u = s.put(f"{BASE}/clients/{c['id']}", json={"name": "TEST_I64 cli2", "date": "2026-11-27", "pending": True, "amount": 150})
    assert u.status_code == 200 and u.json()["name"] == "TEST_I64 cli2" and u.json()["amount"] == 150
    lst = s.get(BASE + "/clients/pending").json()
    assert any(x["id"] == c["id"] and x["name"] == "TEST_I64 cli2" for x in lst)


def test_idempotent_offline_id(s):
    import uuid
    cid = str(uuid.uuid4())
    r1 = s.post(BASE + "/clients", json={"id": cid, "name": "TEST_I64 off", "date": "2026-11-27"})
    assert r1.status_code == 200
    CREATED.append(cid)
    r2 = s.post(BASE + "/clients", json={"id": cid, "name": "TEST_I64 off", "date": "2026-11-27"})
    assert r2.status_code == 200 and r2.json()["id"] == cid
