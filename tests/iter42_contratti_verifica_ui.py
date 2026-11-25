# Iter42 UI: Contratti manutenzione (badge/dot/banner, dialog, visite, PDF), Verbale verifica (PDF, foto, crea pratica), logo, regression tabs
import asyncio, re, time, uuid, calendar
from datetime import date, timedelta
import requests
from pypdf import PdfReader
from PIL import Image
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].strip('"').rstrip("/")
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
EXE = "/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell"
EMAIL = f"testuser+iter42{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
PWD = "TestPassword123!"
R = {"pass": [], "fail": []}
SHOT = "/app/test_reports/screenshots"


def ok(name, cond, extra=""):
    (R["pass"] if cond else R["fail"]).append(f"{name} {extra}")
    print(("PASS " if cond else "FAIL ") + name, str(extra)[:300], flush=True)


def add_months(d, n):
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def pdftxt(path):
    rd = PdfReader(path)
    return len(rd.pages), re.sub(r"\s+", " ", "\n".join((p.extract_text() or "") for p in rd.pages))


async def dl(page, testid, name):
    async with page.expect_download(timeout=60000) as d:
        await page.click(f'[data-testid="{testid}"]', force=True)
    dd = await d.value
    path = f"/tmp/iter42_{name}.pdf"
    await dd.save_as(path)
    await page.wait_for_timeout(500)
    return path


