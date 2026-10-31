"""Iteration 32 — Rilievi Sezionali CRUD, idempotent POST, client filter, partial PUT, isolation."""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api/rilievi-sezionali"
KEY = os.environ.get("REACT_APP_FIREBASE_API_KEY") or _env.get("REACT_APP_FIREBASE_API_KEY")
SIGNUP_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}"


def _sess():
    email = f"testuser+i32{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    r = requests.post(SIGNUP_URL, json={"email": email, "password": "TestPassword123!", "returnSecureToken": True}, timeout=20)
    assert r.status_code == 200, r.text[:300]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['idToken']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def a():
    s = _sess()
    yield s
    for it in s.get(API, timeout=30).json():
        s.delete(f"{API}/{it['id']}", timeout=30)


@pytest.fixture(scope="module")
def b():
    return _sess()


# Auth
def test_requires_auth():
    assert requests.get(API, timeout=30).status_code in (401, 403)
    assert requests.post(API, json={}, timeout=30).status_code in (401, 403)


# Create + get
def test_create_and_get(a):
    payload = {"ditta": "TEST_Ditta", "fax": "0123", "l": "2500", "h": "2200", "tipo": "B",
               "motore": True, "portina": True, "client_id": "TEST_client1", "riferimento_cliente": "TEST_Rossi"}
    r = a.post(API, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d["id"], str) and d["fax"] == "0123" and d["motore"] is True and d["tipo"] == "B"
    assert "_id" not in d and "user_id" in d
    g = a.get(f"{API}/{d['id']}", timeout=30)
    assert g.status_code == 200
    assert g.json()["l"] == "2500" and g.json()["fax"] == "0123"


# Idempotent POST with client id
def test_idempotent_post(a):
    cid = str(uuid.uuid4())
    r1 = a.post(API, json={"id": cid, "ditta": "TEST_first"}, timeout=30)
    r2 = a.post(API, json={"id": cid, "ditta": "TEST_second"}, timeout=30)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["id"] == cid == r2.json()["id"]
    assert r2.json()["ditta"] == "TEST_first"
    cnt = [x for x in a.get(API, timeout=30).json() if x["id"] == cid]
    assert len(cnt) == 1


# List sorting + filter
def test_list_sorted_and_filter(a):
    time.sleep(0.05)
    r = a.post(API, json={"ditta": "TEST_newest", "client_id": "TEST_client2"}, timeout=30)
    newest = r.json()["id"]
    lst = a.get(API, timeout=30).json()
    assert lst[0]["id"] == newest
    dates = [x["created_at"] for x in lst]
    assert dates == sorted(dates, reverse=True)
    f = a.get(API, params={"client_id": "TEST_client2"}, timeout=30).json()
    assert len(f) == 1 and f[0]["id"] == newest
    f1 = a.get(API, params={"client_id": "TEST_client1"}, timeout=30).json()
    assert all(x["client_id"] == "TEST_client1" for x in f1) and len(f1) == 1


# Partial update, booleans false persist
def test_put_partial_and_false(a):
    d = a.post(API, json={"ditta": "TEST_upd", "motore": True, "sblocco": True, "l": "1000"}, timeout=30).json()
    r = a.put(f"{API}/{d['id']}", json={"motore": False, "fax": "999"}, timeout=30)
    assert r.status_code == 200
    u = r.json()
    assert u["motore"] is False and u["fax"] == "999" and u["sblocco"] is True and u["l"] == "1000"
    g = a.get(f"{API}/{d['id']}", timeout=30).json()
    assert g["motore"] is False and g["fax"] == "999" and g["ditta"] == "TEST_upd"
    assert g["updated_at"] >= g["created_at"]
    # empty patch
    assert a.put(f"{API}/{d['id']}", json={}, timeout=30).status_code == 200
    assert a.put(f"{API}/nonexistent-xyz", json={"fax": "1"}, timeout=30).status_code == 404


# Delete
def test_delete(a):
    d = a.post(API, json={"ditta": "TEST_del"}, timeout=30).json()
    assert a.delete(f"{API}/{d['id']}", timeout=30).status_code == 200
    assert a.get(f"{API}/{d['id']}", timeout=30).status_code == 404
    assert a.delete(f"{API}/{d['id']}", timeout=30).status_code == 404


# Isolation
def test_isolation(a, b):
    d = a.post(API, json={"ditta": "TEST_iso"}, timeout=30).json()
    assert b.get(f"{API}/{d['id']}", timeout=30).status_code == 404
    assert b.put(f"{API}/{d['id']}", json={"ditta": "hacked"}, timeout=30).status_code == 404
    assert b.delete(f"{API}/{d['id']}", timeout=30).status_code == 404
    assert all(x["id"] != d["id"] for x in b.get(API, timeout=30).json())
    # idempotent POST with someone else's id must not leak
    r = b.post(API, json={"id": d["id"], "ditta": "TEST_b"}, timeout=30)
    assert r.status_code == 200
    assert a.get(f"{API}/{d['id']}", timeout=30).json()["ditta"] == "TEST_iso"
