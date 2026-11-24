# Iter40 UI: Pratica impianto (Documenti) at 390x844 - form, persistence, PDF generation for all 5 tipi
import asyncio, io, json, re, sys, time, uuid
import requests
from pypdf import PdfReader
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].rstrip("/")
KEY = ENV["REACT_APP_FIREBASE_API_KEY"]
EXE = "/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell"
EMAIL = f"testuser+iter40{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
PWD = "TestPassword123!"
R = {"pass": [], "fail": []}


def ok(name, cond, extra=""):
    (R["pass"] if cond else R["fail"]).append(f"{name} {extra}")
    print(("PASS " if cond else "FAIL ") + name, extra, flush=True)


def pdfinfo(path):
    rd = PdfReader(path)
    txt = "\n".join((p.extract_text() or "") for p in rd.pages)
    return len(rd.pages), txt


async def dl(page, testid, name):
    async with page.expect_download(timeout=40000) as d:
        await page.click(f'[data-testid="{testid}"]', force=True)
    dd = await d.value
    path = f"/tmp/iter40_{name}.pdf"
    await dd.save_as(path)
    await page.wait_for_timeout(500)
    return path, dd.suggested_filename


async def main():
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}", json={"email": EMAIL, "password": PWD, "returnSecureToken": True}).json()
    token = r["idToken"]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", accept_downloads=True)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        try:
            await page.goto(URL + "/login")
            await page.fill('[data-testid="login-email-input"]', EMAIL)
            await page.fill('[data-testid="login-password-input"]', PWD)
            await page.click('[data-testid="login-submit-button"]')
            await page.wait_for_selector('[data-testid="mobile-menu-button"]', timeout=20000)
            await page.click('[data-testid="mobile-menu-button"]')
            await page.click('[data-testid="menu-nav-documenti"]')
            await page.wait_for_url("**/documenti", timeout=10000)
            await page.wait_for_selector('[data-testid="documenti-pratica-hint"]', timeout=10000)
            cls = await page.get_attribute('[data-testid="documenti-tab-pratica"]', "class")
            ok("default tab pratiche", "bg-white" in cls)
            await page.screenshot(path="/app/test_reports/screenshots/iter40_list_empty.jpeg", quality=40, type="jpeg")
            for t in ["ce", "manutenzione", "pratica"]:
                await page.click(f'[data-testid="documenti-tab-{t}"]')
                await page.wait_for_timeout(200)
            ok("tabs switching", await page.is_visible('[data-testid="documenti-pratica-hint"]'))

            # New pratica
            await page.click('[data-testid="documenti-add"]')
            await page.wait_for_selector('[data-testid="pratica-dialog"]', timeout=5000)
            ok("pratica-dialog opens", True)
            vals = {"cliente": "TEST_Rossi Mario", "indirizzo": "Via Roma 1", "comune": "Roma (RM)", "scala": "A", "piano": "2", "interno": "5", "proprietario": "TEST_Bianchi"}
            for k, v in vals.items():
                await page.fill(f'[data-testid="documento-input-{k}"]', v)
            await page.click('[data-testid="pratica-uso-edificio-civile"]')
            # default avvolgibile sicurezze
            async def sic_on(k):
                c = await page.get_attribute(f'[data-testid="pratica-sic-{k}"]', "class")
                return "bg-[#4A5D23]" in c and "text-white" in c
            ok("avvolgibile default paracadute on", await sic_on("paracadute"))
            ok("avvolgibile default coste off", not await sic_on("coste"))
            # set a collaudo then change tipo -> reset
            await page.click('[data-testid="pratica-collaudo-fissaggi-C"]')
            await page.click('[data-testid="pratica-tipo-sezionale"]')
            await page.wait_for_timeout(200)
            fc = await page.get_attribute('[data-testid="pratica-collaudo-fissaggi-C"]', "class")
            ok("tipo change resets collaudo", "text-white" not in fc)
            ok("sezionale defaults coste+rilevamento on", await sic_on("coste") and await sic_on("rilevamento"))
            ok("sezionale no battute checklist", await page.locator('[data-testid="pratica-collaudo-battute-C"]').count() == 0)
            imp = {"modello": "TEST_Sez 3000", "larghezza": "3000", "altezza": "2500", "matricola": "TEST_MAT40", "anno": "2026", "motore": "Nice SPIN", "centralina": "Nice MC", "alimentazione": "230 V", "radiocomandi": "3"}
            for k, v in imp.items():
                await page.fill(f'[data-testid="documento-input-{k}"]', v)
            await page.click('[data-testid="pratica-comando-impulsivo"]')
            await page.click('[data-testid="pratica-uso-privato"]')
            # toggle sicurezze
            await page.click('[data-testid="pratica-sic-battute"]')
            ok("toggle battute on", await sic_on("battute"))
            await page.click('[data-testid="pratica-sic-battute"]')
            ok("toggle battute off", not await sic_on("battute"))
            for k in ["fotocellule", "coste", "rilevamento", "lampeggiante", "finecorsa", "sblocco", "paracadute", "battute", "uomo_presente", "differenziale", "cartelli"]:
                ok(f"sic {k} exists", await page.locator(f'[data-testid="pratica-sic-{k}"]').count() == 1)
            # collaudo tutto ok
            await page.click('[data-testid="pratica-collaudo-tutto-ok"]')
            up = await page.get_attribute('[data-testid="pratica-collaudo-uomo_presente-NA"]', "class")
            fo = await page.get_attribute('[data-testid="pratica-collaudo-fotocellule-C"]', "class")
            ok("tutto ok: uomo_presente NA", "text-white" in up)
            ok("tutto ok: fotocellule C", "text-white" in fo)
            await page.click('[data-testid="pratica-collaudo-cavi-NC"]')
            cv = await page.get_attribute('[data-testid="pratica-collaudo-cavi-NC"]', "class")
            ok("single NC sets red", "bg-red-600" in cv)
            await page.click('[data-testid="pratica-collaudo-cavi-NC"]')
            cv = await page.get_attribute('[data-testid="pratica-collaudo-cavi-NC"]', "class")
            ok("NC toggle off", "bg-red-600" not in cv)
            await page.click('[data-testid="pratica-collaudo-cavi-C"]')
            await page.click('[data-testid="pratica-esito-negativo"]')
            await page.click('[data-testid="pratica-esito-positivo"]')
            await page.fill('[data-testid="pratica-note-collaudo"]', "TEST_nota collaudo")
            # norme
            si = await page.get_attribute('[data-testid="pratica-norma-1-si"]', "class")
            print("norma-1-si class:", si)
            await page.click('[data-testid="pratica-norma-3-no"]')
            await page.fill('[data-testid="pratica-norma-2-nota"]', "TEST_nota norma")
            rr = await page.input_value('[data-testid="pratica-rischi-residui"]')
            ok("rischi residui precompiled", len(rr) > 50)
            await page.fill('[data-testid="documento-input-responsabile"]', "TEST_Tecnico Verdi")
            await page.click('[data-testid="pratica-dm37-tipo-trasformazione"]')
            await page.fill('[data-testid="pratica-dm37-descrizione"]', "TEST_descrizione impianto")
            mt = await page.input_value('[data-testid="pratica-dm37-materiali"]')
            ok("dm37 materiali precompiled", "FG16OR16" in mt)
            ok("progettista hidden by default", await page.locator('[data-testid="documento-input-progettista"]').count() == 0)
            await page.click('[data-testid="pratica-dm37-allegati-progetto"]')
            await page.fill('[data-testid="documento-input-progettista"]', "TEST_Ing Neri")
            ok("progettista shown", True)
            for k in ["ce", "collaudo", "rischi", "manuale", "dm37", "registro", "targhetta"]:
                ok(f"includi {k} checked default", await page.is_checked(f'[data-testid="pratica-includi-{k}"]'))
            await page.screenshot(path="/app/test_reports/screenshots/iter40_dialog.jpeg", quality=40, type="jpeg")
            await page.click('[data-testid="pratica-save"]')
            await page.wait_for_selector("text=Pratica salvata", timeout=10000)
            ok("toast Pratica salvata", True)
            await page.wait_for_selector('[data-testid="pratica-dialog"]', state="hidden", timeout=5000)
            row = page.locator('[data-testid^="documento-row-"]').first
            rt = await row.inner_text()
            ok("row n. 1/2026 + tipo", "n. 1/2026" in rt and "Porta sezionale" in rt, rt.replace("\n", " | "))
            await page.screenshot(path="/app/test_reports/screenshots/iter40_list.jpeg", quality=40, type="jpeg")

            # reopen and verify persistence
            await row.click()
            await page.wait_for_selector('[data-testid="pratica-dialog"]')
            await page.wait_for_timeout(500)
            ok("persist cliente", await page.input_value('[data-testid="documento-input-cliente"]') == vals["cliente"])
            ok("persist matricola", await page.input_value('[data-testid="documento-input-matricola"]') == "TEST_MAT40")
            ok("persist scala", await page.input_value('[data-testid="documento-input-scala"]') == "A")
            ok("persist tipo sezionale", "text-white" in await page.get_attribute('[data-testid="pratica-tipo-sezionale"]', "class"))
            ok("persist collaudo cavi C", "text-white" in await page.get_attribute('[data-testid="pratica-collaudo-cavi-C"]', "class"))
            ok("persist collaudo uomo NA", "text-white" in await page.get_attribute('[data-testid="pratica-collaudo-uomo_presente-NA"]', "class"))
            ok("persist sic coste", await sic_on("coste"))
            ok("persist note", await page.input_value('[data-testid="pratica-note-collaudo"]') == "TEST_nota collaudo")
            ok("persist norma nota", await page.input_value('[data-testid="pratica-norma-2-nota"]') == "TEST_nota norma")
            ok("persist norma-3 no", "text-white" in (await page.get_attribute('[data-testid="pratica-norma-3-no"]', "class")) or "bg-" in (await page.get_attribute('[data-testid="pratica-norma-3-no"]', "class")))
            ok("persist dm37 responsabile", await page.input_value('[data-testid="documento-input-responsabile"]') == "TEST_Tecnico Verdi")
            ok("persist progettista", await page.input_value('[data-testid="documento-input-progettista"]') == "TEST_Ing Neri")
            ok("persist dm37 tipo", "text-white" in await page.get_attribute('[data-testid="pratica-dm37-tipo-trasformazione"]', "class"))

            # full PDF
            path, fn = await dl(page, "pratica-share-all", "all_sezionale")
            n, txt = pdfinfo(path)
            needed = ["VERBALE DI COLLAUDO", "ANALISI DEI RISCHI", "MANUALE D'USO E MANUTENZIONE", "DICHIARAZIONE DI CONFORMIT", "REGISTRO DI MANUTENZIONE", "TARGHETTA CE", "TEST_Rossi Mario", "TEST_MAT40"]
            miss = [s for s in needed if s.lower() not in txt.lower()]
            ok("full pdf pages ~12", 10 <= n <= 14, f"pages={n} file={fn}")
            ok("full pdf texts", not miss, f"missing={miss}")
            ok("sezionale manuale carrello", "carrello" in txt)
            full_n = n
            for k, exp in [("ce", 2), ("registro", 1), ("targhetta", 1), ("collaudo", None), ("rischi", None), ("manuale", None), ("dm37", None)]:
                path, fn = await dl(page, f"pratica-pdf-{k}", k)
                n, t = pdfinfo(path)
                ok(f"single pdf {k}", (exp is None and n >= 1) or n == exp, f"pages={n} file={fn}")
            # exclude manuale + targhetta
            await page.uncheck('[data-testid="pratica-includi-manuale"]')
            await page.uncheck('[data-testid="pratica-includi-targhetta"]')
            path, fn = await dl(page, "pratica-share-all", "reduced")
            n, t = pdfinfo(path)
            ok("reduced pdf shorter", n < full_n and "TARGHETTA CE" not in t and "MANUALE D'USO" not in t, f"pages={n}")
            # includi persisted after save in share
            await page.click('[data-testid="pratica-save"]')
            await page.wait_for_selector('[data-testid="pratica-dialog"]', state="hidden", timeout=5000)
            await page.locator('[data-testid^="documento-row-"]').first.click()
            await page.wait_for_selector('[data-testid="pratica-dialog"]')
            await page.wait_for_timeout(400)
            ok("includi manuale persisted unchecked", not await page.is_checked('[data-testid="pratica-includi-manuale"]'))
            await page.check('[data-testid="pratica-includi-manuale"]')
            await page.check('[data-testid="pratica-includi-targhetta"]')

            # all 5 types
            for tipo, kw in [("avvolgibile", "manovella"), ("basculante", "contrappesi"), ("scorrevole", "cremagliera"), ("battente", "ante"), ("sezionale", "carrello")]:
                await page.click(f'[data-testid="pratica-tipo-{tipo}"]')
                await page.click('[data-testid="pratica-collaudo-tutto-ok"]')
                path, fn = await dl(page, "pratica-share-all", f"all_{tipo}")
                n, t = pdfinfo(path)
                ok(f"full pdf {tipo}", n >= 10 and kw in t and "VERBALE DI COLLAUDO" in t, f"pages={n}")
                if tipo == "scorrevole":
                    ok("scorrevole binario", "binario" in t)
            await page.click('[data-testid="pratica-save"]')
            await page.wait_for_selector('[data-testid="pratica-dialog"]', state="hidden", timeout=5000)

            # 2nd pratica: responsabile remembered + numero 2
            await page.click('[data-testid="documenti-add"]')
            await page.wait_for_selector('[data-testid="pratica-dialog"]')
            ok("responsabile remembered", await page.input_value('[data-testid="documento-input-responsabile"]') == "TEST_Tecnico Verdi")
            await page.fill('[data-testid="documento-input-cliente"]', "TEST_Second")
            await page.click('[data-testid="pratica-save"]')
            await page.wait_for_selector('[data-testid="pratica-dialog"]', state="hidden", timeout=5000)
            txt_list = await page.inner_text('[data-testid="documenti-list"]')
            ok("second numero 2", "n. 2/2026" in txt_list)

            # CE & manutenzione standalone still work
            await page.click('[data-testid="documenti-tab-ce"]')
            await page.click('[data-testid="documenti-add"]')
            await page.wait_for_selector('[data-testid="documento-dialog"]')
            await page.fill('[data-testid="documento-input-cliente"]', "TEST_CE solo")
            path, fn = await dl(page, "documento-share", "ce_standalone")
            n, t = pdfinfo(path)
            ok("standalone CE pdf 2 pages", n == 2, f"pages={n}")
            await page.click('[data-testid="documento-save"]')
            await page.wait_for_selector('[data-testid="documento-dialog"]', state="hidden", timeout=5000)
            ok("standalone CE numero 1", "n. 1/2026" in await page.inner_text('[data-testid="documenti-list"]'))
            await page.click('[data-testid="documenti-tab-manutenzione"]')
            await page.click('[data-testid="documenti-add"]')
            await page.wait_for_selector('[data-testid="documento-dialog"]')
            path, fn = await dl(page, "documento-share", "man_standalone")
            n, t = pdfinfo(path)
            ok("standalone manutenzione pdf 1 page", n == 1, f"pages={n}")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(400)

            # delete pratica
            await page.click('[data-testid="documenti-tab-pratica"]')
            before = await page.locator('[data-testid^="documento-row-"]').count()
            await page.locator('[data-testid^="documento-row-"]').first.click()
            await page.wait_for_selector('[data-testid="pratica-delete"]')
            await page.click('[data-testid="pratica-delete"]')
            await page.wait_for_selector("text=Pratica eliminata", timeout=5000)
            await page.wait_for_timeout(500)
            after = await page.locator('[data-testid^="documento-row-"]').count()
            ok("delete pratica", after == before - 1, f"{before}->{after}")
            ov = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
            ok("no horizontal overflow", not ov)
        except Exception as e:
            ok("EXCEPTION", False, repr(e))
            await page.screenshot(path="/app/test_reports/screenshots/iter40_error.jpeg", quality=40, type="jpeg")
        ok("no page errors", not errs, str(errs[:3]))
        await b.close()
    # cleanup
    h = {"Authorization": "Bearer " + token}
    for d in requests.get(f"{URL}/api/documenti", headers=h).json():
        requests.delete(f"{URL}/api/documenti/{d['id']}", headers=h)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": token})
    print(f"\nTOTAL pass={len(R['pass'])} fail={len(R['fail'])}")
    for f in R["fail"]:
        print("  FAILED:", f)


asyncio.run(main())
