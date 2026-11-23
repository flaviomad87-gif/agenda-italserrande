# Iter38: theme migration (initTheme v2) + blue visual check at 390px on WebKit
import asyncio, uuid, requests, json
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].strip('"')
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
EMAIL = f"testuser+iter38{uuid.uuid4().hex[:8]}@italserrande.test"
PW = "TestPassword123!"
SS = "/app/test_reports/screenshots/i38_"
RES = []

OLD = {"rgb(74, 93, 35)": "#4A5D23", "rgb(184, 104, 61)": "#B8683D", "rgb(60, 75, 28)": "#3C4B1C",
       "rgb(60, 76, 28)": "#3C4C1C", "rgb(46, 90, 71)": "#2E5A47", "rgb(159, 86, 48)": "#9F5630",
       "rgb(249, 248, 246)": "#F9F8F6"}

SCAN = """(old) => { const out=[]; for (const e of document.querySelectorAll('body *')) { const r=e.getBoundingClientRect(); if(!r.width||!r.height) continue;
 const cs=getComputedStyle(e); for (const p of ['backgroundColor','color','borderTopColor']) { if (p==='borderTopColor' && cs.borderTopWidth==='0px') continue; const v=cs[p]; if (old[v]) out.push((e.getAttribute('data-testid')||e.tagName)+' '+p+'='+old[v]+' cls='+(e.className&&e.className.baseVal===undefined?e.className:'').slice(0,160)); } } return out; }"""


def ok(n, c, x=""):
    RES.append((n, bool(c))); print(("PASS " if c else "FAIL ") + n, x)


async def login(page):
    await page.fill("input[type=email]", EMAIL)
    await page.fill("input[type=password]", PW)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(5000)


async def theme(page):
    return await page.evaluate("document.documentElement.getAttribute('data-theme')")


async def ls(page):
    return await page.evaluate("JSON.stringify({t:localStorage.getItem('agenda_theme'),v1:localStorage.getItem('theme_blu_v1'),v2:localStorage.getItem('theme_blu_v2')})")


async def preset_case(b, dev, name, preset, expected):
    ctx = await b.new_context(**dev, locale="it-IT", timezone_id="Europe/Rome", service_workers="block")
    page = await ctx.new_page()
    await page.goto(URL + "/login"); await page.wait_for_timeout(1500)
    await page.evaluate("(p)=>{localStorage.clear(); for(const k in p) localStorage.setItem(k,p[k]);}", preset)
    await page.reload(); await page.wait_for_timeout(2000)
    if await page.locator("input[type=email]").count():
        await login(page)
    await page.reload(); await page.wait_for_timeout(3500)
    t = await theme(page)
    ok(f"{name}: theme={expected}", t == expected, f"{t} ls={await ls(page)}")
    if expected == "blu-italserrande":
        await page.goto(URL + "/prossimi-lavori"); await page.wait_for_timeout(3000)
        bg = await page.evaluate("()=>{const e=document.querySelector('[data-testid=add-pending-button]');return e?getComputedStyle(e).backgroundColor:'none'}")
        ok(f"{name}: Nuovo lavoro navy", bg == "rgb(11, 46, 102)", bg)
    await ctx.close()


