"""Original score for the MegEstates promo, synthesised and timed to the edit.

Everything here is generated from scratch (no samples, no third-party audio),
so the music belongs to MegEstates outright. It follows the cuts in
video/index.html:

    0.0   logo reveal      shimmer pad, piano motif, bell on the gold shine (2.2)
    4.2   drone flight     deep drone building through the descent, cloud whooshes
    15.6  "You've arrived" warm major bloom with piano
    18.4  render tour      chord progression, a piano note on every scene (2 s)
    33.8  layout-plan film pulsing blueprint arpeggio, lifting at the resort (44.2)
    51.2  end card         resolving chord, bell on the logo shine (52.5), fade out

Usage (needs numpy):  python tools/score.py   -> assets/score.wav (48 kHz stereo)
"""
from pathlib import Path
import wave

import numpy as np

SR = 48000
LENGTH = 58.0
N = int(SR * LENGTH)
OUT = Path(__file__).resolve().parents[1] / 'assets' / 'score.wav'
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def span(t0, t1):
    a = max(0, int(t0 * SR))
    b = min(N, int(t1 * SR))
    return a, b, np.arange(b - a) / SR


def env_ad(n, attack, release, total):
    t = np.arange(n) / SR
    e = np.ones(n)
    e = np.minimum(e, t / max(attack, 1e-3))
    e = np.minimum(e, np.clip((total - t) / max(release, 1e-3), 0, 1))
    return np.clip(e, 0, 1) ** 1.5


def add(sig, t0, pan=0.0):
    """Mix a mono signal in at t0 with constant-power panning (-1 left .. 1 right)."""
    a = int(t0 * SR)
    if a >= N:
        return
    sig = sig[: N - a]
    th = (pan + 1) * np.pi / 4
    L[a:a + len(sig)] += sig * np.cos(th)
    R[a:a + len(sig)] += sig * np.sin(th)


# ---------- instruments ----------
def pad(notes, t0, t1, amp=0.05, attack=2.0, release=2.5, bright=6):
    """Warm detuned pad: a few soft harmonics per voice, slow shimmer."""
    n = int((t1 - t0) * SR)
    t = np.arange(n) / SR
    e = env_ad(n, attack, release, t1 - t0)
    for i, m in enumerate(notes):
        f = midi(m)
        for det, pan in ((-0.07, -0.6), (0.07, 0.6)):
            ff = f * 2 ** (det / 12)
            v = np.zeros(n)
            for h in range(1, bright + 1):
                v += np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) / h ** 1.6
            lfo = 1 + 0.18 * np.sin(2 * np.pi * (0.11 + 0.03 * i) * t + i)
            add(v * e * lfo * amp / len(notes) ** 0.5, t0, pan * (0.5 + 0.1 * i % 0.4))


def piano(m, t0, amp=0.16, length=3.5, pan=0.0):
    """Soft felt-piano tone: slightly inharmonic partials with natural decay."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = midi(m)
    v = np.zeros(n)
    for h, a in ((1, 1.0), (2, 0.42), (3, 0.2), (4, 0.11), (5, 0.06)):
        fh = f * h * (1 + 0.0004 * h * h)
        v += a * np.sin(2 * np.pi * fh * t) * np.exp(-t * (1.1 + 0.9 * h))
    attack = np.clip(t / 0.006, 0, 1)
    add(v * attack * amp, t0, pan)


def bell(m, t0, amp=0.07, length=5.0, pan=0.2):
    """Glassy bell for the gold light sweeps."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = midi(m)
    v = np.zeros(n)
    for r, a, d in ((1, 1, 0.9), (2.76, 0.5, 1.6), (5.4, 0.25, 2.6), (8.93, 0.12, 3.5)):
        v += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d)
    add(v * np.clip(t / 0.003, 0, 1) * amp, t0, pan)


def sub(m, t0, t1, amp=0.18):
    n = int((t1 - t0) * SR)
    t = np.arange(n) / SR
    e = env_ad(n, 2.5, 2.5, t1 - t0)
    v = np.sin(2 * np.pi * midi(m) * t) + 0.25 * np.sin(2 * np.pi * midi(m) * 2 * t)
    add(v * e * amp, t0)


