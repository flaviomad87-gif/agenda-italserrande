import asyncio, requests, importlib.util
spec = importlib.util.spec_from_file_location("ic", "/app/tests/ios_check.py"); ic = importlib.util.module_from_spec(spec); spec.loader.exec_module(ic)


async def step(page):
    H = {"Authorization": "Bearer " + ic.TOK}
    q = requests.post(ic.URL + "/api/quotes", headers=H, json={"clientName": "TEST_bar"}).json()
    await page.goto(f"{ic.URL}/preventivi/{q['id']}"); await page.wait_for_timeout(3000)
    info = await page.evaluate("""() => { const p=document.querySelector('[data-testid=quote-editor-page]'); const bar=document.querySelector('[data-testid=quote-save]').closest('.fixed'); const r=bar.getBoundingClientRect(); return {vh: innerHeight, barTop: r.top, barBottom: r.bottom, transform: getComputedStyle(p).transform, pageH: p.getBoundingClientRect().height}; }""")
    print("edit tab:", info)
    await page.click('[data-testid="quote-tab-preview"]'); await page.wait_for_timeout(2000)
    info = await page.evaluate("""() => { const bar=document.querySelector('[data-testid=quote-save]').closest('.fixed'); const r=bar.getBoundingClientRect(); return {vh: innerHeight, barTop: r.top, barBottom: r.bottom}; }""")
    print("preview tab:", info)
    requests.delete(f"{ic.URL}/api/quotes/{q['id']}", headers=H)

asyncio.run(ic.main(step))
