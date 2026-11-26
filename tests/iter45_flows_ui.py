# Iter45 UI part 2: execute-today (confirm), + Nuovo preventivo/lavoro/contratto, magazzino +/-, clienti search, contratti banner, 4xx sources
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
EMAIL = f"testuser+iter45ub{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
PWD = "TestPassword123!"
SHOT = "/app/test_reports/screenshots"
R = {"pass": 0, "fail": []}
sel = lambda t: f'[data-testid="{t}"]'


def ok(name, cond, extra=""):
    if cond: R["pass"] += 1
    else: R["fail"].append(f"{name} {extra}")
    print(("PASS " if cond else "FAIL ") + name, str(extra)[:300], flush=True)


async def main():
    j = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}", json={"email": EMAIL, "password": PWD, "returnSecureToken": True}).json()
    uid, h = j["localId"], {"Authorization": "Bearer " + j["idToken"]}
    today = date.today()
    c = requests.post(f"{URL}/api/clients", headers=h, json={"date": today.isoformat(), "name": "TEST_Exec Uno", "pending": True}).json()
    requests.post(f"{URL}/api/clients", headers=h, json={"date": "2025-05-05", "name": "TEST_Cerca Bianchi", "address": "Via Cercata 3"})
    m = requests.post(f"{URL}/api/materials", headers=h, json={"name": "TEST_Molla", "quantity": 1}).json()
    requests.post(f"{URL}/api/contratti", headers=h, json={"cliente": "TEST_Scade", "data_inizio": (today - timedelta(days=178)).isoformat(), "frequenza_mesi": 6})
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        page = await ctx.new_page()
        errs, bad = [], []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("response", lambda r: bad.append(f"{r.status} {r.request.method} {r.url}") if r.status >= 400 and "identitytoolkit" not in r.url else None)
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        try:
            await page.goto(URL + "/login")
            await page.fill(sel("login-email-input"), EMAIL)
            await page.fill(sel("login-password-input"), PWD)
            await page.click(sel("login-submit-button"))
            await page.wait_for_selector(sel("mobile-bottom-nav"), timeout=20000)
            await page.wait_for_timeout(2500)
            ok("contratti scadenza banner", await page.locator(sel("contratti-scadenza-banner")).count() == 1)
            # execute today
            await page.goto(URL + "/prossimi-lavori")
            await page.wait_for_selector(sel(f"execute-today-{c['id']}"), timeout=10000)
            await page.click(sel(f"execute-today-{c['id']}"))
            await page.wait_for_timeout(3000)
            ag = requests.get(f"{URL}/api/clients", headers=h, params={"date": today.isoformat()}).json()
            ok("execute-today -> agenda", any(x["id"] == c["id"] for x in ag))
            ok("card removed from prossimi", await page.locator(sel(f"pending-card-{c['id']}")).count() == 0)
            # + Nuovo preventivo
            await page.click(sel("mobile-new-button"))
            await page.wait_for_timeout(800)
            ok("new sheet has 5 actions", all([await page.locator(sel(f"new-{k}")).count() == 1 for k in ["lavoro", "preventivo", "rilievo", "pratica", "contratto"]]))
            await page.click(sel("new-preventivo"))
            await page.wait_for_timeout(3500)
            ok("+ preventivo opens editor", "/preventivi/" in page.url, page.url)
            qs = requests.get(f"{URL}/api/quotes", headers=h).json()
            ok("+ preventivo created 1 quote", len(qs) == 1, len(qs))
            if qs:
                ok("first quote number 001", qs[0]["number"] == "001", qs[0]["number"])
            await page.click(sel("quote-add-item")); await page.wait_for_timeout(500)
            items = await page.locator('[data-testid^="quote-item-"]').count()
            ok("add item row", items >= 2, items)
            # + Nuovo lavoro
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(700)
            await page.click(sel("new-lavoro")); await page.wait_for_timeout(2500)
            ok("+ lavoro opens form", await page.locator(sel("client-form-dialog")).count() == 1, page.url)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(600)
            # + Nuovo contratto
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(700)
            await page.click(sel("new-contratto")); await page.wait_for_timeout(2500)
            dlg = await page.locator('[role="dialog"]').count()
            ok("+ contratto opens dialog", dlg >= 1 and "/contratti" in page.url, page.url)
            await page.screenshot(path=f"{SHOT}/i45_new_contratto.jpeg", quality=40)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(600)
            # + Nuova pratica
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(700)
            await page.click(sel("new-pratica")); await page.wait_for_timeout(2500)
            ok("+ pratica opens dialog", await page.locator('[role="dialog"]').count() >= 1, page.url)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(600)
            # magazzino
            await page.goto(URL + "/magazzino")
            await page.wait_for_selector(sel(f"material-increment-{m['id']}"), timeout=10000)
            await page.click(sel(f"material-increment-{m['id']}")); await page.wait_for_timeout(400)
            await page.click(sel(f"material-increment-{m['id']}")); await page.wait_for_timeout(1500)
            q = [x for x in requests.get(f"{URL}/api/materials", headers=h).json() if x["id"] == m["id"]][0]["quantity"]
            ok("magazzino +2 persisted", q == 3, q)
            for _ in range(5):
                if await page.locator(sel(f"material-decrement-{m['id']}")).is_disabled():
                    break
                await page.click(sel(f"material-decrement-{m['id']}")); await page.wait_for_timeout(250)
            await page.wait_for_timeout(1500)
            q = [x for x in requests.get(f"{URL}/api/materials", headers=h).json() if x["id"] == m["id"]][0]["quantity"]
            qt = await page.locator(sel(f"material-qty-{m['id']}")).inner_text()
            ok("magazzino clamp 0 (api & ui)", q == 0 and "0" in qt and "-" not in qt, (q, qt))
            # clienti search
            await page.goto(URL + "/clienti")
            await page.wait_for_timeout(2000)
            await page.fill(sel("clienti-search-input"), "Cercata")
            await page.wait_for_timeout(2000)
            body = await page.inner_text("body")
            ok("clienti search finds by address", "TEST_Cerca Bianchi" in body)
            await page.screenshot(path=f"{SHOT}/i45_clienti.jpeg", quality=40)
            # header search
            if await page.locator(sel("client-search-input")).count():
                await page.fill(sel("client-search-input"), "Bianchi"); await page.wait_for_timeout(2000)
                ok("global client search results", await page.locator(sel("client-search-results")).count() == 1)
        except Exception as e:
            ok("script exception", False, repr(e))
            await page.screenshot(path=f"{SHOT}/i45b_err.jpeg", quality=40)
        print("PAGE ERRORS:", errs[:5])
        print("HTTP >=400:", bad[:15])
        await b.close()
    for col in ("clients", "quotes", "documenti", "documenti_counters", "contratti", "materials", "quote_settings", "rilievi_sezionali", "employees"):
        mdb[col].delete_many({"user_id": uid})
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": j["idToken"]})
    print(f"TOTAL pass={R['pass']} fail={len(R['fail'])}")
    for f in R["fail"]: print(" -", f)


asyncio.run(main())
