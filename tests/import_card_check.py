import asyncio, importlib.util
spec = importlib.util.spec_from_file_location("ic", "/app/tests/ios_check.py"); ic = importlib.util.module_from_spec(spec); spec.loader.exec_module(ic)
async def step(page):
    await page.goto(ic.URL + "/da-preventivare"); await page.wait_for_timeout(3000)
    print("card:", await page.locator('[data-testid="prev-import-card"]').count())
    await page.tap('[data-testid="prev-import-button"]'); await page.wait_for_timeout(800)
    print("connect dialog:", await page.locator('[data-testid="prev-connect-dialog"]').count())
    await page.screenshot(path="/app/tests/import_card.png")
asyncio.run(ic.main(step))
