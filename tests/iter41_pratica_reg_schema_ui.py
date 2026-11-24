# Iter41 UI: Pratica - Regolamento Macchine 2023/1230 switch by date, Schema impianto DM37 (7b), foto schemi, PDF checks (390x844)
import asyncio, re, time, uuid
import requests
from pypdf import PdfReader
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].rstrip("/")
KEY = ENV["REACT_APP_FIREBASE_API_KEY"]
EXE = "/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell"
EMAIL = f"testuser+iter41{int(time.time())}{uuid.uuid4().hex[:6]}@italserrande.test"
PWD = "TestPassword123!"
R = {"pass": [], "fail": []}
SHOT = "/app/test_reports/screenshots"


def ok(name, cond, extra=""):
    (R["pass"] if cond else R["fail"]).append(f"{name} {extra}")
    print(("PASS " if cond else "FAIL ") + name, extra, flush=True)


def pdfinfo(path):
    rd = PdfReader(path)
    txt = "\n".join((p.extract_text() or "") for p in rd.pages)
    return len(rd.pages), txt, rd


def norm(t):
    return re.sub(r"\s+", " ", t)


async def dl(page, testid, name):
    async with page.expect_download(timeout=60000) as d:
        await page.click(f'[data-testid="{testid}"]', force=True)
    dd = await d.value
    path = f"/tmp/iter41_{name}.pdf"
    await dd.save_as(path)
    await page.wait_for_timeout(500)
    return path


