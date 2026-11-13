"""Render a contact sheet of keyframes to review before the full render."""
import asyncio, base64, io, sys, pathlib
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent
TIMES = [float(x) for x in sys.argv[1].split(",")] if len(sys.argv) > 1 else [0.4, 1.6, 2.6, 3.5, 4.6, 5.9, 7.6, 8.5, 9.4, 10.3, 11.6, 13.9, 15.3, 16.4, 17.2, 19.6]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        pg = await b.new_page(viewport={"width": 1920, "height": 1080})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(f"file://{ROOT/'page.html'}?render")
        await pg.evaluate("window.ready")
        tiles = []
        for t in TIMES:
            url = await pg.evaluate(f"(renderFrame({t}), document.getElementById('c').toDataURL('image/jpeg', 0.85))")
            im = Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGB")
            tiles.append((t, im.resize((640, 360))))
        cols = 4
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 640, rows * 380), "white")
        from PIL import ImageDraw
        d = ImageDraw.Draw(sheet)
        for i, (t, im) in enumerate(tiles):
            x, y = (i % cols) * 640, (i // cols) * 380
            sheet.paste(im, (x, y + 20))
            d.text((x + 6, y + 4), f"t={t:.1f}s", fill="black")
        sheet.save(ROOT / "contact.png")
        print("errors:", errs)
        await b.close()

asyncio.run(main())
