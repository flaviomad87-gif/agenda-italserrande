# Iter37: /api/quotes CRUD, numbering, import, quote-settings, isolation
import os, time, uuid
import pytest
import requests
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or env["REACT_APP_BACKEND_URL"]).rstrip("/")
KEY = env["REACT_APP_FIREBASE_API_KEY"]
API = f"{BASE_URL}/api"


def _signup():
    email = f"testuser+iter37{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True})
    if r.status_code != 200:
        pytest.skip(f"signup failed {r.text}")
    tok = r.json()["idToken"]
    return {"Authorization": f"Bearer {tok}"}, tok


@pytest.fixture(scope="module")
def u1():
    h, tok = _signup()
    yield h
    _cleanup(h, tok)


@pytest.fixture(scope="module")
def u2():
    h, tok = _signup()
    yield h
    _cleanup(h, tok)


def _cleanup(h, tok):
    for q in requests.get(f"{API}/quotes", headers=h).json() or []:
        requests.delete(f"{API}/quotes/{q['id']}", headers=h)
    for path in ["/clients/pending", "/clients/to-quote"]:
        for c in requests.get(API + path, headers=h).json() or []:
            requests.delete(f"{API}/clients/{c['id']}", headers=h)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": tok})


# settings defaults
def test_settings_default(u1):
    r = requests.get(f"{API}/quote-settings", headers=u1)
    assert r.status_code == 200
    d = r.json()
    assert d["company"]["name"] == "Italserrande S.r.l." and d["counter"] == 0


# create auto number, uppercase, defaults
def test_create_numbering_defaults(u1):
    r = requests.post(f"{API}/quotes", headers=u1, json={"clientName": " mario rossi ", "clientAddress": "via roma 1"})
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["number"] == "001"
    assert q["clientName"] == "MARIO ROSSI" and q["clientAddress"] == "VIA ROMA 1"
    assert q["subject"] == "OFFERTA" and "acconto" in q["paymentTerms"]
    assert q["footerNote"] == "Firma e timbro per accettazione."
    assert q["status"] == "draft" and len(q["lineItems"]) == 1
    assert "_id" not in q and "user_id" not in q
    q2 = requests.post(f"{API}/quotes", headers=u1, json={"clientName": "b"}).json()
    assert q2["number"] == "002"
    # explicit high number -> next = max+1
    requests.post(f"{API}/quotes", headers=u1, json={"clientName": "c", "number": "010"})
    q4 = requests.post(f"{API}/quotes", headers=u1, json={"clientName": "d"}).json()
    assert q4["number"] == "011"


# idempotent same id
def test_idempotent(u1):
    qid = str(uuid.uuid4())
    a = requests.post(f"{API}/quotes", headers=u1, json={"id": qid, "clientName": "idem"}).json()
    b = requests.post(f"{API}/quotes", headers=u1, json={"id": qid, "clientName": "other"}).json()
    assert a["id"] == b["id"] == qid and a["number"] == b["number"] and b["clientName"] == "IDEM"
    assert len([x for x in requests.get(f"{API}/quotes", headers=u1).json() if x["id"] == qid]) == 1


# list sorted, get, put
def test_list_get_put(u1):
    requests.post(f"{API}/quotes", headers=u1, json={"clientName": "old", "date": "2020-01-01"})
    lst = requests.get(f"{API}/quotes", headers=u1).json()
    dates = [x["date"] for x in lst]
    assert dates == sorted(dates, reverse=True)
    q = lst[0]
    g = requests.get(f"{API}/quotes/{q['id']}", headers=u1)
    assert g.status_code == 200 and g.json()["id"] == q["id"]
    body = {**q, "status": "accepted", "lineItems": [{"description": "x", "amount": 100, "vatRate": 10}]}
    p = requests.put(f"{API}/quotes/{q['id']}", headers=u1, json=body)
    assert p.status_code == 200 and p.json()["status"] == "accepted"
    g = requests.get(f"{API}/quotes/{q['id']}", headers=u1).json()
    assert g["lineItems"][0]["amount"] == 100 and g["number"] == q["number"]
    assert requests.get(f"{API}/quotes/nope", headers=u1).status_code == 404
    assert requests.put(f"{API}/quotes/nope", headers=u1, json={}).status_code == 404


