import asyncio, requests, sys, importlib.util
spec = importlib.util.spec_from_file_location("ic", "/app/tests/ios_check.py"); ic = importlib.util.module_from_spec(spec); spec.loader.exec_module(ic)

DESC = "Fornitura e posa in opera di nuova porta basculante motorizzata in sostituzione dell'esistente\nL'intervento comprende le seguenti lavorazioni e forniture:\nSmontaggio completo della porta basculante esistente (manto, controtelaio/guide, contrappesi ed eventuali organi di manovra).\nFornitura e posa in opera di nuova porta basculante a contrappesi Mod. ELITE (spessore lamiera 8/10).\nRealizzazione e inserimento nel manto della basculante di porta pedonale.\nFornitura, installazione e cablaggio di gruppo di motorizzazione Mod. SIMPLEX BIMOTORE.\nRegolazione meccanica dei contrappesi, taratura delle forze e dei finecorsa del motore, verifica dei dispositivi di sicurezza e collaudo finale di funzionamento."


async def step(page):
    H = {"Authorization": "Bearer " + ic.TOK}
    c = requests.post(ic.URL + "/api/clients", headers=H, json={"name": "Armando Fabbro", "address": "via Pian due Torri 43", "date": "2026-11-23", "pending": True, "to_quote": True}).json()
    await page.goto(ic.URL + "/da-preventivare"); await page.wait_for_timeout(3000)
    await page.tap(f'[data-testid="to-quote-make-quote-{c["id"]}"]'); await page.wait_for_timeout(3000)
    print("editor url:", page.url)
    print("name:", await page.input_value('[data-testid="quote-input-clientName"]'), "| addr:", await page.input_value('[data-testid="quote-input-clientAddress"]'))
    await page.fill('[data-testid="quote-item-desc-0"]', DESC)
    await page.fill('[data-testid="quote-item-amount-0"]', "3680")
    await page.tap('[data-testid="quote-save"]'); await page.wait_for_timeout(1500)
    print("total:", await page.inner_text('[data-testid="quote-total"]'))
    await page.tap('[data-testid="quote-tab-preview"]'); await page.wait_for_timeout(2500)
    await page.screenshot(path="/app/tests/q_preview.png")
    async with page.expect_download(timeout=30000) as dl:
        await page.tap('[data-testid="quote-share-pdf"]')
    d = await dl.value
    await d.save_as("/app/tests/q_out.pdf")
    print("pdf saved:", d.suggested_filename)
    await page.wait_for_timeout(1000)
    q = requests.get(ic.URL + "/api/quotes", headers=H).json()
    print("api quotes:", [(x["number"], x["status"], x["clientName"]) for x in q])
    print("client link:", requests.get(ic.URL + "/api/clients/quote-refs", headers=H).json())
    await page.goto(ic.URL + "/da-preventivare"); await page.wait_for_timeout(2500)
    await page.screenshot(path="/app/tests/q_list.png")

asyncio.run(ic.main(step))