async def main():
    tok = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                        json={"email": EMAIL, "password": PW, "returnSecureToken": True}).json()["idToken"]
    H = {"Authorization": "Bearer " + tok}
    ids = []
    try:
        c = requests.post(URL + "/api/clients", headers=H, json={"name": "TEST_iter38 rossi", "address": "via roma 1", "date": "2027-03-11", "pending": True, "amount": 0, "appointment_at": "2027-03-11T10:30"}).json()
        ids.append(c.get("id"))
        c2 = requests.post(URL + "/api/clients", headers=H, json={"name": "TEST_iter38 bianchi", "address": "via po 2", "date": "2027-03-11", "pending": True, "to_quote": True, "amount": 0}).json()
        ids.append(c2.get("id"))
        print("seeded", ids)
        async with async_playwright() as p:
            b = await p.webkit.launch()
            dev = {k: v for k, v in p.devices["iPhone 13"].items()}
            await preset_case(b, dev, "a empty", {}, "blu-italserrande")
            await preset_case(b, dev, "b verde+v1", {"agenda_theme": "verde-classico", "theme_blu_v1": "1"}, "blu-italserrande")
            await preset_case(b, dev, "c verde no flags", {"agenda_theme": "verde-classico"}, "blu-italserrande")
            await preset_case(b, dev, "d notte-blu", {"agenda_theme": "notte-blu"}, "notte-blu")

            # Visual + profile flow
            ctx = await b.new_context(**dev, locale="it-IT", timezone_id="Europe/Rome", service_workers="block")
            page = await ctx.new_page()
            logs = []
            page.on("pageerror", lambda e: logs.append(str(e)))
            await page.goto(URL + "/login"); await page.wait_for_timeout(1500)
            await page.evaluate("localStorage.clear()")
            await login(page)
            await page.goto(URL + "/prossimi-lavori"); await page.wait_for_timeout(3500)
            ok("v2 flag set", json.loads(await ls(page))["v2"] == "1")
            cols = await page.evaluate("""()=>{const q=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).backgroundColor+' | color '+getComputedStyle(e).color:'none'};
              const ex=[...document.querySelectorAll('button')].filter(b=>/Esegui oggi/i.test(b.textContent))[0];
              return {nuovo:q('[data-testid=add-pending-button]'), esegui: ex?getComputedStyle(ex).backgroundColor+' testid='+ex.getAttribute('data-testid'):'none'}}""")
            print("prossimi colors", cols)
            ok("Nuovo lavoro navy", cols["nuovo"].startswith("rgb(11, 46, 102)"), cols["nuovo"])
            ok("Esegui oggi blue", cols["esegui"].startswith("rgb(0, 71, 171)"), cols["esegui"])
            nav = await page.evaluate("""()=>[...document.querySelectorAll('nav a, nav button')].map(a=>(a.getAttribute('data-testid')||a.textContent.trim())+':'+getComputedStyle(a).color+(a.getAttribute('aria-current')?'*':''))""")
            print("nav", nav)
            await page.screenshot(path=SS + "prossimi.png", quality=40, type="jpeg")
            for path in ["/prossimi-lavori", "/da-preventivare", "/agenda", "/profilo"]:
                await page.goto(URL + path); await page.wait_for_timeout(3000)
                left = await page.evaluate(SCAN, OLD)
                ok(f"no old colors on {path}", not left, "\n   " + "\n   ".join(left[:25]))
                await page.screenshot(path=SS + path.strip("/") + ".png", quality=40, type="jpeg")
            # Profilo theme picker
            await page.goto(URL + "/profilo"); await page.wait_for_timeout(3000)
            opts = await page.evaluate("""()=>[...document.querySelectorAll('[data-testid^="theme-option-"],[data-testid^="theme-"]')].map(e=>e.getAttribute('data-testid'))""")
            print("theme testids", opts)
            first = [o for o in opts if o and "blu-italserrande" in o or (o and "verde" in o)]
            ok("Blu Italserrande listed before verde", first and "blu-italserrande" in first[0], str(first[:3]))
            vb = page.locator('[data-testid*="verde-classico"]').first
            if await vb.count():
                await vb.scroll_into_view_if_needed(); await vb.click(); await page.wait_for_timeout(1200)
                ok("switch to verde applies", await theme(page) == "verde-classico")
                await page.reload(); await page.wait_for_timeout(3500)
                ok("verde persists after reload", await theme(page) == "verde-classico", await ls(page))
                await page.goto(URL + "/prossimi-lavori"); await page.wait_for_timeout(3000)
                ok("verde persists after nav", await theme(page) == "verde-classico")
                await page.goto(URL + "/profilo"); await page.wait_for_timeout(2500)
                bb = page.locator('[data-testid*="blu-italserrande"]').first
                await bb.scroll_into_view_if_needed(); await bb.click(); await page.wait_for_timeout(1000)
                await page.reload(); await page.wait_for_timeout(3000)
                ok("switch back to blu persists", await theme(page) == "blu-italserrande")
            else:
                ok("verde option found", False)
            print("page errors", logs[:5])
            await b.close()
    finally:
        for i in ids:
            if i: requests.delete(f"{URL}/api/clients/{i}", headers=H)
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": tok})
        print("SUMMARY", sum(r[1] for r in RES), "/", len(RES))

asyncio.run(main())
