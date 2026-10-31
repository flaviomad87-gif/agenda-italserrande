# Iter36: quote_ref field on clients + GET /api/clients/quote-refs
import os, time, uuid
import pytest
import requests
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or env["REACT_APP_BACKEND_URL"]).rstrip("/")
KEY = env["REACT_APP_FIREBASE_API_KEY"]
API = f"{BASE_URL}/api"


def _signup():
    email = f"testuser+iter36{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True})
    if r.status_code != 200:
        pytest.skip(f"signup failed {r.text}")
    return {"Authorization": f"Bearer {r.json()['idToken']}"}


@pytest.fixture(scope="module")
def h1():
    return _signup()


@pytest.fixture(scope="module")
def h2():
    return _signup()


@pytest.fixture(scope="module")
def created(h1, h2):
    ids = []
    yield ids
    for hh, cid in ids:
        requests.delete(f"{API}/clients/{cid}", headers=hh)


def _mk(h, created, **kw):
    body = {"date": "2027-03-10", "name": "TEST_q", "pending": True, **kw}
    r = requests.post(f"{API}/clients", headers=h, json=body)
    assert r.status_code == 200, r.text
    created.append((h, r.json()["id"]))
    return r.json()


# quote_ref persisted on create
def test_create_with_quote_ref(h1, created):
    c = _mk(h1, created, name="TEST_withref", quote_ref="abc", quote_number="021")
    assert c["quote_ref"] == "abc" and c["quote_number"] == "021"
    r = requests.get(f"{API}/clients/pending", headers=h1)
    got = [x for x in r.json() if x["id"] == c["id"]][0]
    assert got["quote_ref"] == "abc"


# default quote_ref empty
def test_default_quote_ref_empty(h1, created):
    c = _mk(h1, created, name="TEST_noref")
    assert c["quote_ref"] == ""


# quote_ref null normalized
def test_null_quote_ref(h1, created):
    c = _mk(h1, created, name="TEST_nullref", quote_ref=None)
    assert c["quote_ref"] == ""


# PUT updates quote_ref
def test_put_quote_ref(h1, created):
    c = _mk(h1, created, name="TEST_putref")
    body = {**c, "quote_ref": "xyz", "quote_number": "007"}
    r = requests.put(f"{API}/clients/{c['id']}", headers=h1, json=body)
    assert r.status_code == 200 and r.json()["quote_ref"] == "xyz"
    refs = requests.get(f"{API}/clients/quote-refs", headers=h1).json()
    assert any(x["id"] == c["id"] and x["quote_ref"] == "xyz" for x in refs)
    # clear
    r = requests.put(f"{API}/clients/{c['id']}", headers=h1, json={**body, "quote_ref": ""})
    assert r.json()["quote_ref"] == ""
    refs = requests.get(f"{API}/clients/quote-refs", headers=h1).json()
    assert not any(x["id"] == c["id"] for x in refs)


# quote-refs only for current user, only non-empty, shape
def test_quote_refs_list(h1, h2, created):
    _mk(h2, created, name="TEST_other", quote_ref="other-ref")
    r = requests.get(f"{API}/clients/quote-refs", headers=h1)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    refs = {x["quote_ref"] for x in data}
    assert "abc" in refs and "other-ref" not in refs and "" not in refs
    for x in data:
        assert set(x.keys()) == {"id", "name", "quote_ref"}
    d2 = requests.get(f"{API}/clients/quote-refs", headers=h2).json()
    assert [x["quote_ref"] for x in d2] == ["other-ref"]


# auth required
def test_quote_refs_no_auth():
    r = requests.get(f"{API}/clients/quote-refs")
    assert r.status_code in (401, 403)


# regression: to-quote list
def test_to_quote_regression(h1, created):
    c = _mk(h1, created, name="TEST_toquote", to_quote=True)
    r = requests.get(f"{API}/clients/to-quote", headers=h1)
    assert any(x["id"] == c["id"] for x in r.json())
    r = requests.put(f"{API}/clients/{c['id']}", headers=h1, json={**c, "to_quote": False})
    assert r.status_code == 200
    r = requests.get(f"{API}/clients/to-quote", headers=h1)
    assert not any(x["id"] == c["id"] for x in r.json())