def lowpass_noise(n, cutoffs):
    """White noise through a one-pole lowpass whose cutoff follows `cutoffs` (Hz per sample)."""
    x = rng.standard_normal(n)
    y = np.zeros(n)
    a = 1 - np.exp(-2 * np.pi * np.asarray(cutoffs) / SR)
    acc = 0.0
    for i in range(n):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y / (np.max(np.abs(y)) + 1e-9)


def whoosh(t0, length=2.2, amp=0.08, pan=0.0, rising=True):
    n = int(length * SR)
    u = np.linspace(0, 1, n)
    cut = 300 + 5200 * (u ** 2 if rising else (1 - u) ** 2)
    v = lowpass_noise(n, cut)
    shape = np.sin(np.pi * u) ** 1.5 if not rising else u ** 2.2 * np.clip((1 - u) / 0.06, 0, 1)
    add(v * shape * amp, t0, pan)


def impact(t0, amp=0.32):
    """Soft cinematic low hit: a falling sine thump with a little air."""
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    f = 58 * np.exp(-t * 2.2) + 32
    phase = 2 * np.pi * np.cumsum(f) / SR
    v = np.sin(phase) * np.exp(-t * 2.0) * np.clip(t / 0.004, 0, 1)
    air = lowpass_noise(int(0.6 * SR), np.full(int(0.6 * SR), 1800.0)) * np.exp(-np.arange(int(0.6 * SR)) / SR * 9) * 0.12
    v[: len(air)] += air
    add(v * amp, t0)


def pluck(m, t0, amp=0.05, pan=0.0):
    """Short soft synth pluck for the blueprint arpeggio."""
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    f = midi(m)
    v = np.zeros(n)
    for h in range(1, 7):
        v += np.sin(2 * np.pi * f * h * t) / h ** 1.2 * np.exp(-t * (6 + 3 * h))
    add(v * np.clip(t / 0.002, 0, 1) * amp, t0, pan)


# ---------- harmony (D minor, lifting to D major at the arrival and the end) ----------
Dm9 = [38, 45, 50, 53, 57, 64]          # D2 A2 D3 F3 A3 E4
Bbmaj7 = [34, 41, 46, 50, 57]           # Bb1 F2 Bb2 D3 A3
Fmaj9 = [41, 48, 52, 57, 67]            # F2 C3 E3 A3 G4
Cadd9 = [36, 43, 48, 55, 62]            # C2 G2 C3 G3 D4
Dmaj9 = [38, 45, 50, 54, 57, 64]        # D2 A2 D3 F#3 A3 E4

# ---------- 1. Logo reveal (0 - 4.2) ----------
pad([74, 81, 86], 0.0, 5.0, amp=0.03, attack=1.2, release=1.8, bright=3)  # high shimmer
pad(Dm9[:4], 0.6, 5.2, amp=0.05, attack=2.0, release=1.4)
piano(74, 0.35, amp=0.11, pan=-0.2)   # D5
piano(81, 1.05, amp=0.09, pan=0.2)    # A5
piano(77, 1.65, amp=0.10, pan=-0.1)   # F5
bell(86, 2.2, amp=0.06)               # D6 on the gold shine
piano(76, 2.6, amp=0.08, pan=0.25)    # E5 on "presents"
whoosh(2.1, length=2.1, amp=0.07, rising=True)

# ---------- 2. Drone flight (4.2 - 18.4) ----------
impact(4.2)
sub(26, 4.2, 17.0, amp=0.1)                     # D1 drone, carrying under the arrival
pad(Dm9, 4.2, 10.4, amp=0.045, attack=2.5)
pad(Bbmaj7, 9.6, 17.2, amp=0.045, attack=2.5, release=2.2)
for t0, p in ((6.3, -0.5), (8.9, 0.4), (11.6, -0.3), (13.4, 0.5)):  # through the cloud decks
    whoosh(t0, length=2.4, amp=0.05, pan=p, rising=False)
piano(62, 6.0, amp=0.07, pan=-0.3)
piano(65, 9.0, amp=0.07, pan=0.3)
piano(69, 12.0, amp=0.07, pan=-0.2)
whoosh(13.8, length=1.8, amp=0.07, rising=True)
# Arrival: lift to D major
impact(15.6, amp=0.22)
pad(Dmaj9, 15.2, 20.0, amp=0.11, attack=0.7, release=1.8)
pad([74, 78, 81], 15.4, 19.8, amp=0.035, attack=0.6, release=1.6, bright=3)  # high air on the bloom
sub(38, 15.6, 19.6, amp=0.12)
for i, m in enumerate((66, 69, 74, 76)):        # F#4 A4 D5 E5
    piano(m, 15.7 + i * 0.32, amp=0.13, pan=-0.3 + 0.2 * i)