# delete soft + clears client quote_ref
def test_delete_clears_ref(u1):
    q = requests.post(f"{API}/quotes", headers=u1, json={"clientName": "del"}).json()
    c = requests.post(f"{API}/clients", headers=u1, json={"date": "2027-03-10", "name": "TEST_qdel", "pending": True,
                                                         "quote_ref": q["id"], "quote_number": q["number"]}).json()
    r = requests.delete(f"{API}/quotes/{q['id']}", headers=u1)
    assert r.status_code == 200
    assert requests.get(f"{API}/quotes/{q['id']}", headers=u1).status_code == 404
    assert not any(x["id"] == q["id"] for x in requests.get(f"{API}/quotes", headers=u1).json())
    refs = requests.get(f"{API}/clients/quote-refs", headers=u1).json()
    assert not any(x["id"] == c["id"] for x in refs)
    assert requests.delete(f"{API}/quotes/nope", headers=u1).status_code == 404


# isolation
def test_isolation(u1, u2):
    q = requests.get(f"{API}/quotes", headers=u1).json()[0]
    assert requests.get(f"{API}/quotes/{q['id']}", headers=u2).status_code == 404
    assert requests.put(f"{API}/quotes/{q['id']}", headers=u2, json={}).status_code == 404
    assert requests.delete(f"{API}/quotes/{q['id']}", headers=u2).status_code == 404
    assert requests.get(f"{API}/quotes", headers=u2).json() == []
    assert requests.get(f"{API}/quotes", headers={}).status_code in (401, 403)


# import idempotent, counter, relink, company
def test_import(u2):
    src = "old-" + uuid.uuid4().hex[:6]
    c = requests.post(f"{API}/clients", headers=u2, json={"date": "2027-03-10", "name": "TEST_imp", "pending": True,
                                                         "quote_ref": src, "quote_number": "045"}).json()
    payload = {"quotes": [
        {"source_id": src, "number": "045", "date": "2025-05-01", "clientName": "IMP A", "status": "sent",
         "lineItems": [{"description": "a", "amount": 500, "vatRate": 22}]},
        {"source_id": src + "b", "number": "050", "date": "2025-06-01", "clientName": "IMP B"},
    ], "company": {"name": "TEST_Co", "phone": "000"}, "counter": 48}
    r = requests.post(f"{API}/quotes/import", headers=u2, json=payload)
    assert r.status_code == 200, r.text
    assert r.json() == {"imported": 2, "counter": 50}
    r2 = requests.post(f"{API}/quotes/import", headers=u2, json=payload).json()
    assert r2["imported"] == 0
    lst = requests.get(f"{API}/quotes", headers=u2).json()
    assert len(lst) == 2
    new_id = [x for x in lst if x["source_id"] == src][0]["id"]
    assert new_id != src
    refs = requests.get(f"{API}/clients/quote-refs", headers=u2).json()
    assert [x["quote_ref"] for x in refs if x["id"] == c["id"]] == [new_id]
    s = requests.get(f"{API}/quote-settings", headers=u2).json()
    assert s["company"]["name"] == "TEST_Co" and s["company"]["vat"] == "09270881007" and s["counter"] == 50
    nq = requests.post(f"{API}/quotes", headers=u2, json={"clientName": "n"}).json()
    assert nq["number"] == "051"


# PUT settings
def test_put_settings(u1):
    r = requests.put(f"{API}/quote-settings", headers=u1, json={"company": {"name": "TEST_X"}})
    assert r.status_code == 200 and r.json()["company"]["name"] == "TEST_X"
    assert requests.get(f"{API}/quote-settings", headers=u1).json()["company"]["email"] == "italserrande@libero.it"


# observation: PUT on soft-deleted quote / partial PUT
def test_put_deleted_quote_returns_404(u1):
    q = requests.post(f"{API}/quotes", headers=u1, json={"clientName": "zz"}).json()
    requests.delete(f"{API}/quotes/{q['id']}", headers=u1)
    r = requests.put(f"{API}/quotes/{q['id']}", headers=u1, json={**q})
    assert r.status_code == 404, f"PUT on deleted quote returned {r.status_code}"
