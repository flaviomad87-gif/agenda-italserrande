"""Riproduce i flussi principali su WebKit (motore di Safari/Chrome iOS) con emulazione iPhone."""
import asyncio, sys, uuid, requests
from playwright.async_api import async_playwright

ENV = dict(l.strip().split("=", 1) for l in open("/app/frontend/.env") if "=" in l)
URL = ENV["REACT_APP_BACKEND_URL"].strip('"')
KEY = ENV["REACT_APP_FIREBASE_API_KEY"].strip('"')
EMAIL = f"testuser+ios{uuid.uuid4().hex[:8]}@italserrande.test"
PW = "TestPassword123!"


def signup():
    r = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}",
                      json={"email": EMAIL, "password": PW, "returnSecureToken": True}).json()
    return r["idToken"]


def cleanup(tok):
    H = {"Authorization": "Bearer " + tok}
    for path in ["/api/clients/pending", "/api/clients/to-quote"]:
        try:
            for c in requests.get(URL + path, headers=H).json():
                requests.delete(f"{URL}/api/clients/{c['id']}", headers=H)
        except Exception:
            pass
    requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}", json={"idToken": tok})


async def main(step):
    global TOK
    tok = TOK = signup()
    async with async_playwright() as p:
        b = await (p.chromium if "chromium" in sys.argv else p.webkit).launch()
        ctx = await b.new_context(**{k: v for k, v in p.devices["iPhone 13"].items() if not ("chromium" in sys.argv and k == "default_browser_type")}, locale="it-IT", timezone_id="Europe/Rome")
        page = await ctx.new_page()
        logs = []
        page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        try:
            await page.goto(URL + "/login")
            await page.wait_for_timeout(2500)
            await page.fill("input[type=email]", EMAIL)
            await page.fill("input[type=password]", PW)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(5000)
            print("after login url:", page.url)
            await page.screenshot(path="/app/tests/ios_1_home.png")
            await step(page)
        except Exception as e:
            print("ERR", e)
            await page.screenshot(path="/app/tests/ios_err.png")
        finally:
            print("\n".join(logs[-30:]))
            await b.close()
            cleanup(tok)


async def appointment_flow(page):
    await page.click('[data-testid="add-pending-button"]')
    await page.wait_for_timeout(1200)
    await page.fill('[data-testid="client-name-input"]', "TEST_iOS Rossi")
    btn = page.locator('[data-testid="client-appointment-date-btn"]')
    await btn.scroll_into_view_if_needed()
    await btn.tap()
    await page.wait_for_timeout(1000)
    await page.screenshot(path="/app/tests/ios_2_calendar.png")
    days = page.locator('[role="gridcell"] button, button[name="day"]')
    print("calendar day buttons:", await days.count())
    target = page.locator('button[name="day"]:not([disabled])').nth(20)
    await target.tap()
    await page.wait_for_timeout(800)
    print("date label:", await btn.inner_text())
    t = page.locator('[data-testid="client-appointment-time"]')
    print("time disabled:", await t.is_disabled())
    await t.fill("15:30")
    await page.wait_for_timeout(500)
    prev = page.locator('[data-testid="client-appointment-preview"]')
    print("preview:", await prev.inner_text() if await prev.count() else None)
    await page.screenshot(path="/app/tests/ios_3_filled.png")
    await page.click('[data-testid="client-save-button"]')
    await page.wait_for_timeout(3000)
    await page.screenshot(path="/app/tests/ios_4_saved.png")
    print("dialog still open:", await page.locator('[data-testid="client-form-dialog"]').count())
    H = {"Authorization": "Bearer " + TOK}
    print("api pending:", [(c["name"], c.get("appointment_at"), c.get("date"), c.get("pending")) for c in requests.get(URL + "/api/clients/pending", headers=H).json()])
    print("api search:", requests.get(URL + "/api/clients/search?q=TEST", headers=H).text[:400])
    cards = page.locator('[data-testid^="pending-card-"]')
    print("cards:", await cards.count())
    if await cards.count():
        print("card text:", (await cards.first.inner_text())[:300])
        await cards.first.tap()
        await page.wait_for_timeout(1500)
        btn = page.locator('[data-testid="client-appointment-date-btn"]')
        print("reopen date label:", await btn.inner_text(), "| time:", await page.locator('[data-testid="client-appointment-time"]').input_value())
        await page.screenshot(path="/app/tests/ios_5_reopen.png")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(800)
    await page.tap('[data-testid="open-week-view-button"]')
    await page.wait_for_timeout(1500)
    print("week appts:", await page.locator('[data-testid^="week-appt-"]').count())
    for _ in range(3):
        if await page.locator('[data-testid^="week-appt-"]').count():
            break
        await page.tap('[data-testid="week-next"]')
        await page.wait_for_timeout(800)
    print("week appts after next:", await page.locator('[data-testid^="week-appt-"]').count())
    await page.screenshot(path="/app/tests/ios_6_week.png")
    await page.keyboard.press("Escape")
    await page.goto(URL + "/agenda")
    await page.wait_for_timeout(2500)
    await page.tap('[data-testid="agenda-date-picker-trigger"]')
    await page.wait_for_timeout(800)
    await page.screenshot(path="/app/tests/ios_7_agenda_picker.png")
    await page.locator('button[name="day"]:not([disabled])').nth(10).tap()
    await page.wait_for_timeout(1200)
    print("agenda trigger:", await page.locator('[data-testid="agenda-date-picker-trigger"]').inner_text())
    await page.tap('[data-testid="add-client-fab"]')
    await page.wait_for_timeout(1200)
    await page.fill('[data-testid="client-name-input"]', "TEST_iOS Agenda")
    await page.tap('[data-testid="client-save-button"]')
    await page.wait_for_timeout(2500)
    print("agenda cards:", await page.locator('[data-testid^="client-card-"]').count())
    await page.screenshot(path="/app/tests/ios_8_agenda.png")


if __name__ == "__main__":
    asyncio.run(main(appointment_flow))
