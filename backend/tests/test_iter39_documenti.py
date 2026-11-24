# Iter39: /api/documenti (Dichiarazione CE + Registro Manutenzione) CRUD, numbering, isolation, auth
import os, uuid, pytest, requests

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')


def _signup():
    email = f"testuser+iter39{uuid.uuid4().hex[:10]}@italserrande.test"
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True})
    if r.status_code != 200:
        pytest.skip("firebase signup failed")
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def users():
    toks = [_signup(), _signup()]
    hs = [{"Authorization": "Bearer " + t} for t in toks]
    yield hs
    for h in hs:  # delete only docs created by these ephemeral users
        for d in requests.get(f"{BASE}/documenti", headers=h).json():
            requests.delete(f"{BASE}/documenti/{d['id']}", headers=h)
    for t in toks:
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": t})


def _post(h, **kw):
    return requests.post(f"{BASE}/documenti", headers=h, json=kw)


def test_no_token_403():
    assert requests.get(f"{BASE}/documenti").status_code in (401, 403)
    assert requests.post(f"{BASE}/documenti", json={"kind": "ce"}).status_code in (401, 403)


def test_invalid_kind_422(users):
    assert _post(users[0], kind="xxx").status_code == 422
    assert requests.get(f"{BASE}/documenti?kind=xxx", headers=users[0]).status_code == 422


def test_numbering_per_kind_and_year(users):
    h = users[0]
    a = _post(h, kind="ce", cliente="TEST_a", data="2026-02-01").json()
    b = _post(h, kind="ce", cliente="TEST_b", data="2026-05-01").json()
    m = _post(h, kind="manutenzione", cliente="TEST_m", data="2026-03-01").json()
    y = _post(h, kind="ce", cliente="TEST_y", data="2027-01-10").json()
    assert (a["numero"], a["anno"]) == (1, "2026")
    assert (b["numero"], b["anno"]) == (2, "2026")
    assert (m["numero"], m["anno"]) == (1, "2026")
    assert (y["numero"], y["anno"]) == (1, "2027")
    assert "_id" not in a and "user_id" not in a


def test_idempotent_with_id(users):
    h = users[0]
    did = str(uuid.uuid4())
    r1 = _post(h, id=did, kind="manutenzione", cliente="TEST_idem", data="2026-04-01").json()
    r2 = _post(h, id=did, kind="manutenzione", cliente="TEST_idem2", data="2026-04-01").json()
    assert r1["id"] == r2["id"] == did and r1["numero"] == r2["numero"]
    lst = requests.get(f"{BASE}/documenti?kind=manutenzione", headers=h).json()
    assert sum(1 for d in lst if d["id"] == did) == 1


def test_fields_persist_and_put(users):
    h = users[0]
    norme = [{"applica": i % 2 == 0, "nota": f"nota {i}"} for i in range(8)]
    d = _post(h, kind="ce", cliente="TEST_put", indirizzo="via x", data="2026-06-01",
              fields={"tipologia": "serranda", "norme": norme}).json()
    r = requests.put(f"{BASE}/documenti/{d['id']}", headers=h, json={"cliente": "TEST_put2", "fields": {"tipologia": "cancello", "norme": norme}})
    assert r.status_code == 200 and r.json()["cliente"] == "TEST_put2"
    got = [x for x in requests.get(f"{BASE}/documenti?kind=ce", headers=h).json() if x["id"] == d["id"]][0]
    assert got["fields"]["tipologia"] == "cancello" and got["fields"]["norme"] == norme
    assert got["numero"] == d["numero"] and got["indirizzo"] == "via x"
    assert requests.put(f"{BASE}/documenti/nonexist", headers=h, json={"cliente": "x"}).status_code == 404


def test_kind_filter(users):
    h = users[0]
    ce = requests.get(f"{BASE}/documenti?kind=ce", headers=h).json()
    man = requests.get(f"{BASE}/documenti?kind=manutenzione", headers=h).json()
    allx = requests.get(f"{BASE}/documenti", headers=h).json()
    assert all(d["kind"] == "ce" for d in ce) and all(d["kind"] == "manutenzione" for d in man)
    assert len(allx) == len(ce) + len(man)


def test_isolation(users):
    h0, h1 = users
    d = _post(h0, kind="ce", cliente="TEST_iso", data="2026-01-01").json()
    assert all(x["id"] != d["id"] for x in requests.get(f"{BASE}/documenti", headers=h1).json())
    assert requests.put(f"{BASE}/documenti/{d['id']}", headers=h1, json={"cliente": "hack"}).status_code == 404
    assert requests.delete(f"{BASE}/documenti/{d['id']}", headers=h1).status_code == 404
    # user1 numbering independent
    assert _post(h1, kind="ce", cliente="TEST_u1", data="2026-01-01").json()["numero"] == 1


def test_soft_delete(users):
    h = users[0]
    d = _post(h, kind="manutenzione", cliente="TEST_del", data="2026-07-01").json()
    assert requests.delete(f"{BASE}/documenti/{d['id']}", headers=h).json() == {"ok": True}
    assert all(x["id"] != d["id"] for x in requests.get(f"{BASE}/documenti", headers=h).json())
    assert requests.put(f"{BASE}/documenti/{d['id']}", headers=h, json={"cliente": "x"}).status_code == 404
    assert requests.delete(f"{BASE}/documenti/nonexist", headers=h).status_code == 404
