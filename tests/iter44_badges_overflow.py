# Iter44 follow-up: badge numerici nelle schede/barra con lavori reali + causa overflow /profilo a 390px
import asyncio, time, uuid
from datetime import date
import requests
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/")
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
EXE = "/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell"
EMAIL = f"testuser+iter44b{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
PWD = "TestPassword123!"


async def main():
    token = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}", json={"email": EMAIL, "password": PWD, "returnSecureToken": True}).json()["idToken"]
    h = {"Authorization": "Bearer " + token}
    d = date.today().isoformat()
    ids = []
    for name, extra in [("TEST_P1", {}), ("TEST_P2", {}), ("TEST_Q", {"to_quote": True}), ("TEST_A", {"awaiting_materials": True})]:
        c = requests.post(f"{URL}/api/clients", headers=h, json={"date": d, "name": name, "address": "Via X", "pending": True, **extra}).json()
        ids.append(c["id"])
        if extra:
            requests.put(f"{URL}/api/clients/{c['id']}", headers=h, json={**c, **extra})
    counts = {k: len(requests.get(f"{URL}/api/clients/{k}", headers=h).json()) for k in ["pending", "awaiting", "to-quote"]}
    print("counts", counts)
    sel = lambda t: f'[data-testid="{t}"]'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        page = await (await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")).new_page()
        try:
            await page.goto(URL + "/login")
            await page.fill(sel("login-email-input"), EMAIL)
            await page.fill(sel("login-password-input"), PWD)
            await page.click(sel("login-submit-button"))
            await page.wait_for_selector(sel("mobile-bottom-nav"), timeout=20000)
            await page.goto(URL + "/prossimi-lavori"); await page.wait_for_timeout(3500)
            for t in ["tab-nav-prossimi", "tab-nav-in-attesa", "tab-nav-da-preventivare"]:
                print(t, repr((await page.locator(sel(t)).inner_text()).strip()))
            print("bar-lavori-badge", await page.locator(sel("bar-lavori-badge")).all_inner_texts())
            chips = await page.evaluate("() => {const r=document.querySelector('[data-testid=area-tabs-lavori]'); return {sw:r.scrollWidth, cw:r.clientWidth, doc: document.documentElement.scrollWidth}}")
            print("chips row", chips)
            await page.screenshot(path="/app/test_reports/screenshots/iter44_badges.jpg", quality=40, full_page=False)
            await page.goto(URL + "/profilo"); await page.wait_for_timeout(3000)
            wide = await page.evaluate("""() => [...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>window.innerWidth+0.5 && getComputedStyle(e).position!=='fixed' && !e.closest('[data-testid^=area-tabs]')).slice(0,8).map(e=>({tag:e.tagName, tid:e.dataset.testid||'', cls:(e.className||'').toString().slice(0,120), right:e.getBoundingClientRect().right, txt:(e.innerText||'').slice(0,40)}))""")
            print("scrollX", await page.evaluate("() => [window.scrollX, document.documentElement.scrollLeft, document.body.scrollWidth, document.documentElement.clientWidth]"))
            print("tabs rect", await page.evaluate("() => {const r=document.querySelector('[data-testid=area-tabs-ufficio]').getBoundingClientRect(); return [r.left,r.right]}"))
            print("all wide", await page.evaluate("() => [...document.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect(); return r.right>390.5 && !e.closest('[data-testid^=area-tabs]')}).map(e=>e.tagName+'|'+(e.dataset&&e.dataset.testid||'')+'|'+getComputedStyle(e).position+'|'+e.getBoundingClientRect().right+'|'+(e.className||'').toString().slice(0,80)).slice(0,10)"))
            for w in wide:
                print("WIDE", w)
            print("overflow", await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth"))
            await page.screenshot(path="/app/test_reports/screenshots/iter44_profilo.jpg", quality=40, full_page=False)
        except Exception as e:
            print("ERR", repr(e))
        finally:
            await b.close()
    for i in ids:
        requests.delete(f"{URL}/api/clients/{i}", headers=h)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": token})


asyncio.run(main())