async def main():
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}", json={"email": EMAIL, "password": PWD, "returnSecureToken": True}).json()
    token = r["idToken"]
    h = {"Authorization": "Bearer " + token}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, service_workers="block", accept_downloads=True)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        sel = lambda t: f'[data-testid="{t}"]'
        iv = lambda t: page.input_value(sel(t))
        try:
            await page.goto(URL + "/login")
            await page.fill(sel("login-email-input"), EMAIL)
            await page.fill(sel("login-password-input"), PWD)
            await page.click(sel("login-submit-button"))
            await page.wait_for_selector(sel("mobile-menu-button"), timeout=20000)
            await page.goto(URL + "/documenti")
            await page.wait_for_selector(sel("documenti-pratica-hint"), timeout=15000)

            # ---- Regime note & norme & checklist
            await page.click(sel("documenti-add"))
            await page.wait_for_selector(sel("pratica-dialog"))
            await page.fill(sel("documento-input-cliente"), "TEST_Reg Cliente")
            await page.fill(sel("documento-input-matricola"), "TEST_MAT41")
            await page.fill(sel("documento-input-motore"), "Nice SPIN")
            data0 = await iv("documento-input-data")
            note = await page.inner_text(sel("regime-note"))
            ok("default date 2026", data0.startswith("2026"), data0)
            ok("regime note old", "Fino al 19/01/2027" in note and "2006/42/CE" in note, note)
            dlg = await page.inner_text(sel("pratica-dialog"))
            ok("norma3 old label", "Direttiva Macchine 2006/42/CE" in dlg)
            ok("no cyber in checklist 2026", await page.locator('[data-testid^="pratica-collaudo-cyber-"]').count() == 0)
            # Schema defaults (7b)
            fields = ["origine", "poli", "corrente", "curva", "idn", "tipo-diff", "potere", "cavo", "formazione", "lunghezza", "tensione", "posa", "percorso", "potenza", "cavo-motore", "cavo-accessori", "isolamento", "tempo-diff"]
            miss = [k for k in fields if await page.locator(sel(f"documento-input-schema-{k}")).count() != 1]
            ok("schema 18 fields present", not miss, f"missing={miss}")
            ok("schema continuita C/NC", await page.locator(sel("pratica-schema-continuita-C")).count() == 1 and await page.locator(sel("pratica-schema-continuita-NC")).count() == 1)
            ok("continuita default C", "text-white" in (await page.get_attribute(sel("pratica-schema-continuita-C"), "class")))
            dv = {k: await iv(f"documento-input-schema-{k}") for k in ["corrente", "idn", "cavo", "formazione"]}
            ok("schema defaults", dv == {"corrente": "10 A", "idn": "30 mA", "cavo": "FG16OR16", "formazione": "3G1,5 mm²"}, str(dv))
            ok("save-for-photos shown on new", await page.locator(sel("pratica-save-for-photos")).count() == 1)
            ok("photos section hidden on new", await page.locator(sel("job-photos-section")).count() == 0)

            # PDF 2026 full
            await page.click(sel("pratica-collaudo-tutto-ok"))
            path = await dl(page, "pratica-share-all", "all_2026")
            n, t, _ = pdfinfo(path)
            tn = norm(t)
            ok("2026 pdf DICHIARAZIONE CE", "DICHIARAZIONE CE DI CONFORMIT" in tn, f"pages={n}")
            ok("2026 pdf 2006/42/CE", "2006/42/CE" in tn)
            ok("2026 pdf no 2023/1230", "2023/1230" not in tn)
            ok("2026 pdf has schema", "SCHEMA DELL'IMPIANTO ELETTRICO REALIZZATO" in tn)
            ok("2026 pdf no allegato foto", "ALLEGATO - SCHEMI DI COLLEGAMENTO" not in tn)

            # switch to 2027
            await page.fill(sel("documento-input-data"), "2027-02-01")
            await page.wait_for_timeout(300)
            note = await page.inner_text(sel("regime-note"))
            ok("regime note new", "Dal 20/01/2027" in note and "Regolamento Macchine (UE) 2023/1230" in note, note)
            dlg = await page.inner_text(sel("pratica-dialog"))
            ok("norma3 new label", "Regolamento Macchine (UE) 2023/1230" in dlg and "Direttiva Macchine 2006/42/CE" not in dlg)
            ok("cyber in checklist 2027", await page.locator('[data-testid^="pratica-collaudo-cyber-"]').count() == 3)
            # boundary
            await page.fill(sel("documento-input-data"), "2027-01-19")
            await page.wait_for_timeout(200)
            ok("boundary 19/01 old", "Fino al" in await page.inner_text(sel("regime-note")) and await page.locator('[data-testid^="pratica-collaudo-cyber-"]').count() == 0)
            await page.fill(sel("documento-input-data"), "2027-01-20")
            await page.wait_for_timeout(200)
            ok("boundary 20/01 new", "Dal 20/01/2027" in await page.inner_text(sel("regime-note")) and await page.locator('[data-testid^="pratica-collaudo-cyber-"]').count() == 3)
            await page.fill(sel("documento-input-data"), "2027-02-01")
            await page.click(sel("pratica-collaudo-tutto-ok"))
            cy = await page.get_attribute(sel("pratica-collaudo-cyber-C"), "class")
            ok("tutto ok sets cyber C", "text-white" in cy)

            # Fill schema values
            vals = {"lunghezza": "17", "percorso": "TEST_dal quadro garage lungo parete sx", "potenza": "350", "isolamento": "250", "tempo-diff": "28", "corrente": "16 A"}
            for k, v in vals.items():
                await page.fill(sel(f"documento-input-schema-{k}"), v)
            await page.click(sel("pratica-schema-continuita-NC"))

            path = await dl(page, "pratica-share-all", "all_2027")
            n, t, _ = pdfinfo(path)
            tn = norm(t)
            ok("2027 pdf DICHIARAZIONE UE", "DICHIARAZIONE UE DI CONFORMIT" in tn, f"pages={n}")
            ok("2027 pdf 2023/1230", "2023/1230" in tn)
            ok("2027 pdf accessi non autorizzati", "accessi non autorizzati" in tn.lower(), f"count={tn.lower().count('accessi non autorizzati')}")
            ok("2027 pdf almeno 10 anni", "almeno 10 anni" in tn)
            ok("2027 pdf no 2006/42", "2006/42" not in tn, str([tn[max(0, m.start() - 60):m.start() + 20] for m in re.finditer("2006/42", tn)][:3]))
            ok("2027 pdf no 'Dichiarazione CE'", "dichiarazione ce di" not in tn.lower(), str([tn[max(0, m.start() - 60):m.start() + 40] for m in re.finditer("(?i)dichiarazione ce", tn)][:3]))
            # section-wise: collaudo/rischi/manuale single
            for k in ["collaudo", "rischi", "manuale"]:
                pth = await dl(page, f"pratica-pdf-{k}", f"{k}_2027")
                _, tt, _ = pdfinfo(pth)
                tt = norm(tt).lower()
                ok(f"2027 {k} exact 'accessi non autorizzati'", "accessi non autorizzati" in tt)
                hit = "accessi non autorizzati" in tt or "accesso non autorizzato" in tt or "codici di accesso" in tt
                ok(f"2027 {k} cyber text (any wording)", hit)
                if k == "manuale":
                    ok("2027 manuale almeno 10 anni", "almeno 10 anni" in tt)
            # dm37 single, no photos
            pth = await dl(page, "pratica-pdf-dm37", "dm37_nofoto")
            n_nf, tt, _ = pdfinfo(pth)
            tt = norm(tt)
            ok("dm37 schema title", "SCHEMA DELL'IMPIANTO ELETTRICO REALIZZATO" in tt, f"pages={n_nf}")
            ok("dm37 values", all(s in tt for s in ["17 m", "250 MOhm", "28 ms", "350 W", "16 A", "TEST_dal quadro garage"]), "")
            ok("dm37 continuita NC", "Non conforme" in tt)
            ok("dm37 no allegato w/o photos", "ALLEGATO - SCHEMI DI COLLEGAMENTO" not in tt)
            ok("dm37 pages ~4 no photos", 3 <= n_nf <= 5, f"pages={n_nf}")

            # After PDF share the pratica is saved -> photos block shown
            await page.wait_for_selector(sel("job-photos-section"), timeout=10000)
            ok("photos section after save (share)", True)
            sec = await page.inner_text(sel("job-photos-section"))
            ok("photos title", "Foto schemi del fabbricante".lower() in sec.lower(), sec[:120].replace("\n", " | "))
            ok("dialog still open after save-for-photos", await page.is_visible(sel("pratica-dialog")))
            ok("pratica-delete visible (has id)", await page.locator(sel("pratica-delete")).count() == 1)
            await page.set_input_files(sel("job-photos-gallery-input"), ["/tmp/schema0.jpg", "/tmp/schema1.jpg"])
            try:
                await page.wait_for_function("document.querySelectorAll('[data-testid^=\"job-photo-thumb-\"]').length >= 2", timeout=30000)
                ok("2 thumbs shown", True)
            except Exception as e:
                ok("2 thumbs shown", False, repr(e)[:200])
            await page.locator(sel("job-photos-section")).scroll_into_view_if_needed()
            await page.screenshot(path=f"{SCHEMA_SHOT}" if False else f"{SHOT}/iter41_schema_photos.jpeg", quality=40, type="jpeg")
            pth = await dl(page, "pratica-pdf-dm37", "dm37_foto")
            n_f, tt, rd = pdfinfo(pth)
            tt = norm(tt)
            ok("dm37 with photos allegato title", "ALLEGATO - SCHEMI DI COLLEGAMENTO DEL FABBRICANTE" in tt, f"pages={n_f}")
            ok("dm37 photos +2 pages", n_f == n_nf + 2, f"{n_nf}->{n_f}")
            imgs = sum(len(pg.images) for pg in rd.pages)
            ok("dm37 contains images", imgs >= 2, f"images={imgs}")
            ok("photos note in schema", "allegati in fotografia" in tt)

            # Separate check: save-for-photos button on a fresh pratica
            await page.click(sel("pratica-save"))
            await page.wait_for_selector(sel("pratica-dialog"), state="hidden", timeout=10000)
            await page.click(sel("documenti-add"))
            await page.wait_for_selector(sel("pratica-dialog"))
            await page.fill(sel("documento-input-cliente"), "TEST_Photos2")
            await page.click(sel("pratica-save-for-photos"))
            try:
                await page.wait_for_selector(sel("job-photos-section"), timeout=10000)
                ok("save-for-photos -> photos section", True)
            except Exception:
                ok("save-for-photos -> photos section", False)
            ok("dialog still open after save-for-photos", await page.is_visible(sel("pratica-dialog")))
            ok("numero shown after save-for-photos", "n. " in await page.inner_text(sel("pratica-dialog")))
            await page.set_input_files(sel("job-photos-gallery-input"), ["/tmp/schema0.jpg"])
            try:
                await page.wait_for_function("document.querySelectorAll('[data-testid^=\"job-photo-thumb-\"]').length >= 1", timeout=30000)
                ok("pratica2 thumb", True)
            except Exception as e:
                ok("pratica2 thumb", False)
            await page.click(sel("pratica-save"))
            await page.wait_for_selector(sel("pratica-dialog"), state="hidden", timeout=10000)
            rows = await page.locator('[data-testid^="documento-row-"]').count()
            ok("2 rows (no duplicate after save-for-photos)", rows == 2, f"rows={rows}")
            await page.locator('[data-testid^="documento-row-"]', has_text="TEST_Reg Cliente").first.click()
            await page.wait_for_selector(sel("pratica-dialog"))
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(400)
            # reopen persistence
            await page.locator('[data-testid^="documento-row-"]', has_text="TEST_Reg Cliente").first.click()
            await page.wait_for_selector(sel("pratica-dialog"))
            await page.wait_for_timeout(800)
            pv = {k: await iv(f"documento-input-schema-{k}") for k in vals}
            ok("schema values persisted", pv == vals, str(pv))
            ok("continuita NC persisted", "bg-[#4A5D23]" in (await page.get_attribute(sel("pratica-schema-continuita-NC"), "class")))
            ok("data persisted 2027", await iv("documento-input-data") == "2027-02-01")
            try:
                await page.wait_for_function("document.querySelectorAll('[data-testid^=\"job-photo-thumb-\"]').length >= 2", timeout=15000)
                ok("photos persisted on reopen", True)
            except Exception:
                ok("photos persisted on reopen", False)
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)

            # Old pratica without schema -> defaults
            old = {"kind": "pratica", "cliente": "TEST_Old", "indirizzo": "", "data": "2026-05-01", "fields": {"tipo_chiusura": "basculante", "sicurezze": ["fotocellule"], "collaudo": {}, "norme": [{"applica": True, "nota": ""}] * 6, "dm37": {"responsabile": "X", "tipo": "nuovo"}}}
            rr = requests.post(f"{URL}/api/documenti", json=old, headers=h)
            ok("api create old pratica", rr.status_code in (200, 201), str(rr.status_code))
            await page.reload()
            await page.wait_for_selector(sel("documenti-pratica-hint"), timeout=15000)
            await page.locator('[data-testid^="documento-row-"]', has_text="TEST_Old").first.click()
            await page.wait_for_selector(sel("pratica-dialog"))
            await page.wait_for_timeout(500)
            ok("old pratica schema defaults", await iv("documento-input-schema-cavo") == "FG16OR16" and await iv("documento-input-schema-idn") == "30 mA")
            pth = await dl(page, "pratica-pdf-dm37", "dm37_old")
            n, tt, _ = pdfinfo(pth)
            ok("old pratica dm37 pdf", "SCHEMA DELL'IMPIANTO" in norm(tt), f"pages={n}")
            # regression: all tipi full pdf
            for tipo in ["avvolgibile", "basculante", "scorrevole", "battente", "sezionale"]:
                await page.click(sel(f"pratica-tipo-{tipo}"))
                await page.click(sel("pratica-collaudo-tutto-ok"))
                pth = await dl(page, "pratica-share-all", f"all_{tipo}")
                n, tt, _ = pdfinfo(pth)
                ok(f"full pdf {tipo}", n >= 12 and "VERBALE DI COLLAUDO" in tt and "SCHEMA DELL'IMPIANTO" in norm(tt), f"pages={n}")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)

            # Solo CE
            await page.click(sel("documenti-tab-ce"))
            await page.click(sel("documenti-add"))
            await page.wait_for_selector(sel("documento-dialog"))
            await page.fill(sel("documento-input-cliente"), "TEST_CE41")
            pth = await dl(page, "documento-share", "ce_2026")
            n, tt, _ = pdfinfo(pth)
            tt = norm(tt)
            ok("CE 2026 pdf", n == 2 and "DICHIARAZIONE CE DI CONFORMIT" in tt and "2006/42/CE" in tt and "2023/1230" not in tt, f"pages={n}")
            await page.fill(sel("documento-input-data"), "2027-02-01")
            await page.wait_for_timeout(300)
            dt = await page.inner_text(sel("documento-dialog"))
            ok("CE form norma3 new", "2023/1230" in dt, "")
            pth = await dl(page, "documento-share", "ce_2027")
            n, tt, _ = pdfinfo(pth)
            tt = norm(tt)
            ok("CE 2027 pdf", n == 2 and "DICHIARAZIONE UE DI CONFORMIT" in tt and "2023/1230" in tt, f"pages={n}")
            ok("CE 2027 pdf no 2006/42", "2006/42" not in tt, str([tt[max(0, m.start() - 60):m.start() + 20] for m in re.finditer("2006/42", tt)][:3]))
            await page.screenshot(path=f"{SHOT}/iter41_ce_2027.jpeg", quality=40, type="jpeg")
            await page.click(sel("documento-save"))
            await page.wait_for_selector(sel("documento-dialog"), state="hidden", timeout=10000)
            # Registro
            await page.click(sel("documenti-tab-manutenzione"))
            await page.click(sel("documenti-add"))
            await page.wait_for_selector(sel("documento-dialog"))
            pth = await dl(page, "documento-share", "reg")
            n, tt, _ = pdfinfo(pth)
            ok("registro pdf 1 page", n == 1, f"pages={n}")
            await page.keyboard.press("Escape")
            ov = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
            ok("no horizontal overflow", not ov)
        except Exception as e:
            ok("EXCEPTION", False, repr(e)[:400])
            await page.screenshot(path=f"{SHOT}/iter41_error.jpeg", quality=40, type="jpeg")
        ok("no page errors", not errs, str(errs[:3]))
        await b.close()
    # cleanup: only this ephemeral user's data
    for d in requests.get(f"{URL}/api/documenti", headers=h).json():
        if d.get("kind") == "pratica":
            requests.delete(f"{URL}/api/clients/pratica-{d['id']}/photos", headers=h)
        requests.delete(f"{URL}/api/documenti/{d['id']}", headers=h)
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": token})
    print(f"\nTOTAL pass={len(R['pass'])} fail={len(R['fail'])}")
    for f in R["fail"]:
        print("  FAILED:", f)


asyncio.run(main())
