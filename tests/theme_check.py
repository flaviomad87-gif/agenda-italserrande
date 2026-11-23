import asyncio, requests, importlib.util
spec = importlib.util.spec_from_file_location("ic", "/app/tests/ios_check.py"); ic = importlib.util.module_from_spec(spec); spec.loader.exec_module(ic)
async def step(page):
    H = {"Authorization": "Bearer " + ic.TOK}
    requests.post(ic.URL + "/api/clients", headers=H, json={"name": "TEST_Tema", "date": "2026-11-10", "pending": True, "appointment_at": "2026-11-24T09:00", "notes": "prova"})
    await page.goto(ic.URL + "/prossimi-lavori"); await page.wait_for_timeout(3000)
    print("theme:", await page.evaluate("document.documentElement.getAttribute('data-theme')"))
    await page.screenshot(path="/app/tests/theme.png")
asyncio.run(ic.main(step))
