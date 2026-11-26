# Iter45 UI regression: login, route protection, all pages (no errors / overflow 390px), job create + photo upload, quote editor, public impianto
import asyncio, time, uuid
from datetime import date, timedelta
import requests
from pymongo import MongoClient
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
BENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/")
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
mdb = MongoClient(BENV["MONGO_URL"].strip('"'))[BENV["DB_NAME"].strip('"')]
EXE = "/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell"
EMAIL = f"testuser+iter45ui{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
PWD = "TestPassword123!"
SHOT = "/app/test_reports/screenshots"
R = {"pass": 0, "fail": []}
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
ROUTES = ["/agenda", "/prossimi-lavori", "/da-preventivare", "/in-attesa", "/da-fatturare", "/incassi", "/spese", "/riepilogo",
          "/profilo", "/clienti", "/ore-lavoro", "/margine", "/fornitori", "/magazzino", "/rilievi", "/documenti", "/contratti"]
sel = lambda t: f'[data-testid="{t}"]'


def ok(name, cond, extra=""):
    if cond: R["pass"] += 1
    else: R["fail"].append(f"{name} {extra}")
    print(("PASS " if cond else "FAIL ") + name, str(extra)[:300], flush=True)


async def main():
    j = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}", json={"email": EMAIL, "password": PWD, "returnSecureToken": True}).json()
    uid, h = j["localId"], {"Authorization": "Bearer " + j["idToken"]}
    today = date.today()
    c1 = requests.post(f"{URL}/api/clients", headers=h, json={"date": today.isoformat(), "name": "TEST_Rossi Agenda", "address": "Via Test 9", "amount": 500, "vat_rate": 22,
                                                               "status": "lavoro_eseguito", "payments": [{"type": "acconto", "amount": 100, "method": "contanti"}]}).json()
    q = requests.post(f"{URL}/api/quotes", headers=h, json={"clientName": "TEST_QUI", "client_id": c1["id"], "lineItems": [{"description": "Serranda", "amount": 1000, "vatRate": 22}]}).json()
    pr = requests.post(f"{URL}/api/documenti", headers=h, json={"kind": "pratica", "cliente": "TEST_Segreto Cliente", "indirizzo": "Via Privata 7", "data": today.isoformat(), "fields": {"modello": "MOD-X"}}).json()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        page = await ctx.new_page()
        errs, cons, bad = [], [], []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
        page.on("response", lambda r: bad.append(f"{r.status} {r.url}") if "/api/" in r.url and r.status >= 500 else None)
        try:
            # route protection
            await page.goto(URL + "/agenda")
            await page.wait_for_timeout(3000)
            ok("unauth /agenda -> /login", "/login" in page.url, page.url)
            # public impianto, no login
            await page.goto(URL + f"/impianto/{pr['public_token']}")
            await page.wait_for_timeout(3000)
            body = await page.inner_text("body")
            ok("public impianto shows model", "MOD-X" in body, body[:200])
            ok("public impianto hides client data", "Segreto" not in body and "Privata" not in body)
            await page.goto(URL + "/impianto/nonexistenttoken1234567890")
            await page.wait_for_timeout(2500)
            ok("public impianto invalid token no crash", len(errs) == 0, errs[-1:] if errs else "")
            await page.screenshot(path=f"{SHOT}/i45_impianto_bad.jpeg", quality=40)
            # login
            await page.goto(URL + "/login")
            await page.fill(sel("login-email-input"), EMAIL)
            await page.fill(sel("login-password-input"), "wrongpass")
            await page.click(sel("login-submit-button"))
            await page.wait_for_timeout(2500)
            ok("wrong password stays on login", "/login" in page.url)
            await page.fill(sel("login-password-input"), PWD)
            await page.click(sel("login-submit-button"))
            await page.wait_for_selector(sel("mobile-bottom-nav"), timeout=20000)
            await page.goto(URL + "/")
            await page.wait_for_timeout(2500)
            ok("/ -> /prossimi-lavori", page.url.rstrip("/").endswith("/prossimi-lavori"), page.url)
            # all pages at 390
            for r in ROUTES:
                n0 = len(errs)
                await page.goto(URL + r)
                await page.wait_for_timeout(2200)
                sw = await page.evaluate("() => document.documentElement.scrollWidth")
                ok(f"{r} no overflow 390", sw <= 391, sw)
                ok(f"{r} no page error", len(errs) == n0, errs[n0:][:1])
                txt = await page.inner_text("body")
                ok(f"{r} not blank/404", len(txt) > 60 and "non trovata" not in txt.lower(), txt[:80])
            await page.goto(URL + "/agenda")
            await page.wait_for_timeout(2500)
            await page.screenshot(path=f"{SHOT}/i45_agenda_390.jpeg", quality=40)
            ok("agenda shows today's job", "TEST_Rossi Agenda" in await page.inner_text("body"))
            # Create pending job via UI
            await page.goto(URL + "/prossimi-lavori")
            await page.wait_for_selector(sel("add-pending-button"), timeout=10000)
            await page.click(sel("add-pending-button"))
            await page.wait_for_selector(sel("client-form-dialog"), timeout=8000)
            await page.fill(sel("client-name-input"), "TEST_UI Nuovo")
            await page.fill(sel("client-address-input"), "Via UI 1")
            await page.fill(sel("client-amount-input"), "250")
            await page.click(sel("client-save-button"))
            await page.wait_for_timeout(3000)
            pend = requests.get(f"{URL}/api/clients/pending", headers=h).json()
            created = [c for c in pend if c["name"] == "TEST_UI Nuovo"]
            ok("UI create pending job persisted", len(created) == 1, [c["name"] for c in pend])
            if created:
                cid = created[0]["id"]
                ok("pending card visible", await page.locator(sel(f"pending-card-{cid}")).count() == 1)
                await page.locator(sel(f"pending-card-{cid}")).click()
                await page.wait_for_selector(sel("client-form-dialog"), timeout=8000)
                await page.wait_for_timeout(1500)
                ok("photo section in job form", await page.locator(sel("job-photos-section")).count() == 1)
                if await page.locator(sel("job-photos-gallery-input")).count():
                    await page.set_input_files(sel("job-photos-gallery-input"), files=[{"name": "t.png", "mimeType": "image/png", "buffer": PNG}])
                    await page.wait_for_timeout(5000)
                    ph = requests.get(f"{URL}/api/clients/{cid}/photos", headers=h).json()
                    ok("UI photo upload persisted", len(ph) == 1, ph)
                    imgs = await page.locator(f'{sel("job-photos-grid")} img').count()
                    ok("photo thumbnail rendered", imgs >= 1, imgs)
                    if imgs:
                        nat = await page.locator(f'{sel("job-photos-grid")} img').first.evaluate("e => e.naturalWidth")
                        ok("thumbnail actually loaded", nat > 0, nat)
                await page.screenshot(path=f"{SHOT}/i45_job_form.jpeg", quality=40)
                await page.keyboard.press("Escape")
                await page.wait_for_timeout(800)
                # execute today
                if await page.locator(sel(f"execute-today-{cid}")).count():
                    await page.click(sel(f"execute-today-{cid}"))
                    await page.wait_for_timeout(2500)
                    ag = requests.get(f"{URL}/api/clients", headers=h, params={"date": today.isoformat()}).json()
                    ok("execute-today moves job to agenda", any(c["id"] == cid for c in ag), [c["name"] for c in ag])
            # quote editor
            await page.goto(URL + f"/preventivi/{q['id']}")
            await page.wait_for_selector(sel("quote-editor-page"), timeout=10000)
            await page.wait_for_timeout(2000)
            tot = await page.locator(sel("quote-total")).inner_text() if await page.locator(sel("quote-total")).count() else ""
            ok("quote total 1.220", "1.220" in tot, tot)
            sw = await page.evaluate("() => document.documentElement.scrollWidth")
            ok("quote editor no overflow", sw <= 391, sw)
            await page.screenshot(path=f"{SHOT}/i45_quote_editor.jpeg", quality=40)
            await page.goto(URL + "/preventivi/doesnotexist")
            await page.wait_for_timeout(2500)
            ok("missing quote handled", await page.locator(sel("quote-missing")).count() == 1)
            # unknown route
            await page.goto(URL + "/rotta-inesistente")
            await page.wait_for_timeout(2000)
            ok("unknown route handled", len(await page.inner_text("body")) > 20, page.url)
            # desktop pass
            await page.set_viewport_size({"width": 1920, "height": 1080})
            for r in ["/agenda", "/prossimi-lavori", "/incassi", "/margine", "/documenti", "/contratti"]:
                await page.goto(URL + r)
                await page.wait_for_timeout(1800)
                sw = await page.evaluate("() => document.documentElement.scrollWidth")
                ok(f"desktop {r} no overflow", sw <= 1921, sw)
            await page.goto(URL + "/incassi"); await page.wait_for_timeout(2000)
            ok("incassi shows open balance job", "TEST_Rossi Agenda" in await page.inner_text("body"))
            await page.screenshot(path=f"{SHOT}/i45_incassi_desktop.jpeg", quality=40)
        except Exception as e:
            ok("script exception", False, repr(e))
            await page.screenshot(path=f"{SHOT}/i45_err.jpeg", quality=40)
        print("PAGE ERRORS:", errs[:5])
        print("CONSOLE ERRORS:", [c for c in cons][:10])
        print("API 5xx:", bad[:10])
        await b.close()
    for c in ("clients", "quotes", "documenti", "documenti_counters", "employees", "quote_settings", "materials", "time_entries"):
        mdb[c].delete_many({"user_id": uid})
    for ph in mdb.job_photos.find({"user_id": uid}):
        if ph.get("file_id"):
            mdb.photo_files.files.delete_one({"_id": ph["file_id"]}); mdb.photo_files.chunks.delete_many({"files_id": ph["file_id"]})
    mdb.job_photos.delete_many({"user_id": uid})
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": j["idToken"]})
    print(f"TOTAL pass={R['pass']} fail={len(R['fail'])}")
    for f in R["fail"]: print(" -", f)


asyncio.run(main())
