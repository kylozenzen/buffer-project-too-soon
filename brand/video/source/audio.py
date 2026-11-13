"""Synthesize the Too Soon? reel score (20 s) with numpy, timed to the visual beats."""
import numpy as np, wave, pathlib

SR = 48000
HOLDS = [3.5, 6.3, 10.4, 14.4, 17.3, 19.6]; HOLD = 0.5
DUR = 20.0 + len(HOLDS) * HOLD
def Rt(t):
    # story time -> real time (events after a hold slide later by the hold length)
    return t + HOLD * sum(1 for h in HOLDS if t > h)
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)  # deterministic

def t_arr(d): return np.arange(int(SR * d)) / SR
def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e
def add(sig, at, gain=1.0, pan=0.0, real=False):
    i = int((at if real else Rt(at)) * SR)
    if i >= N: return
    sig = sig[: N - i]
    l = gain * (1 - max(0, pan)); r = gain * (1 + min(0, pan))
    L[i:i + len(sig)] += sig * l; R[i:i + len(sig)] += sig * r
def note(f): return 440 * 2 ** ((f - 69) / 12)

# ---- instruments ----
def kick():
    t = t_arr(0.35); f = 50 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def clap():
    t = t_arr(0.2); n = rng.standard_normal(len(t))
    e = np.exp(-t * 28) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 40) * (t > 0.012)
    return np.convolve(n * e, np.ones(6) / 6, 'same') * 0.6
def shaker():
    t = t_arr(0.06); n = rng.standard_normal(len(t)); n = np.diff(np.concatenate([[0], n]))
    return n * np.exp(-t * 70) * 0.25
def pluck(m, d=0.35, bright=3):
    t = t_arr(d); f = note(m)
    s = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.4 * np.exp(-t * (6 + k * bright)) for k in range(1, 6))
    return s * env(len(t), 0.003, d)
def marimba(m, d=0.4):
    t = t_arr(d); f = note(m)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 30)) * np.exp(-t * 9)
def click(f=2400, d=0.03):
    t = t_arr(d); return (np.sin(2 * np.pi * f * t) + 0.5 * rng.standard_normal(len(t))) * np.exp(-t * 180)
def pop(f=660, d=0.14):
    t = t_arr(d); ff = f * (1 + 0.6 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t * 26)
def whoosh(d=0.45, up=True):
    t = t_arr(d); n = rng.standard_normal(len(t))
    shape = np.sin(np.pi * t / d) ** 2
    # crude band sweep: mix of smoothed noise at changing widths
    out = np.zeros(len(t)); k1, k2 = (40, 4) if up else (4, 40)
    for i, w in enumerate(np.linspace(k1, k2, 8)):
        seg = slice(i * len(t) // 8, (i + 1) * len(t) // 8)
        sm = np.convolve(n, np.ones(int(w)) / int(w), 'same')
        out[seg] = sm[seg]
    return out * shape * 1.6
def thud(f=70, d=0.5):
    t = t_arr(d); ff = f + 140 * np.exp(-t * 25)
    body = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t * 7)
    hit = rng.standard_normal(len(t)) * np.exp(-t * 60) * 0.5
    return body + np.convolve(hit, np.ones(8) / 8, 'same')
def ding(m, d=0.9):
    t = t_arr(d); f = note(m)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)) * np.exp(-t * 4) * env(len(t), 0.002, 2)
def chord(ms, d=2.6):
    t = t_arr(d)
    s = sum(np.sin(2 * np.pi * note(m) * t) + 0.3 * np.sin(2 * np.pi * note(m) * 2 * t) for m in ms)
    return s * np.minimum(1, t / 0.02) * np.exp(-t * 1.1)
def tick():
    t = t_arr(0.04); return np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 120)
def boing(d=0.5):
    t = t_arr(d); f = 330 + 120 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 4)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)

# ---- hook (0–3.9): quiet, just typing and the aftermath ----
text = 'Take a moment to remember #PearlHarbor with us.'
for i in range(len(text)):
    at = 0.65 + (2.35 - 0.65) * i / len(text)
    add(click(2000 + (i % 5) * 180), at, 0.28, pan=0.2 * np.sin(i))
