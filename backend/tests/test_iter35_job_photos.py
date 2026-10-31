# Iter35: Job photos (Object Storage) - upload/list/file/delete/isolation/auth
import io
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image

env = dotenv_values("/app/frontend/.env")
KEY = env["REACT_APP_FIREBASE_API_KEY"]
BASE_URL = env["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _signup(tag):
    email = f"testuser+i35{tag}{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
        json={"email": email, "password": "TestPassword123!", "returnSecureToken": True},
        timeout=30,
    ).json()
    if "idToken" not in r:
        pytest.skip(f"Firebase signUp failed: {r}")
    return {"Authorization": f"Bearer {r['idToken']}"}


def _img(fmt="JPEG", color=(200, 30, 30)):
    b = io.BytesIO()
    Image.new("RGB", (64, 48), color).save(b, fmt)
    return b.getvalue()


@pytest.fixture(scope="module")
def h():
    return _signup("a")


@pytest.fixture(scope="module")
def h2():
    return _signup("b")


@pytest.fixture(scope="module")
def client_id(h):
    c = requests.post(f"{API}/clients", headers=h, json={"date": "2027-03-11", "name": "TEST_Foto", "pending": True}, timeout=30)
    assert c.status_code == 200, c.text
    cid = c.json()["id"]
    yield cid
    requests.delete(f"{API}/clients/{cid}", headers=h, timeout=30)


@pytest.fixture(scope="module")
def uploaded(h, client_id):
    jpg = _img("JPEG")
    png = _img("PNG", (10, 200, 10))
    r1 = requests.post(f"{API}/clients/{client_id}/photos", headers=h, files={"file": ("a.jpg", jpg, "image/jpeg")}, timeout=120)
    assert r1.status_code == 200, r1.text
    time.sleep(0.05)
    r2 = requests.post(f"{API}/clients/{client_id}/photos", headers=h, files={"file": ("b.png", png, "image/png")}, timeout=120)
    assert r2.status_code == 200, r2.text
    return {"p1": r1.json(), "p2": r2.json(), "jpg": jpg, "png": png}


class TestUpload:
    def test_upload_response(self, uploaded, client_id):
        p1 = uploaded["p1"]
        assert set(p1.keys()) == {"id", "client_id", "content_type", "size", "created_at"}
        assert p1["client_id"] == client_id
        assert p1["content_type"] == "image/jpeg"
        assert p1["size"] == len(uploaded["jpg"])
        assert uploaded["p2"]["content_type"] == "image/png"

    def test_list_in_order(self, h, client_id, uploaded):
        r = requests.get(f"{API}/clients/{client_id}/photos", headers=h, timeout=30)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert ids == [uploaded["p1"]["id"], uploaded["p2"]["id"]]

    def test_file_bytes(self, h, uploaded):
        r = requests.get(f"{API}/photos/{uploaded['p1']['id']}/file", headers=h, timeout=60)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/jpeg")
        assert r.content == uploaded["jpg"]
        r2 = requests.get(f"{API}/photos/{uploaded['p2']['id']}/file", headers=h, timeout=60)
        assert r2.headers["content-type"].startswith("image/png")
        assert r2.content == uploaded["png"]

    def test_reject_bad_type(self, h, client_id):
        r = requests.post(f"{API}/clients/{client_id}/photos", headers=h, files={"file": ("x.txt", b"hello", "text/plain")}, timeout=30)
        assert r.status_code == 400
        r = requests.post(f"{API}/clients/{client_id}/photos", headers=h, files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")}, timeout=30)
        assert r.status_code == 400

    def test_reject_empty(self, h, client_id):
        r = requests.post(f"{API}/clients/{client_id}/photos", headers=h, files={"file": ("e.jpg", b"", "image/jpeg")}, timeout=30)
        assert r.status_code in (400, 422)

    def test_reject_too_large(self, h, client_id):
        big = b"\xff\xd8" + b"0" * (12 * 1024 * 1024 + 10)
        r = requests.post(f"{API}/clients/{client_id}/photos", headers=h, files={"file": ("big.jpg", big, "image/jpeg")}, timeout=120)
        assert r.status_code in (400, 413)

    def test_missing_file_field(self, h, client_id):
        r = requests.post(f"{API}/clients/{client_id}/photos", headers=h, files={"other": ("a.jpg", b"x", "image/jpeg")}, timeout=30)
        assert r.status_code == 422


class TestAuthAndIsolation:
    def test_unauth(self, client_id, uploaded):
        assert requests.get(f"{API}/clients/{client_id}/photos", timeout=30).status_code in (401, 403)
        assert requests.get(f"{API}/photos/{uploaded['p1']['id']}/file", timeout=30).status_code in (401, 403)
        assert requests.delete(f"{API}/photos/{uploaded['p1']['id']}", timeout=30).status_code in (401, 403)
        assert requests.post(f"{API}/clients/{client_id}/photos", files={"file": ("a.jpg", b"x", "image/jpeg")}, timeout=30).status_code in (401, 403)

    def test_other_user(self, h2, client_id, uploaded):
        r = requests.get(f"{API}/clients/{client_id}/photos", headers=h2, timeout=30)
        assert r.status_code == 200 and r.json() == []
        assert requests.get(f"{API}/photos/{uploaded['p1']['id']}/file", headers=h2, timeout=30).status_code == 404
        assert requests.delete(f"{API}/photos/{uploaded['p1']['id']}", headers=h2, timeout=30).status_code == 404


class TestDelete:
    def test_soft_delete(self, h, client_id, uploaded):
        pid = uploaded["p1"]["id"]
        r = requests.delete(f"{API}/photos/{pid}", headers=h, timeout=30)
        assert r.status_code == 200 and r.json() == {"ok": True}
        assert requests.get(f"{API}/photos/{pid}/file", headers=h, timeout=30).status_code == 404
        ids = [p["id"] for p in requests.get(f"{API}/clients/{client_id}/photos", headers=h, timeout=30).json()]
        assert pid not in ids and uploaded["p2"]["id"] in ids
        assert requests.delete(f"{API}/photos/{pid}", headers=h, timeout=30).status_code == 404

    def test_delete_nonexistent(self, h):
        assert requests.delete(f"{API}/photos/{uuid.uuid4()}", headers=h, timeout=30).status_code == 404


class TestDraftFlow:
    def test_photo_before_client_then_create_with_same_id(self, h):
        draft = str(uuid.uuid4())
        r = requests.post(f"{API}/clients/{draft}/photos", headers=h, files={"file": ("a.jpg", _img(), "image/jpeg")}, timeout=120)
        assert r.status_code == 200
        c = requests.post(f"{API}/clients", headers=h, json={"id": draft, "date": "2027-03-12", "name": "TEST_Draft", "pending": True}, timeout=30)
        assert c.status_code == 200 and c.json()["id"] == draft
        lst = requests.get(f"{API}/clients/{draft}/photos", headers=h, timeout=30).json()
        assert [p["id"] for p in lst] == [r.json()["id"]]
        requests.delete(f"{API}/clients/{draft}", headers=h, timeout=30)