async def main():
    Image.new("RGB", (400, 300), (180, 60, 40)).save("/tmp/iter42_photo.jpg")
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}", json={"email": EMAIL, "password": PWD, "returnSecureToken": True}).json()
    token = r["idToken"]
    h = {"Authorization": "Bearer " + token}
    today = date.today()
    seed = requests.post(f"{URL}/api/contratti", headers=h, json={"cliente": "TEST_Seed Due", "data_inizio": (add_months(today, -6) + timedelta(days=4)).isoformat()}).json()
    for p in ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.png", "/app-logo.jpg"]:
        rr = requests.get(URL + p)
        ok(f"asset {p}", rr.status_code == 200 and rr.headers.get("content-type", "").startswith("image"), rr.headers.get("content-type"))
    mf = requests.get(URL + "/manifest.json").json()
    ok("manifest icons", any("icon-512" in i["src"] for i in mf.get("icons", [])), [i["src"] for i in mf.get("icons", [])])
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", accept_downloads=True)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        sel = lambda t: f'[data-testid="{t}"]'
        iv = lambda t: page.input_value(sel(t))
        is_on = lambda t: page.eval_on_selector(sel(t), "e => e.className.includes('bg-[#4A5D23]')")
        try:
            await page.goto(URL + "/login")
            await page.wait_for_selector(sel("login-logo"), timeout=15000)
            src = await page.get_attribute(sel("login-logo"), "src")
            nat = await page.eval_on_selector(sel("login-logo"), "e => e.naturalWidth")
            ok("login logo", src == "/app-logo.jpg" and nat > 0, f"{src} w={nat}")
            await page.screenshot(path=f"{SHOT}/i42_login.jpg", quality=40)
            await page.fill(sel("login-email-input"), EMAIL)
            await page.fill(sel("login-password-input"), PWD)
            await page.click(sel("login-submit-button"))
            await page.wait_for_selector(sel("mobile-menu-button"), timeout=20000)
            await page.goto(URL + "/prossimi-lavori")
            await page.wait_for_selector(sel("contratti-scadenza-banner"), timeout=15000)
            ok("mobile-menu-dot", await page.locator(sel("mobile-menu-dot")).count() == 1)
            ok("banner text", "1 manutenzione in scadenza" in await page.inner_text(sel("contratti-scadenza-banner")))
            await page.click(sel("contratti-scadenza-banner"))
            await page.wait_for_url("**/contratti", timeout=8000)
            ok("banner -> /contratti", page.url.endswith("/contratti"))
            await page.click(sel("mobile-menu-button"))
            await page.wait_for_selector(sel("menu-nav-contratti"), timeout=5000)
            ok("menu contratti label", "Contratti manutenzione" in await page.inner_text(sel("menu-nav-contratti")))
            ok("menu contratti badge", (await page.inner_text(sel("menu-nav-contratti-badge"))).strip() == "1")
            await page.screenshot(path=f"{SHOT}/i42_menu.jpg", quality=40)
            await page.click(sel("menu-nav-contratti"))
            await page.wait_for_timeout(800)
            await page.wait_for_selector(sel("contratti-due-banner"), timeout=8000)
            ok("contratti-due-banner", True)
            ok("seed row chip", "tra 4 gg" in await page.inner_text(sel(f"contratto-row-{seed['id']}")), await page.inner_text(sel(f"contratto-row-{seed['id']}")))

            # ---- New contratto via UI
            await page.click(sel("contratti-add"))
            await page.wait_for_selector(sel("contratto-dialog"))
            for k, v in [("cliente", "TEST_Bianchi Srl"), ("indirizzo", "Via Roma 1"), ("comune", "Roma (RM)"), ("telefono", "0000000000"), ("email-cliente", "test@example.com"), ("cf-piva", "TESTCF123")]:
                await page.fill(sel(f"documento-input-{k}"), v)
            await page.fill(sel("contratto-impianto-0-descrizione"), "Serranda avvolgibile negozio")
            await page.fill(sel("contratto-impianto-0-matricola"), "MAT-A1")
            await page.click(sel("contratto-impianto-add"))
            await page.fill(sel("contratto-impianto-1-descrizione"), "Porta sezionale box")
            await page.click(sel("contratto-impianto-add"))
            ok("impianto add 3 rows", await page.locator('[data-testid^="contratto-impianto-"][data-testid$="-remove"]').count() == 3)
            await page.click(sel("contratto-impianto-2-remove"))
            ok("impianto remove", await page.locator(sel("contratto-impianto-2")).count() == 0)
            ok("default data_inizio today", await iv("documento-input-data-inizio") == today.isoformat(), await iv("documento-input-data-inizio"))
            ok("default chips 12/6/true/attivo", all([await is_on("contratto-durata-12"), await is_on("contratto-frequenza-6"), await is_on("contratto-rinnovo-true"), await is_on("contratto-stato-attivo")]))
            await page.click(sel("contratto-durata-24")); await page.click(sel("contratto-frequenza-3")); await page.click(sel("contratto-rinnovo-false"))
            ok("chips toggle", await is_on("contratto-durata-24") and await is_on("contratto-frequenza-3") and await is_on("contratto-rinnovo-false") and not await is_on("contratto-durata-12"))
            await page.click(sel("contratto-durata-12")); await page.click(sel("contratto-frequenza-6")); await page.click(sel("contratto-rinnovo-true"))
            start = add_months(today, -6) + timedelta(days=10)
            await page.fill(sel("documento-input-data-inizio"), start.isoformat())
            await page.fill(sel("documento-input-canone"), "€ 180,00")
            await page.fill(sel("documento-input-sconto"), "10%")
            await page.fill(sel("documento-input-pagamento"), "anticipato alla firma")
            await page.fill(sel("contratto-note"), "TEST_note")
            await page.screenshot(path=f"{SHOT}/i42_contratto_dialog.jpg", quality=40)
            await page.click(sel("contratto-save"))
            await page.wait_for_selector(sel("contratto-dialog"), state="detached", timeout=10000)
            lst = requests.get(f"{URL}/api/contratti", headers=h).json()
            c = [x for x in lst if x["cliente"] == "TEST_Bianchi Srl"]
            ok("contratto persisted", len(c) == 1 and len(c[0]["impianti"]) == 2 and c[0]["canone"] == "€ 180,00" and c[0]["email_cliente"] == "test@example.com", c[0] if c else lst)
            c = c[0]
            ok("prossima computed", c["prossima_visita"] == add_months(start, 6).isoformat(), c["prossima_visita"])
            row = await page.inner_text(sel(f"contratto-row-{c['id']}"))
            ok("row prossima + chip", "Prossima visita" in row and f"tra {(add_months(start, 6) - today).days} gg" in row, row)
            await page.wait_for_timeout(1500)
            ok("menu dot still (badge refreshed)", await page.locator(sel("mobile-menu-dot")).count() == 1)

            # ---- Visit + PDF
            await page.click(sel(f"contratto-row-{c['id']}"))
            await page.wait_for_selector(sel("contratto-dialog"))
            vdate = (today - timedelta(days=1)).isoformat()
            await page.fill(sel("contratto-visita-data"), vdate)
            await page.fill(sel("contratto-visita-nota"), "TEST_visita ok")
            await page.click(sel("contratto-visita-add"))
            await page.wait_for_selector("text=Visita registrata", timeout=8000)
            ok("toast visita", True)
            pr = await page.inner_text(sel("contratto-prossima"))
            exp = add_months(today - timedelta(days=1), 6)
            ok("prossima updated", exp.strftime("%d/%m/%Y") in pr, pr)
            ok("visita-0 row", "TEST_visita ok" in await page.inner_text(sel("contratto-visita-0")))
            path = await dl(page, "contratto-share", "contratto")
            n, t = pdftxt(path)
            for s in ["CONTRATTO DI MANUTENZIONE PROGRAMMATA", "TEST_Bianchi Srl", "Serranda avvolgibile negozio", "Porta sezionale box", "ogni 6 mesi", "1341", "1342"]:
                ok(f"contratto pdf '{s}'", s in t)
            ok("contratto pdf pages", n >= 1, n)
            await page.screenshot(path=f"{SHOT}/i42_contratto_after.jpg", quality=40)
            # disdetto via UI
            await page.click(sel("contratto-stato-disdetto"))
            await page.click(sel("contratto-save"))
            await page.wait_for_selector(sel("contratto-dialog"), state="detached", timeout=10000)
            ok("row Disdetto", "Disdetto" in await page.inner_text(sel(f"contratto-row-{c['id']}")))
            # delete
            await page.click(sel(f"contratto-row-{c['id']}"))
            await page.wait_for_selector(sel("contratto-delete"))
            await page.click(sel("contratto-delete"))
            await page.wait_for_selector(sel(f"contratto-row-{c['id']}"), state="detached", timeout=8000)
            ok("contratto deleted", not any(x["id"] == c["id"] for x in requests.get(f"{URL}/api/contratti", headers=h).json()))

            # ---- Verbale di verifica
            await page.goto(URL + "/documenti")
            await page.wait_for_selector(sel("documenti-tab-verifica"), timeout=15000)
            await page.click(sel("documenti-tab-verifica"))
            await page.click(sel("documenti-add"))
            await page.wait_for_selector(sel("verifica-dialog"), timeout=8000)
            for k, v in [("cliente", "TEST_Verdi Mario"), ("indirizzo", "Via Milano 5"), ("comune", "Roma (RM)"), ("modello", "Basculante Ballan"), ("anno-stimato", "1998"), ("installatore", "Sconosciuto")]:
                await page.fill(sel(f"documento-input-{k}"), v)
            await page.click(sel("verifica-tipo-basculante"))
            await page.click(sel("verifica-motorizzata-true"))
            ok("tipo/motorizzata chips", await is_on("verifica-tipo-basculante") and await is_on("verifica-motorizzata-true") and not await is_on("verifica-tipo-avvolgibile"))
            await page.click(sel("verifica-doc-ce")); await page.click(sel("verifica-doc-manuale")); await page.click(sel("verifica-doc-manuale"))
            ok("doc toggle", await is_on("verifica-doc-ce") and not await is_on("verifica-doc-manuale"))
            await page.click(sel("verifica-punto-struttura-C"))
            await page.click(sel("verifica-punto-molle-NC"))
            await page.wait_for_selector(sel("verifica-punto-molle-nota"), timeout=3000)
            await page.fill(sel("verifica-punto-molle-nota"), "Molle snervate")
            await page.click(sel("verifica-punto-motore-NA"))
            ok("crea-pratica hidden w/o esito", await page.locator(sel("verifica-crea-pratica")).count() == 0)
            await page.click(sel("verifica-esito-non_idonea"))
            ok("crea-pratica hidden non_idonea", await page.locator(sel("verifica-crea-pratica")).count() == 0)
            await page.click(sel("verifica-esito-idonea"))
            ok("crea-pratica visible idonea", await page.locator(sel("verifica-crea-pratica")).count() == 1)
            await page.click(sel("verifica-esito-adeguamento"))
            await page.fill(sel("verifica-interventi"), "Sostituzione molle")
            await page.fill(sel("verifica-parti"), "2 molle di bilanciamento")
            await page.check(sel("verifica-cliente-rifiuta"))
            await page.click(sel("verifica-save-for-photos"))
            await page.wait_for_selector(sel("job-photos-gallery-input"), state="attached", timeout=10000)
            ok("save-for-photos -> photos section", True)
            await page.set_input_files(sel("job-photos-gallery-input"), "/tmp/iter42_photo.jpg")
            await page.wait_for_timeout(4000)
            path = await dl(page, "verifica-share", "verifica")
            n, t = pdftxt(path)
            for s in ["VERBALE DI VERIFICA IMPIANTO ESISTENTE", "TEST_Verdi Mario", "Molle snervate", "2 molle di bilanciamento", "ALLEGATO - FOTOGRAFIE DELLO STATO DI FATTO", "Il Cliente"]:
                ok(f"verifica pdf '{s}'", s in t)
            ok("verifica pdf esito adeguamento", "Idonea previa sostituzione" in t)
            ok("verifica pdf rifiuta", "non" in t.lower() and ("rifiut" in t.lower() or "non vuole" in t.lower() or "non intende" in t.lower()), "")
            print("VERIFICA PDF TXT:", t[:1500])
            docs = requests.get(f"{URL}/api/documenti?kind=verifica", headers=h).json()
            ok("verifica persisted", len(docs) == 1 and docs[0]["fields"]["esito"] == "adeguamento" and docs[0]["fields"]["punti"].get("molle") == "NC", docs[0]["fields"] if docs else docs)
            n_prat = len(requests.get(f"{URL}/api/documenti?kind=pratica", headers=h).json())
            await page.screenshot(path=f"{SHOT}/i42_verifica.jpg", quality=40)
            await page.click(sel("verifica-crea-pratica"))
            await page.wait_for_selector(sel("pratica-dialog"), timeout=8000)
            await page.wait_for_selector(sel("verifica-dialog"), state="detached", timeout=5000)
            ok("verifica dialog closed", True)
            vals = {k: await iv(f"documento-input-{k}") for k in ["cliente", "indirizzo", "comune", "modello"]}
            ok("pratica prefilled", vals == {"cliente": "TEST_Verdi Mario", "indirizzo": "Via Milano 5", "comune": "Roma (RM)", "modello": "Basculante Ballan"}, vals)
            ok("pratica tipo basculante", await is_on("pratica-tipo-basculante"))
            tr = page.locator(sel("pratica-dm37-tipo-trasformazione"))
            ok("dm37 trasformazione", await tr.count() == 1 and await is_on("pratica-dm37-tipo-trasformazione"))
            tab_on = await is_on("documenti-tab-pratica") if await page.locator(sel("documenti-tab-pratica")).count() else None
            await page.screenshot(path=f"{SHOT}/i42_pratica_prefill.jpg", quality=40)
            await page.click(sel("pratica-save"))
            await page.wait_for_selector(sel("pratica-dialog"), state="detached", timeout=10000)
            pr = requests.get(f"{URL}/api/documenti?kind=pratica", headers=h).json()
            ok("new pratica created", len(pr) == n_prat + 1 and pr[0]["fields"].get("dm37", {}).get("tipo") == "trasformazione", [(x["cliente"], x["fields"].get("dm37")) for x in pr])
            await page.wait_for_timeout(500)
            ok("pratica in list", await page.locator('[data-testid^="documento-row-"]').filter(has_text="TEST_Verdi Mario").count() >= 1)
            ok("verifica still exists", len(requests.get(f"{URL}/api/documenti?kind=verifica", headers=h).json()) == 1)

            # ---- Regression tabs
            for k in ["pratica", "ce", "manutenzione", "verifica"]:
                await page.click(sel(f"documenti-tab-{k}"))
                await page.wait_for_timeout(600)
                await page.click(sel("documenti-add"))
                await page.wait_for_timeout(800)
                dlg = {"pratica": "pratica-dialog", "verifica": "verifica-dialog"}.get(k)
                cnt = await page.locator(sel(dlg)).count() if dlg else await page.locator('[role="dialog"]').count()
                ok(f"tab {k} opens dialog", cnt >= 1)
                await page.keyboard.press("Escape")
                await page.wait_for_timeout(500)

            # ---- Desktop logo
            await page.set_viewport_size({"width": 1920, "height": 1080})
            await page.goto(URL + "/contratti")
            await page.wait_for_selector(sel("app-logo"), timeout=10000)
            ok("desktop sidebar logo", await page.get_attribute(sel("app-logo"), "src") == "/app-logo.jpg" and await page.eval_on_selector(sel("app-logo"), "e => e.naturalWidth") > 0)
            ok("desktop nav-contratti badge", await page.locator(sel("nav-contratti-badge")).count() == 1)
            await page.screenshot(path=f"{SHOT}/i42_desktop.jpg", quality=40)
        except Exception as e:
            ok("EXCEPTION", False, repr(e))
            await page.screenshot(path=f"{SHOT}/i42_error.jpg", quality=40)
        finally:
            ok("no page errors", not errs, errs)
            # cleanup
            for d in requests.get(f"{URL}/api/documenti", headers=h).json() if True else []:
                requests.delete(f"{URL}/api/documenti/{d['id']}", headers=h)
            for kd in ["pratica", "verifica"]:
                for d in requests.get(f"{URL}/api/documenti?kind={kd}", headers=h).json():
                    requests.delete(f"{URL}/api/documenti/{d['id']}", headers=h)
                    requests.delete(f"{URL}/api/clients/verifica-{d['id']}/photos", headers=h)
            for c in requests.get(f"{URL}/api/contratti", headers=h).json():
                requests.delete(f"{URL}/api/contratti/{c['id']}", headers=h)
            requests.delete(f"{URL}/api/contratti/{seed['id']}", headers=h)
            requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": token})
            await b.close()
    print(f"\nTOTAL pass={len(R['pass'])} fail={len(R['fail'])}")
    for f in R["fail"]:
        print("  FAILED:", f[:300])


asyncio.run(main())