add(pop(520), 2.6, 0.55); add(pop(440), 2.85, 0.55); add(thud(55, 0.6), 3.1, 0.7)
add(whoosh(0.45, True), 3.55, 0.5)

# ---- the line (4–6.8) ----
for i in range(3): add(pop(600 + i * 60, 0.12), 4.15 + i * 0.12, 0.45, pan=-0.3)
for i in range(5): add(pop(700 + i * 60, 0.12), 4.55 + i * 0.12, 0.45, pan=0.3)
add(whoosh(0.35, False), 5.3, 0.35)
add(whoosh(0.5, True), 6.45, 0.55)

# ---- beat (6.8 – 17.5) at 112 BPM ----
BPM = 112; beat = 60 / BPM
prog_roots = [60, 57, 53, 55]  # C Am F G
chords = {60: [60, 64, 67], 57: [57, 60, 64], 53: [53, 57, 60], 55: [55, 59, 62]}
start, stop = Rt(6.8), Rt(17.5)
b = 0
while start + b * beat < stop:
    at = start + b * beat
    bar = b // 4; root = prog_roots[bar % 4]
    duck = 0.35 if Rt(9.0) <= at < Rt(9.0) + 0.45 else 1.0  # make room for the big stamp
    add(kick(), at, 0.9 * duck, real=True)
    if b % 4 in (1, 3): add(clap(), at, 0.45 * duck, real=True)
    add(shaker(), at + beat / 2, 0.5 * duck, pan=0.4, real=True)
    add(shaker(), at, 0.3 * duck, pan=-0.4, real=True)
    add(pluck(root - 24, 0.4, 2), at, 0.55 * duck, real=True)
    if b % 2 == 0:
        for k, m in enumerate(chords[root]):
            add(marimba(m + 12, 0.35), at + k * beat / 4, 0.16 * duck, pan=(k - 1) * 0.5, real=True)
    b += 1

# ---- scene 3 (6.8–10.9) ----
add(pop(520, 0.18), 7.0, 0.5)
for k in range(7): add(tick(), 7.4 + k * 0.25, 0.25 + k * 0.04)
add(whoosh(0.4, True), 8.12, 0.55)
alert = np.concatenate([np.sin(2 * np.pi * 880 * t_arr(0.12)) * 0.5, np.zeros(int(0.05 * SR)), np.sin(2 * np.pi * 880 * t_arr(0.12)) * 0.5])
add(alert * np.exp(-np.arange(len(alert)) / SR * 3), 8.3, 0.25)
add(thud(48, 0.8), 9.0, 1.1); add(clap(), 9.0, 0.5)
add(whoosh(0.45, True), 10.6, 0.55)

# ---- scene 4/5 (11–17.5) ----
for i in range(4):
    add(pop(500 + i * 40, 0.12), 11.35 + i * 0.16, 0.35, pan=-0.4)
    add(pop(620 + i * 40, 0.12), 11.6 + i * 0.16, 0.35, pan=0.4)
    add(whoosh(0.25, False), 12.1 + i * 0.22, 0.12)
    add(thud(90 + i * 6, 0.25), 12.6 + i * 0.32, 0.45, pan=0.3)
add(pop(760, 0.16), 14.6, 0.5)
add(whoosh(0.5, False), 14.95, 0.2)
add(click(3000, 0.04), 15.7, 0.9)
for i, m in enumerate([76, 79, 83]): add(ding(m), 15.9 + (i + 1) * 0.2, 0.32, pan=(i - 1) * 0.4)
add(ding(84, 1.4), 16.7, 0.35)

# ---- end card ----
add(whoosh(0.7, True), 17.45, 0.7)
add(thud(60, 0.7), 17.95, 0.8)
add(chord([60, 64, 67, 72], 2.2), 17.95, 0.28)
add(boing(), 18.6, 0.3)
add(pop(880, 0.16), 18.75, 0.5)
add(ding(88, 1.0), 19.0, 0.2)

# ---- master ----
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 0.9)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89
fade = int(0.3 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
out = pathlib.Path(__file__).parent / 'audio.wav'
with wave.open(str(out), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