# ---------- 3. Render tour (18.4 - 33.8) ----------
impact(18.4, amp=0.18)
prog = [(Bbmaj7, 18.4), (Fmaj9, 22.4), (Dm9, 26.4), (Cadd9, 30.4)]
for chord, t0 in prog:
    pad(chord, t0 - 0.3, t0 + 4.6, amp=0.075, attack=1.2, release=1.8)
    sub(chord[0] + 12, t0, t0 + 4.2, amp=0.07)
motif = [74, 72, 69, 72, 77, 76, 74, 69]       # one note per scene change
for i, m in enumerate(motif):
    t0 = 18.75 + i * 2
    piano(m, t0, amp=0.12, pan=-0.35 if i % 2 else 0.35)
    piano(m - 12 + (7 if i % 3 == 0 else 0), t0 + 0.5, amp=0.05, pan=0.0)
whoosh(32.4, length=1.4, amp=0.06, rising=True)

# ---------- 4. Layout-plan film (33.8 - 51.8) ----------
impact(33.8, amp=0.24)
sub(26, 33.8, 44.4, amp=0.11)
pad(Dm9, 33.8, 44.6, amp=0.045, attack=2.0)
arp = [62, 65, 69, 72, 69, 65]                   # D4 F4 A4 C5 ...
step = 0.3                                       # 100 bpm eighths
t = 34.2
i = 0
while t < 44.2:
    build = min(1.0, (t - 34.2) / 8)
    pluck(arp[i % len(arp)], t, amp=0.025 + 0.035 * build, pan=0.45 * np.sin(i * 0.9))
    t += step
    i += 1
# The resort rises: lift through Bb - F - C
impact(44.2, amp=0.2)
for chord, t0, t1 in ((Bbmaj7, 44.0, 47.4), (Fmaj9, 47.0, 50.2), (Cadd9, 49.8, 52.6)):
    pad(chord, t0, t1, amp=0.085, attack=0.8, release=1.6)
    sub(chord[0] + (12 if chord[0] < 36 else 0), t0 + 0.2, t1, amp=0.11)  # bass under each change
lift = [65, 69, 74, 77, 74, 69]
t = 44.2
while t < 51.4:
    pluck(lift[i % len(lift)] + (2 if t > 47.0 else 0), t, amp=0.05, pan=0.45 * np.sin(i * 0.9))
    t += step
    i += 1
whoosh(49.8, length=1.4, amp=0.06, rising=True)

# ---------- 5. End card (51.2 - 58) ----------
impact(51.2, amp=0.2)
pad(Dmaj9, 51.0, 58.0, amp=0.075, attack=1.0, release=4.2)
sub(26, 51.2, 58.0, amp=0.1)
bell(86, 52.5, amp=0.07)
for j, m in enumerate((74, 78, 81, 86)):         # D5 F#5 A5 D6
    piano(m, 51.6 + j * 0.45, amp=0.09, length=5.0, pan=-0.3 + 0.2 * j)


# ---------- reverb and master ----------
def reverb(x, seconds=3.2, mix=0.28, seed=1):
    """Convolution with a decaying, darkening noise tail (FFT)."""
    n = int(seconds * SR)
    g = np.random.default_rng(seed)
    ir = g.standard_normal(n) * np.exp(-np.arange(n) / SR * 2.4)
    # Darken the tail: smooth progressively with a running mean
    k = 24
    ir = np.convolve(ir, np.ones(k) / k, mode='same')
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + wet * mix * 1.6


L = reverb(L, seed=1)
R = reverb(R, seed=2)
# Gentle bus glue (soft clip) and final fade
st = np.stack([L, R])
st = np.tanh(st * 1.6) / 1.6
fade = np.ones(N)
fade[-int(3.5 * SR):] = np.linspace(1, 0, int(3.5 * SR)) ** 2
fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
st *= fade
peak = np.max(np.abs(st))
st = st / peak * 10 ** (-1.5 / 20)  # peak at -1.5 dBFS

OUT.parent.mkdir(exist_ok=True)
pcm = (st.T * 32767).astype(np.int16)
with wave.open(str(OUT), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'wrote {OUT} ({LENGTH:.0f} s)')
