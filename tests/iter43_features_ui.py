# Iter43 UI: pratica dal lavoro, rilievo->preventivo, mic buttons, pagina pubblica impianto, PDF targhetta QR, regressioni
import asyncio, re, time, uuid, io
from datetime import date
import requests
from pypdf import PdfReader
from PIL import Image
import zxingcpp
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/")
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
EXE = "/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell"
EMAIL = f"testuser+iter43{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
PWD = "TestPassword123!"
R = {"pass": [], "fail": []}
SHOT = "/app/test_reports/screenshots"


def ok(name, cond, extra=""):
    (R["pass"] if cond else R["fail"]).append(f"{name} {extra}")
    print(("PASS " if cond else "FAIL ") + name, str(extra)[:400], flush=True)


def pdftxt(path):
    rd = PdfReader(path)
    return rd, re.sub(r"\s+", " ", "\n".join((p.extract_text() or "") for p in rd.pages))


async def dl(page, testid, name):
    async with page.expect_download(timeout=60000) as d:
        await page.click(f'[data-testid="{testid}"]', force=True)
    dd = await d.value
    path = f"/tmp/iter43_{name}.pdf"
    await dd.save_as(path)
    await page.wait_for_timeout(500)
    return path


MIC_JS = """(id) => {
  const m = document.querySelector(`[data-testid="${id}"]`);
  if (!m) return null;
  const ta = m.parentElement.querySelector('textarea');
  const a = m.getBoundingClientRect(), b = ta.getBoundingClientRect();
  return {inside: a.left >= b.left && a.right <= b.right + 0.5 && a.top >= b.top && a.bottom <= b.bottom + 0.5,
          dr: b.right - a.right, db: b.bottom - a.bottom, pr: parseFloat(getComputedStyle(ta).paddingRight), mw: a.width, vis: a.width > 0};
}"""


async def check_mic(page, mid, label=None):
    g = await page.evaluate(MIC_JS, mid)
    ok(f"mic {label or mid} visible+inside bottom-right, padding", bool(g) and g["vis"] and g["inside"] and g["dr"] < 14 and g["db"] < 14 and g["pr"] >= g["mw"] + 4, g)


