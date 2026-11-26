# Iter44 UI: nuovo layout (barra in basso 4 aree + "+", AreaTabs, pannelli Ufficio/Nuovo, logo piccolo, sidebar desktop), regressioni
import asyncio, time, uuid
from datetime import date, timedelta
import requests
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/")
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
EXE = "/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell"
EMAIL = f"testuser+iter44{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
PWD = "TestPassword123!"
R = {"pass": [], "fail": []}
SHOT = "/app/test_reports/screenshots"


def ok(name, cond, extra=""):
    (R["pass"] if cond else R["fail"]).append(f"{name} {extra}")
    print(("PASS " if cond else "FAIL ") + name, str(extra)[:300], flush=True)


async def main():
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}", json={"email": EMAIL, "password": PWD, "returnSecureToken": True}).json()
    token = r["idToken"]
    h = {"Authorization": "Bearer " + token}
    today = date.today()
    created = {"clients": [], "contratti": [], "quotes": [], "rilievi": [], "documenti": []}
    c1 = requests.post(f"{URL}/api/clients", headers=h, json={"date": today.isoformat(), "name": "TEST_Bianchi", "address": "Via Test 1", "status": "preventivo"}).json()
    created["clients"].append(c1["id"])
    c2 = requests.post(f"{URL}/api/clients", headers=h, json={"date": (today + timedelta(days=2)).isoformat(), "name": "TEST_Verdi", "address": "Via Test 2"}).json()
    created["clients"].append(c2["id"])
    start = date(today.year - (1 if today.month <= 6 else 0), (today.month - 6 - 1) % 12 + 1, min(today.day, 28))
    ct = requests.post(f"{URL}/api/contratti", headers=h, json={"cliente": "TEST_Contratto", "data_inizio": start.isoformat(), "frequenza_mesi": 6, "durata_mesi": 24}).json()
    created["contratti"].append(ct["id"])
    scad = requests.get(f"{URL}/api/contratti/in-scadenza", headers=h).json()
    counts = {k: len(requests.get(f"{URL}/api/clients/{k}", headers=h).json()) for k in ["pending", "awaiting", "to-quote", "to-invoice", "unpaid"]}
    print("counts", counts, "scadenza", len(scad), flush=True)
    sel = lambda t: f'[data-testid="{t}"]'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        try:
            await page.goto(URL + "/login")
            await page.wait_for_selector(sel("login-email-input"), timeout=15000)
            await page.fill(sel("login-email-input"), EMAIL)
            await page.fill(sel("login-password-input"), PWD)
            await page.click(sel("login-submit-button"))
            await page.wait_for_selector(sel("mobile-bottom-nav"), timeout=20000)
            await page.goto(URL + "/")
            await page.wait_for_selector(sel("mobile-bottom-nav"), timeout=15000)
            await page.wait_for_timeout(2500)
            ok("/ redirects to /prossimi-lavori", page.url.rstrip("/").endswith("/prossimi-lavori"), page.url)
            for t in ["bar-agenda", "bar-lavori", "mobile-new-button", "bar-soldi", "bar-ufficio"]:
                ok(f"bottom nav has {t}", await page.locator(sel(t)).count() == 1)
            order = await page.evaluate("""() => [...document.querySelector('[data-testid=mobile-bottom-nav]').querySelectorAll('[data-testid]')].map(e=>e.dataset.testid).filter(t=>t.startsWith('bar-')&&!t.endsWith('badge')||t==='mobile-new-button')""")
            ok("bottom nav order", order == ["bar-agenda", "bar-lavori", "mobile-new-button", "bar-soldi", "bar-ufficio"], order)
            lb = await page.locator(sel("mobile-logo")).bounding_box()
            ok("mobile-logo ~28px tall", lb and 24 <= lb["height"] <= 32, lb)
            ok("banner contratti on /prossimi-lavori", await page.locator(sel("contratti-scadenza-banner")).is_visible(), await page.locator(sel("contratti-scadenza-banner")).text_content() if await page.locator(sel("contratti-scadenza-banner")).count() else "")
            ok("area-tabs-lavori visible", await page.locator(sel("area-tabs-lavori")).is_visible())
            cls = await page.get_attribute(sel("bar-lavori"), "class")
            ok("bar-lavori active on /prossimi-lavori", "4A5D23" in cls, cls)
            # badges in tabs
            for tid, k in [("tab-nav-prossimi", "pending"), ("tab-nav-da-preventivare", "to-quote")]:
                txt = (await page.locator(sel(tid)).inner_text()).strip()
                ok(f"{tid} badge shows {counts[k]}", (str(counts[k]) in txt) if counts[k] else True, txt)
            if counts["pending"]:
                ok("bar-lavori-badge", await page.locator(sel("bar-lavori-badge")).count() == 1)
            if scad:
                ok("bar-ufficio-badge (contratti)", await page.locator(sel("bar-ufficio-badge")).count() == 1)
            await page.screenshot(path=f"{SHOT}/iter44_mobile_prossimi.jpg", quality=40, full_page=False)
            # overflow
            ow = await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            ok("no horizontal overflow /prossimi-lavori", ow <= 0, ow)
            # tabs navigation
            for tid, path in [("tab-nav-in-attesa", "/in-attesa"), ("tab-nav-da-preventivare", "/da-preventivare"), ("tab-nav-da-fatturare", "/da-fatturare"), ("tab-nav-prossimi", "/prossimi-lavori")]:
                await page.click(sel(tid))
                await page.wait_for_timeout(1200)
                ok(f"{tid} -> {path}", page.url.endswith(path), page.url)
                if path == "/in-attesa":
                    ok("bar-lavori active on /in-attesa", "4A5D23" in (await page.get_attribute(sel("bar-lavori"), "class")))
                    ok("tab-nav-in-attesa active", "0047ab" in (await page.get_attribute(sel(tid), "class")))
                ow = await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
                ok(f"no overflow {path}", ow <= 0, ow)
            # bar navigation
            await page.click(sel("bar-soldi")); await page.wait_for_timeout(1500)
            ok("bar-soldi -> /incassi", page.url.endswith("/incassi"), page.url)
            ok("area-tabs-soldi visible", await page.locator(sel("area-tabs-soldi")).is_visible())
            await page.click(sel("tab-nav-margine")); await page.wait_for_timeout(1500)
            ok("tab margine -> /margine", page.url.endswith("/margine"))
            ok("bar-soldi active on /margine", "4A5D23" in (await page.get_attribute(sel("bar-soldi"), "class")))
            ok("bar-lavori inactive on /margine", "4A5D23" not in (await page.get_attribute(sel("bar-lavori"), "class")))
            for tid, path in [("tab-nav-spese", "/spese"), ("tab-nav-fornitori", "/fornitori")]:
                await page.click(sel(tid)); await page.wait_for_timeout(1200)
                ok(f"{tid} -> {path}", page.url.endswith(path), page.url)
                ow = await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
                ok(f"no overflow {path}", ow <= 0, ow)
            await page.click(sel("bar-agenda")); await page.wait_for_timeout(1500)
            ok("bar-agenda -> /agenda", page.url.endswith("/agenda"), page.url)
            ok("bar-agenda active", "4A5D23" in (await page.get_attribute(sel("bar-agenda"), "class")))
            ow = await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            ok("no overflow /agenda", ow <= 0, ow)
            # ufficio sheet
            ufficio = [("menu-nav-clienti", "/clienti"), ("menu-nav-rilievi", "/rilievi"), ("menu-nav-documenti", "/documenti"), ("menu-nav-contratti", "/contratti"), ("menu-nav-magazzino", "/magazzino"), ("menu-nav-ore-lavoro", "/ore-lavoro"), ("menu-nav-profilo", "/profilo")]
            for i, (tid, path) in enumerate(ufficio):
                await page.click(sel("bar-ufficio")); await page.wait_for_timeout(400)
                ok(f"ufficio-sheet open ({tid})", await page.locator(sel("ufficio-sheet")).is_visible())
                if i == 0:
                    await page.screenshot(path=f"{SHOT}/iter44_ufficio_sheet.jpg", quality=40, full_page=False)
                    if scad:
                        ok("menu-nav-contratti-badge", await page.locator(sel("menu-nav-contratti-badge")).count() == 1)
                await page.click(sel(tid)); await page.wait_for_timeout(1500)
                ok(f"{tid} -> {path}", page.url.endswith(path), page.url)
                ok(f"sheet closed after {tid}", await page.locator(sel("ufficio-sheet")).count() == 0)
                ok(f"bar-ufficio active on {path}", "4A5D23" in (await page.get_attribute(sel("bar-ufficio"), "class")))
                ow = await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
                ok(f"no overflow {path}", ow <= 0, ow)
            ok("area-tabs-ufficio on /profilo", await page.locator(sel("area-tabs-ufficio")).count() == 1)
            # close sheet via X and overlay
            await page.click(sel("bar-ufficio")); await page.wait_for_timeout(300)
            await page.click(sel("ufficio-sheet-close")); await page.wait_for_timeout(300)
            ok("ufficio-sheet closes with X", await page.locator(sel("ufficio-sheet")).count() == 0)
            # new sheet
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(400)
            ok("new-sheet open", await page.locator(sel("new-sheet")).is_visible())
            for t in ["new-lavoro", "new-preventivo", "new-rilievo", "new-pratica", "new-contratto"]:
                ok(f"new-sheet has {t}", await page.locator(sel(t)).count() == 1)
            await page.screenshot(path=f"{SHOT}/iter44_new_sheet.jpg", quality=40, full_page=False)
            await page.click(sel("new-sheet-close")); await page.wait_for_timeout(300)
            ok("new-sheet closes", await page.locator(sel("new-sheet")).count() == 0)
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(300)
            await page.mouse.click(195, 100); await page.wait_for_timeout(300)
            ok("new-sheet closes on overlay click", await page.locator(sel("new-sheet")).count() == 0)
            # new lavoro
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(300)
            await page.click(sel("new-lavoro")); await page.wait_for_timeout(2000)
            ok("new-lavoro -> /prossimi-lavori", page.url.endswith("/prossimi-lavori"), page.url)
            ok("client-form-dialog open", await page.locator(sel("client-form-dialog")).is_visible())
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            # new-lavoro from same page again
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(300)
            await page.click(sel("new-lavoro")); await page.wait_for_timeout(1500)
            ok("new-lavoro reopens dialog when already on /prossimi-lavori", await page.locator(sel("client-form-dialog")).is_visible())
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            await page.reload(); await page.wait_for_timeout(2500)
            ok("reload /prossimi-lavori does not reopen dialog", await page.locator(sel("client-form-dialog")).count() == 0)
            # new rilievo
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(300)
            await page.click(sel("new-rilievo")); await page.wait_for_timeout(2500)
            ok("new-rilievo -> /rilievi", page.url.endswith("/rilievi"), page.url)
            ok("rilievo-dialog open", await page.locator(sel("rilievo-dialog")).is_visible())
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(300)
            await page.click(sel("new-rilievo")); await page.wait_for_timeout(1500)
            ok("new-rilievo reopens on /rilievi", await page.locator(sel("rilievo-dialog")).is_visible())
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            # new pratica
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(300)
            await page.click(sel("new-pratica")); await page.wait_for_timeout(2500)
            ok("new-pratica -> /documenti", "/documenti" in page.url, page.url)
            ok("pratica-dialog open", await page.locator(sel("pratica-dialog")).is_visible())
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            ok("query ?nuova cleared", "nuova" not in page.url, page.url)
            # new contratto
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(300)
            await page.click(sel("new-contratto")); await page.wait_for_timeout(2500)
            ok("new-contratto -> /contratti", page.url.endswith("/contratti"), page.url)
            ok("contratto-dialog open", await page.locator(sel("contratto-dialog")).is_visible())
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            ok("contratti list shows TEST_Contratto", await page.get_by_text("TEST_Contratto").count() >= 1)
            # new preventivo
            await page.click(sel("mobile-new-button")); await page.wait_for_timeout(300)
            await page.click(sel("new-preventivo")); await page.wait_for_timeout(3500)
            ok("new-preventivo -> /preventivi/:id", "/preventivi/" in page.url, page.url)
            if "/preventivi/" in page.url:
                created["quotes"].append(page.url.rstrip("/").split("/")[-1])
                ok("bar-lavori active on /preventivi/:id", "4A5D23" in (await page.get_attribute(sel("bar-lavori"), "class")))
            ow = await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            ok("no overflow quote editor", ow <= 0, ow)
            # bottom nav doesn't cover content: check last element reachable (padding)
            # Desktop
            await page.set_viewport_size({"width": 1400, "height": 900})
            await page.goto(URL + "/prossimi-lavori"); await page.wait_for_timeout(3000)
            ok("desktop bottom nav hidden", not await page.locator(sel("mobile-bottom-nav")).is_visible())
            ok("desktop mobile-logo hidden", not await page.locator(sel("mobile-logo")).is_visible())
            lb = await page.locator(sel("app-logo")).bounding_box()
            ok("app-logo ~36px", lb and 32 <= lb["height"] <= 40, lb)
            for t in ["nav-agenda", "nav-prossimi", "nav-in-attesa", "nav-da-preventivare", "nav-da-fatturare", "nav-incassi", "nav-margine", "nav-spese", "nav-fornitori", "nav-clienti", "nav-rilievi", "nav-documenti", "nav-contratti", "nav-magazzino", "nav-ore-lavoro", "nav-profilo"]:
                ok(f"sidebar {t}", await page.locator(sel(t)).is_visible())
            aside = await page.locator("aside").inner_text()
            ok("sidebar group labels", all(g.upper() in aside.upper() for g in ["Lavori", "Soldi", "Ufficio"]), aside[:200])
            if counts["pending"]:
                ok("sidebar nav-prossimi-badge", await page.locator(sel("nav-prossimi-badge")).count() == 1)
            if scad:
                ok("sidebar nav-contratti-badge", await page.locator(sel("nav-contratti-badge")).count() == 1)
            await page.screenshot(path=f"{SHOT}/iter44_desktop.jpg", quality=40, full_page=False)
            await page.click(sel("nav-margine")); await page.wait_for_timeout(1500)
            ok("sidebar nav-margine navigates", page.url.endswith("/margine"))
            await page.click(sel("side-new-button")); await page.wait_for_timeout(400)
            ok("desktop new-sheet opens", await page.locator(sel("new-sheet")).is_visible())
            await page.screenshot(path=f"{SHOT}/iter44_desktop_new.jpg", quality=40, full_page=False)
            await page.click(sel("new-contratto")); await page.wait_for_timeout(2500)
            ok("desktop new-contratto opens dialog", page.url.endswith("/contratti") and await page.locator(sel("contratto-dialog")).is_visible())
            await page.keyboard.press("Escape")
            ok("no page errors", not errs, errs[:3])
        except Exception as e:
            ok("script exception", False, repr(e))
            await page.screenshot(path=f"{SHOT}/iter44_error.jpg", quality=40, full_page=False)
        finally:
            await b.close()
    # cleanup
    for q in created["quotes"]:
        requests.delete(f"{URL}/api/quotes/{q}", headers=h)
    for c in created["contratti"]:
        requests.delete(f"{URL}/api/contratti/{c}", headers=h)
    for c in created["clients"]:
        requests.delete(f"{URL}/api/clients/{c}", headers=h)
    left_q = requests.get(f"{URL}/api/quotes", headers=h).json()
    print("leftover quotes", len(left_q) if isinstance(left_q, list) else left_q)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": token})
    print(f"\nPASSED {len(R['pass'])} FAILED {len(R['fail'])}")
    for f in R["fail"]:
        print("  FAIL:", f)


asyncio.run(main())
