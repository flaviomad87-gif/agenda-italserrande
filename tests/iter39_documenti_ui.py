# Iter39: Documenti CE + Manutenzione UI flow at 390x844 (chromium, SW blocked)
import asyncio, uuid, re, requests
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].strip('"')
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
EMAIL = f"testuser+iter39{uuid.uuid4().hex[:8]}@italserrande.test"
PW = "TestPassword123!"
SS = "/app/test_reports/screenshots/i39_"
RES = []


def ok(n, c, x=""):
    RES.append((n, bool(c))); print(("PASS " if c else "FAIL ") + n, x)


def pages(path):
    data = open(path, "rb").read()
    try:
        from pypdf import PdfReader
        return len(PdfReader(path).pages)
    except Exception:
        return len(re.findall(rb"/Type\s*/Page[^s]", data))


async def main():
    tok = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                        json={"email": EMAIL, "password": PW, "returnSecureToken": True}).json()["idToken"]
    H = {"Authorization": "Bearer " + tok}
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell")
            ctx = await b.new_context(viewport={"width": 390, "height": 844},
                                      locale="it-IT", timezone_id="Europe/Rome", service_workers="block", accept_downloads=True)
            page = await ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
            await page.goto(URL + "/login"); await page.wait_for_timeout(1500)
            await page.fill("input[type=email]", EMAIL); await page.fill("input[type=password]", PW)
            await page.keyboard.press("Enter"); await page.wait_for_timeout(5000)

            await page.click("[data-testid=mobile-menu-button]"); await page.wait_for_timeout(800)
            item = page.locator("[data-testid=menu-nav-documenti]")
            ok("menu item visible", await item.is_visible(), await item.text_content())
            await page.screenshot(path=SS + "menu.jpg", quality=40)
            await item.click(); await page.wait_for_timeout(2500)
            ok("navigated /documenti", page.url.endswith("/documenti"), page.url)
            ok("empty state", await page.locator("[data-testid=documenti-empty]").is_visible())
            ok("tabs", await page.locator("[data-testid=documenti-tab-ce]").is_visible() and await page.locator("[data-testid=documenti-tab-manutenzione]").is_visible())

            # Create CE
            await page.click("[data-testid=documenti-add]"); await page.wait_for_timeout(800)
            vals = {"cliente": "TEST_Rossi Mario", "indirizzo": "Via Roma 1", "tipologia": "Serranda avvolgibile",
                    "comune": "Milano (MI)", "anno": "2025", "matricola": "PRV-123", "comando": "Motore tubolare",
                    "norma-rif": "EN 12453", "collaudo": "V-77", "targhetta": "Applicata", "uni-en": "Conforme"}
            for k, v in vals.items():
                await page.fill(f"[data-testid=documento-input-{k}]", v)
            await page.fill("[data-testid=documento-input-data]", "2026-01-15")
            for i in range(1, 9):
                await page.click(f"[data-testid=ce-norma-{i}-{'si' if i % 2 else 'no'}]")
                await page.fill(f"[data-testid=ce-norma-{i}-nota]", f"nota {i}")
            await page.screenshot(path=SS + "ce_form.jpg", quality=40)
            await page.click("[data-testid=documento-save]"); await page.wait_for_timeout(1500)
            toast = await page.locator("[data-sonner-toast]").all_text_contents()
            ok("toast Documento salvato", any("Documento salvato" in t for t in toast), str(toast))
            rows = page.locator("[data-testid^=documento-row-]")
            ok("row present", await rows.count() == 1)
            rt = await rows.first.text_content()
            ok("row n. 1/2026", "n. 1/2026" in rt, rt)
            await page.screenshot(path=SS + "ce_list.jpg", quality=40)

            # Reopen and verify
            await rows.first.click(); await page.wait_for_timeout(1000)
            allok = True
            for k, v in vals.items():
                got = await page.input_value(f"[data-testid=documento-input-{k}]")
                if got != v: allok = False; print("mismatch", k, got)
            for i in range(1, 9):
                sel = f"[data-testid=ce-norma-{i}-{'si' if i % 2 else 'no'}]"
                cls = await page.get_attribute(sel, "class")
                if "text-white" not in cls: allok = False; print("norma not selected", i)
                if await page.input_value(f"[data-testid=ce-norma-{i}-nota]") != f"nota {i}": allok = False
            ok("CE values persist on reopen", allok)
            ok("dialog shows n. 1/2026", "n. 1/2026" in await page.locator("[data-testid=documento-dialog]").text_content())
            await page.fill("[data-testid=documento-input-comune]", "Monza (MB)")
            await page.click("[data-testid=ce-norma-1-si]")  # toggle off -> null
            await page.click("[data-testid=documento-save]"); await page.wait_for_timeout(1500)
            api = [d for d in requests.get(URL + "/api/documenti?kind=ce", headers=H).json()]
            ok("edit persisted", api[0]["fields"]["comune"] == "Monza (MB)" and api[0]["fields"]["norme"][0]["applica"] is None and api[0]["numero"] == 1, str(api[0]["fields"]["norme"][0]))

            # Share CE -> download
            await rows.first.click(); await page.wait_for_timeout(800)
            async with page.expect_download(timeout=20000) as dl:
                await page.click("[data-testid=documento-share]")
            d = await dl.value
            path = SS + "ce.pdf"; await d.save_as(path)
            n = pages(path)
            ok("CE pdf downloaded 2 pages", n == 2, f"{d.suggested_filename} pages={n}")
            await page.wait_for_timeout(800)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(600)

            # Manutenzione
            await page.click("[data-testid=documenti-tab-manutenzione]"); await page.wait_for_timeout(500)
            ok("man tab empty", await page.locator("[data-testid=documenti-empty]").is_visible())
            await page.click("[data-testid=documenti-add]"); await page.wait_for_timeout(800)
            title = await page.locator("[data-testid=documento-dialog] h2").text_content()
            ok("man dialog title", "Registro di Manutenzione" in title, title)
            await page.fill("[data-testid=documento-input-cliente]", "TEST_Bianchi")
            await page.fill("[data-testid=documento-input-indirizzo]", "Via Po 2")
            await page.fill("[data-testid=documento-input-data]", "2026-01-20")
            await page.click("[data-testid=man-tipo-riparazione]")
            await page.click("[data-testid=man-tipo-manutenzione_ordinaria]")
            await page.click("[data-testid=man-tipo-manutenzione_ordinaria]")
            await page.click("[data-testid=man-tipo-manutenzione_ordinaria]")
            await page.fill("[data-testid=man-descrizione]", "Sostituita molla.\nRischi residui: nessuno.")
            await page.screenshot(path=SS + "man_form.jpg", quality=40)
            await page.click("[data-testid=documento-save]"); await page.wait_for_timeout(1500)
            rt = await page.locator("[data-testid^=documento-row-]").first.text_content()
            ok("man row n. 1/2026", "n. 1/2026" in rt, rt)
            man = requests.get(URL + "/api/documenti?kind=manutenzione", headers=H).json()
            ok("man api tipi", man and sorted(man[0]["fields"]["tipi"]) == ["manutenzione_ordinaria", "riparazione"], str(man[0]["fields"] if man else None))
            await page.locator("[data-testid^=documento-row-]").first.click(); await page.wait_for_timeout(800)
            ok("man descr persists", "Sostituita molla" in await page.input_value("[data-testid=man-descrizione]"))
            async with page.expect_download(timeout=20000) as dl:
                await page.click("[data-testid=documento-share]")
            d = await dl.value
            path = SS + "man.pdf"; await d.save_as(path)
            n = pages(path)
            ok("Man pdf 1 page", n == 1, f"{d.suggested_filename} pages={n}")
            await page.wait_for_timeout(800)

            # Delete manutenzione
            await page.click("[data-testid=documento-delete]"); await page.wait_for_timeout(1500)
            ok("deleted -> empty", await page.locator("[data-testid=documenti-empty]").is_visible())

            # Search on CE tab
            await page.click("[data-testid=documenti-tab-ce]"); await page.wait_for_timeout(400)
            await page.fill("[data-testid=documenti-search]", "rossi")
            ok("search match", await page.locator("[data-testid^=documento-row-]").count() == 1)
            await page.fill("[data-testid=documenti-search]", "PRV-123")
            ok("search matricola", await page.locator("[data-testid^=documento-row-]").count() == 1)
            await page.fill("[data-testid=documenti-search]", "zzzz")
            ok("search no match", await page.locator("[data-testid=documenti-empty]").is_visible())
            await page.fill("[data-testid=documenti-search]", "")
            await page.reload(); await page.wait_for_timeout(3000)
            ok("persists after reload", await page.locator("[data-testid^=documento-row-]").count() == 1)
            # dialog overflow check
            await page.locator("[data-testid^=documento-row-]").first.click(); await page.wait_for_timeout(800)
            ow = await page.evaluate("()=>{const d=document.querySelector('[data-testid=documento-dialog]');return [d.scrollWidth,d.clientWidth]}")
            ok("dialog no horizontal overflow", ow[0] <= ow[1] + 1, str(ow))
            await page.screenshot(path=SS + "ce_reopen.jpg", quality=40)
            ok("no page errors", not errs, str(errs[:3]))
            await b.close()
    finally:
        for d in requests.get(URL + "/api/documenti", headers=H).json():
            requests.delete(f"{URL}/api/documenti/{d['id']}", headers=H)
        requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": tok})
        print("SUMMARY", sum(r[1] for r in RES), "/", len(RES))

asyncio.run(main())
