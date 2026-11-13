"""Inline the @fontsource woff2 files as base64 so the page renders offline."""
import base64, pathlib, sys

ROOT = pathlib.Path(__file__).parent
FONTS = [
    ("Bricolage Grotesque", 600, "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-600-normal.woff2"),
    ("Bricolage Grotesque", 800, "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2"),
    ("Inter", 500, "@fontsource/inter/files/inter-latin-500-normal.woff2"),
    ("Inter", 600, "@fontsource/inter/files/inter-latin-600-normal.woff2"),
    ("Inter", 700, "@fontsource/inter/files/inter-latin-700-normal.woff2"),
    ("JetBrains Mono", 700, "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2"),
]

css = []
for fam, weight, rel in FONTS:
    data = base64.b64encode((ROOT / "node_modules" / rel).read_bytes()).decode()
    css.append(f"@font-face{{font-family:'{fam}';font-weight:{weight};font-style:normal;src:url(data:font/woff2;base64,{data}) format('woff2');}}")

src = (ROOT / "page.src.html").read_text()
out = ROOT / "page.html"
out.write_text(src.replace("/*FONTS*/", "\n".join(css)))
print("built", out, f"{out.stat().st_size // 1024} KB")