async def main():
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}", json={"email": EMAIL, "password": PWD, "returnSecureToken": True}).json()
    token = r["idToken"]
    h = {"Authorization": "Bearer " + token}
    today = date.today().isoformat()
    cl = requests.post(f"{URL}/api/clients", headers=h, json={"date": today, "name": "TEST_Rossi Mario", "address": "Via Test 12, Roma", "status": "preventivo"}).json()
    cid = cl["id"]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", accept_downloads=True)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        sel = lambda t: f'[data-testid="{t}"]'
        iv = lambda t: page.input_value(sel(t))
        token_p = None
        try:
            await page.goto(URL + "/login")
            await page.wait_for_selector(sel("login-email-input"), timeout=15000)
            ok("webkitSpeechRecognition present", await page.evaluate("() => !!(window.SpeechRecognition || window.webkitSpeechRecognition)"))
            await page.fill(sel("login-email-input"), EMAIL)
            await page.fill(sel("login-password-input"), PWD)
            await page.click(sel("login-submit-button"))
            await page.wait_for_selector(sel("mobile-menu-button"), timeout=20000)
            await page.goto(URL + "/agenda")
            await page.wait_for_selector(sel(f"client-card-{cid}"), timeout=15000)
            await page.click(sel(f"client-card-{cid}"))
            await page.wait_for_selector(sel("client-new-pratica-button"), timeout=10000)
            pb = await page.locator(sel("client-new-pratica-button")).bounding_box()
            rb = await page.locator(sel("client-rilievi-section")).bounding_box()
            ok("pratica button above rilievi", pb["y"] + pb["height"] <= rb["y"] + 1, (pb, rb))
            await page.locator(sel("client-notes-input")).scroll_into_view_if_needed()
            await check_mic(page, "client-notes-mic")
            await page.locator(sel("client-new-pratica-button")).scroll_into_view_if_needed()
            await page.screenshot(path=f"{SHOT}/i43_job.jpg", quality=40)

            # ---- (3) rilievo -> preventivo
            await page.click(sel("client-new-rilievo-button"))
            await page.wait_for_selector(sel("rilievo-dialog"), timeout=8000)
            await page.fill(sel("rilievo-input-l-larghezza-foro-muro"), "2500")
            await page.fill(sel("rilievo-input-h-altezza-foro-muro"), "2200")
            await page.click(sel("rilievo-tipo-A"))
            await page.fill(sel("rilievo-input-modello"), "S2 Woodgrain")
            await page.fill(sel("rilievo-input-colore"), "RAL 9010")
            for k in ["motore", "fotocellule", "montaggio"]:
                await page.click(sel(f"rilievo-{k}-sì"))
            n_q = len(requests.get(f"{URL}/api/quotes", headers=h).json())
            await page.click(sel("rilievo-to-quote"))
            await page.wait_for_url(re.compile(r".*/preventivi/[^/]+$"), timeout=15000)
            qid = page.url.rstrip("/").split("/")[-1]
            ok("navigated to /preventivi/<id>", bool(qid), page.url)
            rl = requests.get(f"{URL}/api/rilievi-sezionali", headers=h).json()
            rl = rl if isinstance(rl, list) else rl.get("items", [])
            ok("rilievo saved", any(x.get("client_id") == cid for x in rl), [(x.get("client_id"), x.get("l")) for x in rl])
            q = requests.get(f"{URL}/api/quotes/{qid}", headers=h).json()
            descs = [li["description"] for li in q.get("lineItems", [])]
            print("QUOTE:", q.get("clientName"), q.get("clientAddress"), descs, [li["amount"] for li in q.get("lineItems", [])])
            ok("quote client uppercase", q.get("clientName") == "TEST_ROSSI MARIO" and q.get("clientAddress") == "VIA TEST 12, ROMA", (q.get("clientName"), q.get("clientAddress")))
            ok("quote line porta", bool(descs) and descs[0].startswith("Porta sezionale") and "misure foro L 2500 x H 2200 mm" in descs[0], descs[:1])
            ok("quote lines accessori", descs[1:] == ["Motorizzazione con centralina di comando", "Coppia di fotocellule di sicurezza", "Montaggio e messa in opera"], descs)
            ok("quote amounts 0", all(li["amount"] == 0 for li in q.get("lineItems", [])))
            ok("quote linked client", q.get("client_id") == cid, q.get("client_id"))
            ok("one quote created", len(requests.get(f"{URL}/api/quotes", headers=h).json()) == n_q + 1)
            await page.wait_for_timeout(2500)
            body = await page.inner_text("body")
            ok("quote editor shows lines", "Coppia di fotocellule di sicurezza" in body or await page.locator("textarea, input").evaluate_all("els => els.some(e => (e.value||'').includes('fotocellule'))"))
            await page.screenshot(path=f"{SHOT}/i43_quote.jpg", quality=40)

            # ---- (2) pratica dal lavoro
            await page.goto(URL + "/agenda")
            await page.wait_for_selector(sel(f"client-card-{cid}"), timeout=15000)
            await page.click(sel(f"client-card-{cid}"))
            await page.wait_for_selector(sel("client-new-pratica-button"), timeout=10000)
            try:
                await page.wait_for_selector('[data-testid^="client-rilievo-item-"]', timeout=8000); ok("rilievo listed in job", True)
            except Exception:
                ok("rilievo listed in job", False)
            await page.click(sel("client-new-pratica-button"))
            await page.wait_for_selector(sel("pratica-dialog"), timeout=10000)
            await page.wait_for_timeout(500)
            ok("url /documenti no params", page.url.rstrip("/") == URL + "/documenti", page.url)
            vals = {k: await iv(f"documento-input-{k}") for k in ["cliente", "indirizzo"]}
            ok("pratica prefilled from job", vals == {"cliente": "TEST_Rossi Mario", "indirizzo": "Via Test 12, Roma"}, vals)
            mics = await page.eval_on_selector_all('[data-testid^="pratica-"][data-testid$="-mic"]', "els => els.map(e => e.dataset.testid)")
            ok("pratica mic buttons present", len(mics) >= 1, mics)
            for m in mics:
                await page.locator(sel(m)).scroll_into_view_if_needed()
                await check_mic(page, m)
            await page.fill(sel("documento-input-modello"), "TEST_Sezionale S2") if await page.locator(sel("documento-input-modello")).count() else None
            n_prat = len(requests.get(f"{URL}/api/documenti?kind=pratica", headers=h).json())
            await page.screenshot(path=f"{SHOT}/i43_pratica_prefill.jpg", quality=40)
            await page.click(sel("pratica-save"))
            await page.wait_for_selector(sel("pratica-dialog"), state="detached", timeout=10000)
            pr = requests.get(f"{URL}/api/documenti?kind=pratica", headers=h).json()
            ok("pratica created", len(pr) == n_prat + 1 and pr[0]["cliente"] == "TEST_Rossi Mario", [(x["cliente"], x.get("public_token")) for x in pr])
            prat = pr[0]
            token_p = prat.get("public_token")
            ok("pratica public_token", bool(token_p and re.match(r"^[0-9a-f]{32}$", token_p)), token_p)
            await page.wait_for_timeout(800)
            ok("url still clean after save", "nuova" not in page.url, page.url)

            # ---- (11) PDF targhetta + QR
            await page.click(sel(f"documento-row-{prat['id']}"))
            await page.wait_for_selector(sel("pratica-dialog"), timeout=8000)
            path = await dl(page, "pratica-pdf-targhetta", "targhetta")
            rd, t = pdftxt(path)
            ok("targhetta text 'Inquadra per assistenza'", t.count("Inquadra per assistenza") == 2, t.count("Inquadra per assistenza"))
            imgs = [im for pg in rd.pages for im in pg.images]
            decoded = []
            for im in imgs:
                pil = Image.open(io.BytesIO(im.data)).convert("L")
                big = Image.new("L", (pil.width + 80, pil.height + 80), 255); big.paste(pil, (40, 40))
                decoded += [x.text for x in zxingcpp.read_barcodes(big)]
            print("QR images:", len(imgs), decoded)
            exp = f"{URL}/impianto/{token_p}"
            cs = rd.pages[0].get_contents().get_data().decode("latin1")
            qr_names = [im.name.split(".")[0] for im in imgs if exp in [x.text for x in zxingcpp.read_barcodes(Image.open(io.BytesIO(im.data)).convert("L"))]] or ["I1"]
            ok("QR decodes to /impianto/<token>", exp in decoded, (decoded, exp))
            ok("QR drawn on both targhette", cs.count(f"/{qr_names[0]} Do") == 2, cs.count(f"/{qr_names[0]} Do"))
            path = await dl(page, "pratica-share-all", "all")
            rd2, t2 = pdftxt(path)
            ok("pratica full pdf", len(rd2.pages) >= 5 and "Inquadra per assistenza" in t2, len(rd2.pages))
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)

            # ---- (4) mics in manutenzione, verifica, contratto + Invia PDF
            await page.click(sel("documenti-tab-manutenzione"))
            await page.wait_for_timeout(500)
            await page.click(sel("documenti-add"))
            await page.wait_for_selector(sel("man-descrizione"), timeout=8000)
            await page.locator(sel("man-descrizione")).scroll_into_view_if_needed()
            await check_mic(page, "man-descrizione-mic")
            await page.fill(sel("man-descrizione"), "TEST_intervento")
            await page.fill(sel("documento-input-cliente"), "TEST_Man") if await page.locator(sel("documento-input-cliente")).count() else None
            share_txt = await page.inner_text(sel("documento-share"))
            ok("documento-share label 'Invia PDF'", "Invia PDF" in share_txt, share_txt)
            path = await dl(page, "documento-share", "man")
            _, tm = pdftxt(path)
            ok("manutenzione Invia PDF downloads", "TEST_intervento" in tm or len(tm) > 50)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            await page.click(sel("documenti-tab-verifica")); await page.wait_for_timeout(500)
            await page.click(sel("documenti-add"))
            await page.wait_for_selector(sel("verifica-dialog"), timeout=8000)
            for m in ["verifica-interventi-mic", "verifica-parti-mic"]:
                await page.locator(sel(m)).scroll_into_view_if_needed()
                await check_mic(page, m)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            for k in ["pratica", "ce"]:
                await page.click(sel(f"documenti-tab-{k}")); await page.wait_for_timeout(500)
                await page.click(sel("documenti-add")); await page.wait_for_timeout(800)
                ok(f"tab {k} opens dialog", await page.locator('[role="dialog"]').count() >= 1)
                await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            await page.goto(URL + "/contratti")
            await page.wait_for_selector(sel("contratti-add"), timeout=15000)
            await page.click(sel("contratti-add"))
            await page.wait_for_selector(sel("contratto-note"), timeout=8000)
            await page.locator(sel("contratto-note")).scroll_into_view_if_needed()
            await check_mic(page, "contratto-note-mic")
            await page.screenshot(path=f"{SHOT}/i43_contratto_mic.jpg", quality=40)
            await page.keyboard.press("Escape")
        except Exception as e:
            ok("EXCEPTION", False, repr(e))
            await page.screenshot(path=f"{SHOT}/i43_error.jpg", quality=40)
        ok("no page errors (main)", not errs, errs)

        # ---- (11) public page, no login
        pctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        pp = await pctx.new_page()
        perrs = []
        pp.on("pageerror", lambda e: perrs.append(str(e)))
        try:
            if token_p:
                await pp.goto(f"{URL}/impianto/{token_p}")
                await pp.wait_for_selector(sel("impianto-tipo"), timeout=15000)
                ok("public page stays (no login redirect)", "/impianto/" in pp.url, pp.url)
                ok("public logo", await pp.eval_on_selector('img[alt="Italserrande S.r.l."]', "e => e.naturalWidth") > 0)
                vals = {k: (await pp.inner_text(sel(f"impianto-{k}")) if await pp.locator(sel(f"impianto-{k}")).count() else None) for k in ["tipo", "modello", "matricola", "installazione", "ultima", "prossima"]}
                print("PUBLIC:", vals)
                ok("public rows tipo/matricola/installazione/ultima/prossima", all(vals[k] for k in ["tipo", "matricola", "installazione", "ultima", "prossima"]), vals)
                ok("public row modello", bool(vals["modello"]), vals["modello"])
                hrefs = {k: await pp.get_attribute(sel(k), "href") for k in ["impianto-call", "impianto-call-office", "impianto-mail"]}
                ok("public contact links", hrefs["impianto-call"] == "tel:+39337743730" and hrefs["impianto-call-office"].startswith("tel:") and hrefs["impianto-mail"].startswith("mailto:"), hrefs)
                body = await pp.inner_text("body")
                ok("public no personal data", "Rossi" not in body and "Via Test" not in body)
                await pp.screenshot(path=f"{SHOT}/i43_public.jpg", quality=40)
            await pp.goto(f"{URL}/impianto/{uuid.uuid4().hex}")
            await pp.wait_for_selector(sel("impianto-not-found"), timeout=15000)
            ok("public bad token -> not found", True)
        except Exception as e:
            ok("EXCEPTION public", False, repr(e))
            await pp.screenshot(path=f"{SHOT}/i43_public_err.jpg", quality=40)
        ok("no page errors (public)", not perrs, perrs)

        # ---- (4) unsupported browser simulation: mic hidden, no errors
        uctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        await uctx.add_init_script("delete window.webkitSpeechRecognition; delete window.SpeechRecognition;")
        up = await uctx.new_page()
        uerrs = []
        up.on("pageerror", lambda e: uerrs.append(str(e)))
        try:
            await up.goto(URL + "/login")
            await up.wait_for_selector(sel("login-email-input"), timeout=15000)
            ok("unsupported: no recognition", not await up.evaluate("() => !!(window.SpeechRecognition || window.webkitSpeechRecognition)"))
            await up.fill(sel("login-email-input"), EMAIL); await up.fill(sel("login-password-input"), PWD)
            await up.click(sel("login-submit-button"))
            await up.wait_for_selector(sel("mobile-menu-button"), timeout=20000)
            await up.goto(URL + "/agenda")
            await up.wait_for_selector(sel(f"client-card-{cid}"), timeout=15000)
            await up.click(sel(f"client-card-{cid}"))
            await up.wait_for_selector(sel("client-notes-input"), timeout=10000)
            ok("unsupported: client-notes-mic hidden", await up.locator(sel("client-notes-mic")).count() == 0)
            await up.goto(URL + "/documenti")
            await up.wait_for_selector(sel("documenti-tab-manutenzione"), timeout=15000)
            await up.click(sel("documenti-tab-manutenzione")); await up.wait_for_timeout(500)
            await up.click(sel("documenti-add"))
            await up.wait_for_selector(sel("man-descrizione"), timeout=8000)
            ok("unsupported: man mic hidden", await up.locator('[data-testid$="-mic"]').count() == 0)
        except Exception as e:
            ok("EXCEPTION unsupported", False, repr(e))
        ok("no page errors (unsupported)", not uerrs, uerrs)
        await b.close()

    # cleanup
    for d in requests.get(f"{URL}/api/documenti", headers=h).json():
        requests.delete(f"{URL}/api/documenti/{d['id']}", headers=h)
    for q in requests.get(f"{URL}/api/quotes", headers=h).json():
        requests.delete(f"{URL}/api/quotes/{q['id']}", headers=h)
    rl = requests.get(f"{URL}/api/rilievi-sezionali", headers=h).json()
    for x in (rl if isinstance(rl, list) else []):
        requests.delete(f"{URL}/api/rilievi-sezionali/{x['id']}", headers=h)
    requests.delete(f"{URL}/api/clients/{cid}", headers=h)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": token})
    print(f"\nRESULT: {len(R['pass'])} pass, {len(R['fail'])} fail")
    for f in R["fail"]:
        print("  FAIL:", f[:400])


asyncio.run(main())
