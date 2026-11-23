import asyncio, requests, sys
sys.argv.append("x")
import importlib.util
spec = importlib.util.spec_from_file_location("ic", "/app/tests/ios_check.py"); ic = importlib.util.module_from_spec(spec); spec.loader.exec_module(ic)

async def step(page):
    H = {"Authorization": "Bearer " + ic.TOK}
    r = requests.post(ic.URL + "/api/clients", headers=H, json={"name": "TEST_Fatt Rossi", "address": "Via Po 5", "date": "2026-10-01", "to_invoice": True, "amount": 500})
    print("create", r.status_code)
    await page.goto(ic.URL + "/da-fatturare"); await page.wait_for_timeout(3000)
    print("header btn:", await page.locator('[data-testid="open-gestionale-button"]').get_attribute("href"))
    print("card btns:", await page.locator('[data-testid^="to-invoice-gestionale-"]').count())
    await page.screenshot(path="/app/tests/ios_fatt.png")
asyncio.run(ic.main(step))
