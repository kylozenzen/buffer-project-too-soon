"""Capture every frame of page.html at 60fps and mux with the audio."""
import asyncio, base64, subprocess, sys, pathlib, time
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent
FPS = 60
OUT = ROOT / 'too-soon-reel-master.mp4'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg = await b.new_page(viewport={'width': 1920, 'height': 1080})
        await pg.goto(f"file://{ROOT/'page.html'}?render")
        await pg.evaluate('window.ready')
        dur = await pg.evaluate('window.DURATION')
        frames = int(dur * FPS)
        ff = subprocess.Popen([
            'ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'png', '-i', '-',
            '-i', str(ROOT / 'audio.wav'),
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(OUT)], stdin=subprocess.PIPE)
        t0 = time.time()
        for i in range(frames):
            url = await pg.evaluate(f"(renderFrame({i / FPS}), document.getElementById('c').toDataURL('image/png'))")
            ff.stdin.write(base64.b64decode(url.split(',', 1)[1]))
            if i % 240 == 0: print(f'frame {i}/{frames} ({time.time() - t0:.0f}s)', flush=True)
        ff.stdin.close(); ff.wait()
        await b.close()
    share = ROOT / 'too-soon-reel.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(OUT), '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', str(share)], check=True)
    for f in (OUT, share): print(f.name, f'{f.stat().st_size / 1e6:.1f} MB')

asyncio.run(main())
