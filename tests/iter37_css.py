import asyncio
from playwright.async_api import async_playwright

HTML = r'''<html data-theme="x"><style>
html[data-theme="x"] [class*="bg-\\[\\#4A5D23\\]"] { background-color: rgb(0, 71, 171) !important; }
html[data-theme="x"] [class*="bg-[#4A5D23]"] { color: rgb(255, 0, 0) !important; }
</style><body><button id="b" class="bg-[#4A5D23] text-white">x</button></body></html>'''


async def main():
    async with async_playwright() as p:
        b = await p.webkit.launch()
        pg = await b.new_page()
        await pg.set_content(HTML)
        print(await pg.evaluate("(() => { const s = getComputedStyle(document.getElementById('b')); return 'double-escaped rule bg=' + s.backgroundColor + ' | plain rule color=' + s.color; })()"))
        await b.close()

asyncio.run(main())
