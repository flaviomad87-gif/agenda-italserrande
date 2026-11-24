# Iter40: /api/documenti kind 'pratica' - create, separate numbering, persist fields, put, delete
import uuid, pytest, requests

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BASE = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/") + "/api"
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')


def _signup():
    email = f"testuser+iter40{uuid.uuid4().hex[:10]}@italserrande.test"
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": email, "password": "TestPassword123!", "returnSecureToken": True})
    if r.status_code != 200:
        pytest.skip("firebase signup failed")
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def h():
    tok = _signup()
    hd = {"Authorization": "Bearer " + tok}
    created = []
    hd_list = (hd, created)
    yield hd_list
    for did in created:
        requests.delete(f"{BASE}/documenti/{did}", headers=hd)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": tok})


def _post(h, **kw):
    r = requests.post(f"{BASE}/documenti", headers=h[0], json=kw)
    if r.status_code == 200:
        h[1].append(r.json()["id"])
    return r


FIELDS = {
    "tipo_chiusura": "sezionale", "sicurezze": ["fotocellule", "coste"], "collaudo": {"fissaggi": "C", "uomo_presente": "NA"},
    "dm37": {"responsabile": "TEST_Mario", "tipo": "nuovo", "progetto": True, "progettista": "Ing X"},
    "includi": {"ce": True, "manuale": False}, "matricola": "TEST_MAT1", "norme": [{"applica": True, "nota": ""}] * 8,
}


def test_pratica_numbering_separate(h):
    p1 = _post(h, kind="pratica", cliente="TEST_p1", data="2026-01-10", fields=FIELDS)
    assert p1.status_code == 200
    ce = _post(h, kind="ce", cliente="TEST_ce", data="2026-01-10").json()
    man = _post(h, kind="manutenzione", cliente="TEST_m", data="2026-01-10").json()
    p2 = _post(h, kind="pratica", cliente="TEST_p2", data="2026-02-10").json()
    assert (p1.json()["numero"], p1.json()["anno"], p1.json()["kind"]) == (1, "2026", "pratica")
    assert p2["numero"] == 2
    assert ce["numero"] == 1 and man["numero"] == 1
    assert "_id" not in p2 and "user_id" not in p2


def test_pratica_fields_persist_put_delete(h):
    d = _post(h, kind="pratica", cliente="TEST_persist", indirizzo="via y", data="2026-03-01", fields=FIELDS).json()
    lst = requests.get(f"{BASE}/documenti?kind=pratica", headers=h[0]).json()
    got = [x for x in lst if x["id"] == d["id"]][0]
    assert got["fields"] == FIELDS
    assert all(x["kind"] == "pratica" for x in lst)
    nf = {**FIELDS, "tipo_chiusura": "battente", "collaudo": {}}
    # frontend sends the full form on PUT (extra keys must be ignored)
    r = requests.put(f"{BASE}/documenti/{d['id']}", headers=h[0], json={**d, "cliente": "TEST_persist2", "fields": nf, "numero": 99})
    assert r.status_code == 200
    j = r.json()
    assert j["cliente"] == "TEST_persist2" and j["fields"]["tipo_chiusura"] == "battente" and j["numero"] == d["numero"]
    assert requests.delete(f"{BASE}/documenti/{d['id']}", headers=h[0]).status_code == 200
    lst = requests.get(f"{BASE}/documenti?kind=pratica", headers=h[0]).json()
    assert not any(x["id"] == d["id"] for x in lst)


def test_concurrent_numbering_unique(h):
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda i: _post(h, kind="pratica", cliente=f"TEST_c{i}", data="2028-01-01").json(), range(6)))
    nums = sorted(r["numero"] for r in res)
    assert nums == list(range(1, 7)), nums
