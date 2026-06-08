"""Iteration 12 backend tests.

Coverage focused on the latest changes:
  - Awaiting clients endpoints (GET /clients/awaiting, GET /clients/pending exclusion)
  - Reorder endpoints (PUT /clients/{awaiting,pending}/reorder => sort_order updates)
  - execute_pending_client clears awaiting_materials
  - Client CRUD accepts awaiting_materials + sort_order
  - Summary /summary?month=YYYY-MM exposes IVA split + margine fields
  - /payments/by-method returns imponibile/iva/margin/materials_share with consistent totals
  - DELETE /clients/{cid}/payments/{pid} removes single payment from array
  - Auth gates: 401/403 without token (HTTPBearer => 403)
  - IVA scorporo with multiple scenarios
  - Materials pro-rata distribution across multiple payments
  - Route ordering: /clients/awaiting NOT captured by /clients/{client_id}
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://questa-demo.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"
FIREBASE_API_KEY = os.environ.get(
    "REACT_APP_FIREBASE_API_KEY", "AIzaSyA76r_z4Fy5VybzG8cjJIgVhVx7tKhxnpM"
)
SIGNUP_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
SIGNIN_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
PASSWORD = "TestPassword123!"

# Use a UNIQUE month for these tests so we don't collide with other data already in DB.
TEST_MONTH = "2027-03"


def _firebase_signup(email: str) -> str:
    r = requests.post(
        SIGNUP_URL,
        json={"email": email, "password": PASSWORD, "returnSecureToken": True},
        timeout=20,
    )
    if r.status_code != 200:
        msg = r.json().get("error", {}).get("message", "")
        if "EMAIL_EXISTS" in msg:
            r2 = requests.post(
                SIGNIN_URL,
                json={"email": email, "password": PASSWORD, "returnSecureToken": True},
                timeout=20,
            )
            assert r2.status_code == 200, r2.text
            return r2.json()["idToken"]
        raise AssertionError(f"signUp failed: {r.status_code} {r.text}")
    return r.json()["idToken"]


@pytest.fixture(scope="module")
def token():
    email = f"testuser+iter12{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
    return _firebase_signup(email)


@pytest.fixture
def s(token):
    sess = requests.Session()
    sess.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return sess


def _create_client(s, **overrides):
    payload = {
        "date": f"{TEST_MONTH}-15",
        "name": "TEST_" + uuid.uuid4().hex[:8],
        "amount": 1000.0,
        "status": "preventivo",
    }
    payload.update(overrides)
    r = s.post(f"{API}/clients", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(autouse=True)
def _cleanup(s, request):
    yield
    # Best-effort cleanup of TEST_ clients for this user
    try:
        for path in ("/clients?month=2027-03", "/clients/pending", "/clients/awaiting"):
            r = s.get(f"{API}{path}")
            if r.status_code == 200:
                for c in r.json():
                    if (c.get("name") or "").startswith("TEST_"):
                        s.delete(f"{API}/clients/{c['id']}")
    except Exception:
        pass


# ---------- Auth gates ----------

class TestAuthGates:
    def test_no_token_protected_endpoints_return_401_or_403(self):
        endpoints = [
            ("GET", "/clients/awaiting"),
            ("GET", "/clients/pending"),
            ("PUT", "/clients/awaiting/reorder"),
            ("PUT", "/clients/pending/reorder"),
            ("GET", f"/summary?month={TEST_MONTH}"),
            ("GET", f"/payments/by-method?month={TEST_MONTH}&method=contanti"),
        ]
        for method, path in endpoints:
            r = requests.request(method, f"{API}{path}", json={"ids": []})
            # HTTPBearer(auto_error=True) returns 403; raw 401 also acceptable
            assert r.status_code in (401, 403), f"{method} {path} -> {r.status_code}"


# ---------- Awaiting / Pending endpoints ----------

class TestAwaitingPendingEndpoints:
    def test_awaiting_only_returns_pending_and_awaiting(self, s):
        c_await = _create_client(s, pending=True, awaiting_materials=True)
        c_pending_only = _create_client(s, pending=True, awaiting_materials=False)
        c_agenda = _create_client(s, pending=False)

        # /clients/awaiting -> only c_await
        r = s.get(f"{API}/clients/awaiting")
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert c_await["id"] in ids
        assert c_pending_only["id"] not in ids
        assert c_agenda["id"] not in ids
        for c in r.json():
            assert c["pending"] is True
            assert c["awaiting_materials"] is True

    def test_pending_excludes_awaiting(self, s):
        c_await = _create_client(s, pending=True, awaiting_materials=True)
        c_pending_only = _create_client(s, pending=True, awaiting_materials=False)

        r = s.get(f"{API}/clients/pending")
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert c_pending_only["id"] in ids
        assert c_await["id"] not in ids
        for c in r.json():
            assert c["pending"] is True
            assert not c.get("awaiting_materials", False)


# ---------- Reorder ----------

class TestReorder:
    def test_reorder_awaiting_updates_sort_order(self, s):
        a = _create_client(s, pending=True, awaiting_materials=True)
        b = _create_client(s, pending=True, awaiting_materials=True)
        c = _create_client(s, pending=True, awaiting_materials=True)

        new_order = [c["id"], a["id"], b["id"]]
        r = s.put(f"{API}/clients/awaiting/reorder", json={"ids": new_order})
        assert r.status_code == 200, r.text
        assert r.json()["count"] == 3

        # Verify persistence + ordering returned
        r2 = s.get(f"{API}/clients/awaiting")
        assert r2.status_code == 200
        returned_order = [c["id"] for c in r2.json() if c["id"] in new_order]
        assert returned_order == new_order

        # Verify each sort_order index
        idx_by_id = {c["id"]: c.get("sort_order") for c in r2.json()}
        assert idx_by_id[c["id"]] == 0
        assert idx_by_id[a["id"]] == 1
        assert idx_by_id[b["id"]] == 2

    def test_reorder_pending_updates_sort_order(self, s):
        a = _create_client(s, pending=True, awaiting_materials=False)
        b = _create_client(s, pending=True, awaiting_materials=False)
        new_order = [b["id"], a["id"]]
        r = s.put(f"{API}/clients/pending/reorder", json={"ids": new_order})
        assert r.status_code == 200
        assert r.json()["count"] == 2

        r2 = s.get(f"{API}/clients/pending")
        returned_order = [c["id"] for c in r2.json() if c["id"] in new_order]
        assert returned_order == new_order


# ---------- Execute pending ----------

class TestExecutePending:
    def test_execute_clears_awaiting_and_moves_to_agenda(self, s):
        c = _create_client(s, pending=True, awaiting_materials=True)
        target = f"{TEST_MONTH}-20"
        r = s.post(f"{API}/clients/{c['id']}/execute?date={target}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["pending"] is False
        assert body["awaiting_materials"] is False
        assert body["date"] == target

        # No longer in /clients/awaiting nor /clients/pending
        r_aw = s.get(f"{API}/clients/awaiting")
        r_pe = s.get(f"{API}/clients/pending")
        ids_aw = [x["id"] for x in r_aw.json()]
        ids_pe = [x["id"] for x in r_pe.json()]
        assert c["id"] not in ids_aw
        assert c["id"] not in ids_pe

        # Appears in agenda
        r_ag = s.get(f"{API}/clients?date={target}")
        assert any(x["id"] == c["id"] for x in r_ag.json())


# ---------- Client accepts new fields ----------

class TestClientFields:
    def test_create_accepts_awaiting_materials_and_sort_order(self, s):
        c = _create_client(s, pending=True, awaiting_materials=True, sort_order=42)
        assert c["awaiting_materials"] is True
        assert c["sort_order"] == 42

    def test_update_persists_awaiting_materials(self, s):
        c = _create_client(s, pending=True, awaiting_materials=False)
        payload = {**c, "awaiting_materials": True}
        # strip server-only fields
        payload.pop("user_id", None)
        payload.pop("created_at", None)
        r = s.put(f"{API}/clients/{c['id']}", json=payload)
        assert r.status_code == 200
        assert r.json()["awaiting_materials"] is True


# ---------- Route ordering ----------

class TestRouteOrdering:
    def test_clients_awaiting_not_captured_by_dynamic_route(self, s):
        # If /clients/{client_id} caught /clients/awaiting we'd get 404 or weird body
        r = s.get(f"{API}/clients/awaiting")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_clients_pending_not_captured_by_dynamic_route(self, s):
        r = s.get(f"{API}/clients/pending")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- IVA scorporo ----------

class TestIVASplit:
    """Verify imponibile = amount / (1 + (vat - withholding)/100) in /summary."""

    def _summary(self, s, month=TEST_MONTH):
        r = s.get(f"{API}/summary?month={month}")
        assert r.status_code == 200, r.text
        return r.json()

    def test_summary_exposes_new_fields(self, s):
        # Clean month -> create one client paid via contanti
        _create_client(
            s,
            date=f"{TEST_MONTH}-10",
            amount=1000,
            vat_rate=22,
            status="lavoro_eseguito",
            payments=[{"id": str(uuid.uuid4()), "type": "saldo", "amount": 1220, "method": "contanti"}],
        )
        body = self._summary(s)
        for k in (
            "total_imponibile", "total_iva", "total_ritenuta",
            "incassi_net_by_method", "incassi_iva_by_method", "incassi_margine_by_method",
        ):
            assert k in body, f"missing {k}"

    def test_forfettario_no_vat_no_withholding(self, s):
        amount = 500.0
        _create_client(
            s,
            date=f"{TEST_MONTH}-11",
            amount=amount,
            vat_rate=None,
            withholding_rate=None,
            status="lavoro_eseguito",
            payments=[{"id": str(uuid.uuid4()), "type": "saldo", "amount": amount, "method": "pos"}],
        )
        body = self._summary(s)
        # In forfettario: imponibile == amount, iva == 0
        # We only check ranges since other tests may add data — use isolated month for reliability
        assert body["incassi_net_by_method"]["pos"] >= amount - 0.5
        assert body["incassi_iva_by_method"]["pos"] < 0.5

    def test_iva22_no_withholding(self, s):
        # paid 1220 with 22% VAT -> imponibile 1000, iva 220
        _create_client(
            s,
            date=f"{TEST_MONTH}-12",
            amount=1000,
            vat_rate=22,
            status="lavoro_eseguito",
            payments=[{"id": str(uuid.uuid4()), "type": "saldo", "amount": 1220, "method": "bonifico"}],
        )
        body = self._summary(s)
        # check ratio for this isolated month if we only added this one
        # We can't rely on month isolation due to other tests in same module. Verify proportionality:
        net = body["incassi_net_by_method"]["bonifico"]
        iva = body["incassi_iva_by_method"]["bonifico"]
        if net > 0:
            ratio = iva / net
            # ratio should be ~0.22 (might mix with iva10 from another test -> tolerate)
            assert 0.05 < ratio < 0.30, f"iva/imp ratio off: {ratio}"

    def test_iva22_with_withholding20(self, s):
        # vat=22, wh=20 -> divisor = 1 + (22-20)/100 = 1.02
        # If amount=1020 -> imponibile=1000, iva=220, ritenuta=200
        _create_client(
            s,
            date=f"{TEST_MONTH}-13",
            amount=1000,
            vat_rate=22,
            withholding_rate=20,
            status="lavoro_eseguito",
            payments=[{"id": str(uuid.uuid4()), "type": "saldo", "amount": 1020, "method": "contanti"}],
        )
        body = self._summary(s)
        # total_ritenuta should now be > 0
        assert body["total_ritenuta"] > 100  # at least the 200 we just added (minus rounding)

    def test_summary_balance_uses_imponibile_not_gross(self, s):
        # Create isolated client with vat 22, fully paid gross
        # Balance contribution = imponibile - spese - acconti - materiali (= ~1000, not 1220)
        body_before = self._summary(s)
        balance_before = body_before["balance"]
        imp_before = body_before["total_imponibile"]
        _create_client(
            s,
            date=f"{TEST_MONTH}-14",
            amount=1000,
            vat_rate=22,
            status="lavoro_eseguito",
            payments=[{"id": str(uuid.uuid4()), "type": "saldo", "amount": 1220, "method": "pos"}],
        )
        body_after = self._summary(s)
        delta_balance = body_after["balance"] - balance_before
        delta_imp = body_after["total_imponibile"] - imp_before
        # balance increment ~= imponibile increment (~1000), NOT gross (1220)
        assert abs(delta_imp - 1000) < 1.0, f"imp delta {delta_imp}"
        assert abs(delta_balance - 1000) < 1.0, f"balance delta {delta_balance} (should ~1000 not 1220)"


# ---------- Payments by method ----------

class TestPaymentsByMethod:
    def test_payments_by_method_exposes_breakdown(self, s):
        c = _create_client(
            s,
            date=f"{TEST_MONTH}-05",
            amount=1000,
            vat_rate=22,
            status="lavoro_eseguito",
            payments=[
                {"id": str(uuid.uuid4()), "type": "saldo", "amount": 610, "method": "contanti"},
                {"id": str(uuid.uuid4()), "type": "acconto", "amount": 610, "method": "contanti"},
            ],
            materials=[{"id": str(uuid.uuid4()), "description": "mat", "amount": 100}],
        )
        r = s.get(f"{API}/payments/by-method?month={TEST_MONTH}&method=contanti")
        assert r.status_code == 200, r.text
        body = r.json()
        # check our payments present
        our_items = [it for it in body["items"] if it["client_id"] == c["id"]]
        assert len(our_items) == 2
        for it in our_items:
            assert "imponibile" in it and "iva" in it and "margin" in it and "materials_share" in it
            assert it["imponibile"] > 0
            assert it["iva"] > 0
            assert it["materials_share"] >= 0

        # Each payment 610 gross, 22% vat => imponibile ~500, iva ~110, mat share 50 each, margin ~450
        for it in our_items:
            assert abs(it["imponibile"] - 500) < 1.0
            assert abs(it["iva"] - 110) < 1.0
            assert abs(it["materials_share"] - 50) < 1.0
            assert abs(it["margin"] - 450) < 1.0

        # Totals coherent (with tolerance) across full response
        assert abs(body["total_imponibile"] + body["total_iva"] - body["total_gross"]) < 1.0

    def test_payments_by_method_invalid_method_400(self, s):
        r = s.get(f"{API}/payments/by-method?month={TEST_MONTH}&method=carta")
        assert r.status_code == 400


# ---------- Materials pro-rata distribution ----------

class TestMaterialsProRata:
    def test_materials_distributed_pro_rata_across_payments(self, s):
        # Client with 100 materials, imponibili 300 + 700 (forfettario for easy math)
        c = _create_client(
            s,
            date=f"{TEST_MONTH}-06",
            amount=1000,
            vat_rate=None,
            withholding_rate=None,
            status="lavoro_eseguito",
            payments=[
                {"id": str(uuid.uuid4()), "type": "acconto", "amount": 300, "method": "contanti"},
                {"id": str(uuid.uuid4()), "type": "saldo", "amount": 700, "method": "pos"},
            ],
            materials=[{"id": str(uuid.uuid4()), "description": "m", "amount": 100}],
        )

        # contanti share = 30 €; pos share = 70 €
        r_c = s.get(f"{API}/payments/by-method?month={TEST_MONTH}&method=contanti")
        r_p = s.get(f"{API}/payments/by-method?month={TEST_MONTH}&method=pos")
        item_c = next(it for it in r_c.json()["items"] if it["client_id"] == c["id"])
        item_p = next(it for it in r_p.json()["items"] if it["client_id"] == c["id"])
        assert abs(item_c["materials_share"] - 30) < 0.5, item_c
        assert abs(item_p["materials_share"] - 70) < 0.5, item_p
        # margin = imp - share
        assert abs(item_c["margin"] - 270) < 0.5
        assert abs(item_p["margin"] - 630) < 0.5


# ---------- DELETE single payment ----------

class TestDeleteSinglePayment:
    def test_delete_payment_removes_only_target(self, s):
        p1 = {"id": str(uuid.uuid4()), "type": "acconto", "amount": 100, "method": "contanti"}
        p2 = {"id": str(uuid.uuid4()), "type": "saldo", "amount": 200, "method": "pos"}
        p3 = {"id": str(uuid.uuid4()), "type": "altro", "amount": 50, "method": "bonifico"}
        c = _create_client(s, payments=[p1, p2, p3])

        r = s.delete(f"{API}/clients/{c['id']}/payments/{p2['id']}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["remaining"] == 2

        # GET client and verify remaining payment ids
        r2 = s.get(f"{API}/clients?month={TEST_MONTH}")
        client_back = next(x for x in r2.json() if x["id"] == c["id"])
        ids = [p["id"] for p in client_back["payments"]]
        assert p1["id"] in ids
        assert p3["id"] in ids
        assert p2["id"] not in ids

    def test_delete_payment_not_found(self, s):
        c = _create_client(s)
        r = s.delete(f"{API}/clients/{c['id']}/payments/nonexistent")
        assert r.status_code == 404

    def test_delete_payment_client_not_found(self, s):
        r = s.delete(f"{API}/clients/nonexistent-cid/payments/nonexistent-pid")
        assert r.status_code == 404
