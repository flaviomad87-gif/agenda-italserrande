import asyncio, requests, sys, importlib.util, re
spec = importlib.util.spec_from_file_location("ic", "/app/tests/ios_check.py"); ic = importlib.util.module_from_spec(spec); spec.loader.exec_module(ic)
SS = "/app/test_reports/screenshots/i37_"


def ok(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, extra)


async def step(page):
    H = {"Authorization": "Bearer " + ic.TOK}
    U = ic.URL
    theme = await page.evaluate("document.documentElement.getAttribute('data-theme')")
    ok("default theme blu", theme == "blu-italserrande", theme)
    c = requests.post(U + "/api/clients", headers=H, json={"name": "TEST_mario bianchi", "address": "via appia 5", "date": "2027-03-11", "pending": True, "to_quote": True, "amount": 0}).json()
    await page.goto(U + "/da-preventivare"); await page.wait_for_timeout(3500)
    ok("prev-app-section visible", await page.is_visible('[data-testid="prev-app-section"]'))
    await page.screenshot(path=SS + "list0.png")
    # card make quote
    await page.click(f'[data-testid="to-quote-make-quote-{c["id"]}"]'); await page.wait_for_timeout(3000)
    ok("make-quote navigates editor", "/preventivi/" in page.url, page.url)
    qid = page.url.rsplit("/", 1)[-1]
    name = await page.input_value('[data-testid="quote-input-clientName"]')
    ok("name uppercase", name == "TEST_MARIO BIANCHI", name)
    ok("addr uppercase", await page.input_value('[data-testid="quote-input-clientAddress"]') == "VIA APPIA 5")
    await page.fill('[data-testid="quote-input-clientName"]', "")
    await page.type('[data-testid="quote-input-clientName"]', "test_luigi verdi")
    ok("typing uppercase", await page.input_value('[data-testid="quote-input-clientName"]') == "TEST_LUIGI VERDI")
    await page.fill('[data-testid="quote-input-clientAddress"]', "via tuscolana 10, roma")
    await page.fill('[data-testid="quote-input-subject"]', "OFFERTA SERRANDA")
    await page.fill('[data-testid="quote-item-desc-0"]', "Fornitura serranda motorizzata")
    await page.fill('[data-testid="quote-item-amount-0"]', "1500,50")
    await page.click('[data-testid="quote-add-item"]')
    await page.fill('[data-testid="quote-item-desc-1"]', "Riga da rimuovere")
    await page.fill('[data-testid="quote-item-amount-1"]', "100")
    await page.select_option('[data-testid="quote-item-vat-1"]', "10")
    t = await page.inner_text('[data-testid="quote-total"]')
    print("total two rows:", t)
    await page.click('[data-testid="quote-item-remove-1"]')
    t = await page.inner_text('[data-testid="quote-total"]')
    ok("total after remove", "1.500,50" in t, t)
    await page.click('[data-testid="quote-status-accepted"]')
    await page.click('[data-testid="quote-save"]'); await page.wait_for_timeout(1500)
    q = requests.get(f"{U}/api/quotes/{qid}", headers=H).json()
    ok("save persisted", q["clientName"] == "TEST_LUIGI VERDI" and q["lineItems"][0]["amount"] == 1500.5 and q["status"] == "accepted" and q["subject"] == "OFFERTA SERRANDA", str((q["clientName"], q["lineItems"], q["status"])))
    ok("address upper persisted", q["clientAddress"] == "VIA TUSCOLANA 10, ROMA")
    # back to draft for share test
    await page.click('[data-testid="quote-status-draft"]'); await page.click('[data-testid="quote-save"]'); await page.wait_for_timeout(1200)
    # colors
    cols = await page.evaluate("""() => ['quote-save','quote-share-pdf','quote-tab-edit'].map(t => { const e=document.querySelector(`[data-testid="${t}"]`); return t+':'+(e?getComputedStyle(e).backgroundColor:'none'); })""")
    print("button colors:", cols)
    await page.screenshot(path=SS + "editor.png")
    # preview
    await page.click('[data-testid="quote-tab-preview"]'); await page.wait_for_timeout(2500)
    txt = await page.inner_text('[data-testid="quote-preview"]')
    for s in ["Cliente", "Preventivo N", "Data", "Descrizione", "Tot. Imponibile", "IVA ESCLUSA", "Modalità di pagamento", "TEST_LUIGI VERDI"]:
        ok("preview has " + s, s.lower() in txt.lower())
    ok("a4 page1", await page.is_visible('[data-testid="quote-a4-page-1"]'))
    await page.screenshot(path=SS + "preview.png")
    # pdf
    async with page.expect_download(timeout=40000) as dl:
        await page.click('[data-testid="quote-share-pdf"]')
    d = await dl.value
    await d.save_as("/app/test_reports/i37_quote.pdf")
    ok("pdf filename", re.match(r"Preventivo-\d+-\d{4}\.pdf", d.suggested_filename) is not None, d.suggested_filename)
    await page.wait_for_timeout(1500)
    ok("status -> sent", requests.get(f"{U}/api/quotes/{qid}", headers=H).json()["status"] == "sent")
    # back to list: card shows open-quote
    await page.goto(U + "/da-preventivare"); await page.wait_for_timeout(3000)
    btn = page.locator(f'[data-testid="to-quote-open-quote-{c["id"]}"]')
    ok("card open-quote button", await btn.count() == 1, (await btn.inner_text()) if await btn.count() else "")
    # new quote from section
    await page.click('[data-testid="quote-new-button"]'); await page.wait_for_timeout(2500)
    ok("new quote editor", "/preventivi/" in page.url)
    qid2 = page.url.rsplit("/", 1)[-1]
    await page.fill('[data-testid="quote-input-clientName"]', "test_nuovo cliente")
    await page.fill('[data-testid="quote-input-clientAddress"]', "via nuova 1")
    await page.fill('[data-testid="quote-item-amount-0"]', "800")
    await page.click('[data-testid="quote-save"]'); await page.wait_for_timeout(1200)
    await page.goto(U + "/da-preventivare"); await page.wait_for_timeout(3000)
    for f in ["open", "accepted", "all"]:
        await page.click(f'[data-testid="prev-filter-{f}"]'); await page.wait_for_timeout(300)
        print("filter", f, "rows:", await page.locator('[data-testid^="prev-quote-"]:not([data-testid*="create-job"]):not([data-testid*="linked"])').count())
    await page.fill('[data-testid="prev-search"]', "nuovo"); await page.wait_for_timeout(300)
    ok("search filters", await page.locator(f'[data-testid="prev-quote-{qid2}"]').count() == 1 and await page.locator(f'[data-testid="prev-quote-{qid}"]').count() == 0)
    await page.fill('[data-testid="prev-search"]', "")
    await page.click(f'[data-testid="prev-quote-create-job-{qid2}"]'); await page.wait_for_timeout(1500)
    dlg = page.locator('[role="dialog"]')
    ok("job dialog open", await dlg.count() > 0)
    vals = await page.evaluate("""() => Array.from(document.querySelectorAll('[role=dialog] input')).map(i => (i.getAttribute('data-testid')||i.name)+'='+i.value).filter(s=>!s.endsWith('='))""")
    print("dialog prefill:", vals)
    await page.screenshot(path=SS + "jobdialog.png")
    save = page.locator('[role="dialog"] [data-testid$="save-button"], [role="dialog"] button[type="submit"]').first
    print("save btn testid:", await save.get_attribute("data-testid"))
    await save.click(force=True); await page.wait_for_timeout(2500)
    ok("row linked after job save", await page.locator(f'[data-testid="prev-quote-linked-{qid2}"]').count() == 1)
    # job dialog job-quote-create on existing job
    c2 = requests.post(U + "/api/clients", headers=H, json={"name": "TEST_job esistente", "address": "via x", "date": "2027-03-12", "pending": True, "to_quote": True}).json()
    await page.goto(U + "/da-preventivare"); await page.wait_for_timeout(3000)
    card = page.locator(f'[data-testid="to-quote-card-{c2["id"]}"], [data-testid="client-card-{c2["id"]}"]').first
    if await card.count():
        await card.click(); await page.wait_for_timeout(1500)
    else:
        await page.get_by_text("TEST_job esistente").first.click(); await page.wait_for_timeout(1500)
    await page.screenshot(path=SS + "jobedit.png")
    jqc = page.locator('[data-testid="job-quote-create"]')
    ok("job-quote-create visible", await jqc.count() > 0)
    if await jqc.count():
        await jqc.click(force=True); await page.wait_for_timeout(3000)
        ok("job-quote-create navigates", "/preventivi/" in page.url, page.url)
        qid3 = page.url.rsplit("/", 1)[-1]
        cl = [x for x in requests.get(U + "/api/clients/quote-refs", headers=H).json() if x["id"] == c2["id"]]
        ok("job linked to quote", cl and cl[0]["quote_ref"] == qid3, str(cl))
        await page.goto(U + "/da-preventivare"); await page.wait_for_timeout(2500)
        if await card.count():
            await card.click()
        else:
            await page.get_by_text("TEST_JOB ESISTENTE").first.click() if await page.get_by_text("TEST_JOB ESISTENTE").count() else await page.get_by_text("TEST_job esistente").first.click()
        await page.wait_for_timeout(1500)
        ok("job-quote-open visible", await page.locator('[data-testid="job-quote-open"]').count() > 0)
        await page.keyboard.press("Escape")
    # delete quote via editor
    await page.goto(f"{U}/preventivi/{qid}"); await page.wait_for_timeout(2500)
    page.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
    await page.click('[data-testid="quote-delete"]'); await page.wait_for_timeout(2000)
    ok("delete navigates back", page.url.endswith("/da-preventivare"), page.url)
    ok("deleted 404", requests.get(f"{U}/api/quotes/{qid}", headers=H).status_code == 404)
    # layout overflow & bottom nav across pages
    for path in ["/", "/agenda", "/da-preventivare", f"/preventivi/{qid2}"]:
        await page.goto(U + path); await page.wait_for_timeout(2500)
        ov = await page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        act = await page.evaluate("""() => { const a=document.querySelector('nav a[aria-current=page], nav a.active'); return a? getComputedStyle(a).color + ' ' + a.textContent.trim() : 'none'; }""")
        ok(f"no overflow {path}", ov <= 0, f"ov={ov} active={act}")
        await page.screenshot(path=SS + "page_" + path.strip("/").replace("/", "_") + ".png")
    for x in requests.get(U + "/api/quotes", headers=H).json():
        requests.delete(f"{U}/api/quotes/{x['id']}", headers=H)

asyncio.run(ic.main(step))
