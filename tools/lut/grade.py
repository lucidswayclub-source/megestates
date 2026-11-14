"""MegEstates Gold: the site's cinematic colour grade, plus a realism pass.

One grade, defined once, used everywhere:
  * exported as a 33-point .cube LUT, so editors can apply the identical look
    to real drone footage in DaVinci Resolve, Premiere Pro or Final Cut;
  * applied to the venture renders, writing graded copies next to the
    originals (assets/lucids/graded/), which the site uses.

The look: a soft filmic S-curve with a slightly lifted, matte black; teal in
the shadows and warm gold in the highlights; greens pulled toward olive and
calmed so foliage stops shouting; skies and pools nudged to teal; earth tones
and warm light a touch richer.

Usage (needs numpy and Pillow):
    python tools/lut/grade.py            # writes the .cube and graded renders
    python tools/lut/grade.py --preview  # also writes before/after strips
"""
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "lucids"
OUT = SRC / "graded"
CUBE = Path(__file__).with_name("MegEstates-Gold.cube")
RENDERS = [
    "aerial-day", "aerial-dusk", "aerial-amenities", "street", "clubhouse",
    "pool-dusk", "party-garden", "box-cricket", "badminton",
]

# Per-render realism settings.
#   crop:  trim the caption burned into the bottom-right (the site shows its
#          own disclaimer on every slide). aerial-day has none, and the drone
#          handoff is calibrated to its exact framing, so it is never cropped.
#   aerial: drone shots get more aerial perspective (haze toward the horizon).
#   signs: boxes (x0, y0, x1, y1, radius) on the original 1600x900 frame where
#          generated lettering is garbled; softened so they read as distant
#          signage rather than misspelt text.
REALISM = {
    "aerial-day": {"crop": False, "aerial": True, "signs": [(1238, 698, 1306, 752, 2.6)]},
    "aerial-dusk": {"crop": True, "aerial": True, "signs": []},
    "aerial-amenities": {"crop": True, "aerial": True, "signs": []},
    "street": {"crop": True, "aerial": False, "signs": []},
    # The clubhouse sign is rebuilt and re-lettered: blurring it reads as a smudge
    "clubhouse": {"crop": True, "aerial": False, "signs": [], "relabel": {
        "text": "THE LUCIDS RESORT", "box": (158, 467, 434, 499), "source": (158, 448, 434, 467),
        "ink": (50, 44, 40), "x": 165, "width": 243, "cap_top": 472, "cap_h": 22,
    }},
    "pool-dusk": {"crop": True, "aerial": False, "signs": []},
    "party-garden": {"crop": True, "aerial": False, "signs": []},
    "box-cricket": {"crop": True, "aerial": False, "signs": []},
    "badminton": {"crop": True, "aerial": False, "signs": []},
}


# ---------- colour helpers (vectorised, values 0..1) ----------
def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rc = np.where(nz, (mx - r) / np.where(nz, d, 1), 0)
    gc = np.where(nz, (mx - g) / np.where(nz, d, 1), 0)
    bc = np.where(nz, (mx - b) / np.where(nz, d, 1), 0)
    h = np.where(r == mx, bc - gc, h)
    h = np.where(g == mx, 2.0 + rc - bc, h)
    h = np.where(b == mx, 4.0 + gc - rc, h)
    h = np.where(nz, (h / 6.0) % 1.0, 0)
    s = np.where(mx > 1e-6, d / np.where(mx > 1e-6, mx, 1), 0)
    return np.stack([h, s, mx], -1)


def hsv_to_rgb(hsv):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    i = np.floor(h * 6.0)
    f = h * 6.0 - i
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    i = i.astype(int) % 6
    conds = [i == k for k in range(6)]
    r = np.select(conds, [v, q, p, p, t, v])
    g = np.select(conds, [t, v, v, q, p, p])
    b = np.select(conds, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def band(h, centre, width):
    """Smooth 0..1 weight for hues near centre (circular)."""
    d = np.abs(((h - centre + 0.5) % 1.0) - 0.5)
    w = np.clip(1 - d / width, 0, 1)
    return w * w * (3 - 2 * w)


def luma(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


# ---------- the grade ----------
def grade(rgb):
    rgb = np.clip(rgb, 0, 1)

    # 1. Hue-selective moves
    hsv = rgb_to_hsv(rgb)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    greens = band(h, 0.30, 0.13)
    blues = band(h, 0.57, 0.10)
    earth = band(h, 0.075, 0.08)
    h = (h - 0.032 * greens - 0.022 * blues + 0.010 * earth) % 1.0  # foliage to olive, skies to teal, earth to amber
    s = s * (1 - 0.28 * greens) * (1 + 0.04 * blues) * (1 - 0.16 * earth)
    v = v * (1 - 0.06 * greens)
    rgb = hsv_to_rgb(np.stack([h, np.clip(s, 0, 1), v], -1))

    # 2. Filmic S-curve: more punch in the mids, gentle toe and shoulder
    k = 0.4
    rgb = rgb - k * np.sin(2 * np.pi * rgb) / (2 * np.pi)
    # matte black and a soft white ceiling
    rgb = 0.028 + rgb * 0.950

    # 3. Split tone: teal shadows, gold highlights, a whisper of warmth in the mids
    L = luma(rgb)[..., None]
    ws = np.clip(1 - L / 0.5, 0, 1) ** 1.5
    wh = np.clip((L - 0.45) / 0.55, 0, 1) ** 1.3
    wm = np.clip(1 - np.abs(L - 0.5) / 0.35, 0, 1)
    rgb = rgb + ws * np.array([-0.040, 0.014, 0.062])
    rgb = rgb + wh * np.array([0.046, 0.026, -0.030])
    rgb = rgb + wm * np.array([0.010, 0.003, -0.010])

    # 4. Overall saturation, then keep it in range
    L = luma(rgb)[..., None]
    rgb = L + (rgb - L) * 0.94
    return np.clip(rgb, 0, 1)


# ---------- photographic realism ----------
def blur(arr, radius):
    """Gaussian blur of a float 0..1 RGB array via Pillow."""
    im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


FUTURA = "/System/Library/Fonts/Supplemental/Futura.ttc"


def relabel(im, spec):
    """Replace garbled sign lettering with the real name.

    The concrete behind the letters is rebuilt from the clean band directly
    above them (mirrored so the texture flows), then the name is set in a
    geometric sans close to the render's, engraved with a faint lit lower
    edge, and softened to the render's own sharpness.
    """
    from PIL import ImageDraw, ImageFont

    im = im.copy()
    x0, y0, x1, y1 = spec["box"]
    sx0, sy0, sx1, sy1 = spec["source"]
    band = np.asarray(im.crop((sx0, sy0, sx1, sy1)), dtype=np.float32)
    rows = []
    flip = False
    while sum(r.shape[0] for r in rows) < (y1 - y0):
        rows.append(band[::-1] if flip else band)
        flip = not flip
    fill = np.concatenate(rows, 0)[: y1 - y0]
    patch = Image.fromarray(fill.clip(0, 255).astype(np.uint8))
    # Feathered paste so the rebuilt band has no seams
    mask = Image.new("L", patch.size, 0)
    ImageDraw.Draw(mask).rectangle((3, 2, patch.width - 4, patch.height - 3), fill=255)
    im.paste(patch, (x0, y0), mask.filter(ImageFilter.GaussianBlur(2)))

    # Fit the type to the original lettering's width and cap height
    text = spec["text"]
    size = 40
    for _ in range(40):
        font = ImageFont.truetype(FUTURA, size, index=0)  # Futura Medium
        cap = font.getbbox("H")
        if cap[3] - cap[1] <= spec["cap_h"]:
            break
        size -= 1
    widths = [font.getlength(ch) for ch in text]
    track = (spec["width"] - sum(widths)) / (len(text) - 1)
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    top = spec["cap_top"] - cap[1]
    def set_text(dx, dy, colour):
        x = spec["x"] + dx
        for ch, w in zip(text, widths):
            d.text((x, top + dy), ch, font=font, fill=colour)
            x += w + track
    set_text(0, 1, (255, 236, 205, 70))  # lit lower edge of the engraving
    set_text(0, 0, spec["ink"] + (235,))
    layer = layer.filter(ImageFilter.GaussianBlur(0.45))
    out = im.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")


def realism(im, cfg, seed=7):
    """Take the generated look off a render so it reads as a photograph.

    Generated renders give themselves away with HDR-style local contrast,
    neon cyans and greens, perfectly crisp distance, garbled lettering and a
    noise-free finish. This undoes each of those, and adds what a real camera
    records: atmosphere, a lens and a sensor.
    """
    im = im.convert("RGB")
    W, H = im.size

    # Garbled lettering on a sign big enough to read: rebuild and re-letter it
    if cfg.get("relabel"):
        im = relabel(im, cfg["relabel"])

    # Garbled lettering too small to re-letter: soften just the sign
    for x0, y0, x1, y1, r in cfg["signs"]:
        box = (x0, y0, x1, y1)
        im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(r)), box)

    # Burned-in caption: trim the bottom and keep 16:9 (about a 5% crop)
    if cfg["crop"]:
        h = H - 44
        w = round(h * W / H)
        x = (W - w) // 2
        im = im.crop((x, 0, x + w, h)).resize((W, H), Image.LANCZOS)

    arr = np.asarray(im, dtype=np.float32) / 255.0

    # Pull back the HDR look: reduce mid-scale local contrast (and its halos)
    base = blur(arr, 14)
    arr = arr - 0.32 * (arr - base)

    # Calm the neon: pool cyan and lawn green lose some saturation
    hsv = rgb_to_hsv(np.clip(arr, 0, 1))
    hh, ss, vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    cyan = band(hh, 0.5, 0.07)
    green = band(hh, 0.29, 0.1)
    ss = ss * (1 - 0.22 * cyan) * (1 - 0.14 * green)
    vv = vv * (1 - 0.05 * cyan)
    arr = hsv_to_rgb(np.stack([hh, ss, vv], -1))

    # Aerial perspective: distance lifts toward the sky colour and loses contrast
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    depth = np.clip(1 - yy / (0.5 if cfg["aerial"] else 0.42), 0, 1) ** 1.6
    strength = 0.3 if cfg["aerial"] else 0.16
    sky = arr[: max(4, H // 30)].reshape(-1, 3).mean(0)
    haze = 0.55 * sky + 0.45 * np.array([0.86, 0.84, 0.8], dtype=np.float32)
    arr = arr + (haze - arr) * depth * strength

    # Lens: lateral chromatic aberration toward the edges, soft corners, vignette
    img8 = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))
    r, g, b = img8.split()
    def zoom(ch, k):
        w2, h2 = round(W * k), round(H * k)
        z = ch.resize((w2, h2), Image.BICUBIC)
        return z.crop(((w2 - W) // 2, (h2 - H) // 2, (w2 - W) // 2 + W, (h2 - H) // 2 + H))
    img8 = Image.merge("RGB", (zoom(r, 1.0009), g, zoom(b, 0.9991)))
    arr = np.asarray(img8, dtype=np.float32) / 255.0
    xx = np.linspace(-1, 1, W, dtype=np.float32)[None, :]
    yy2 = np.linspace(-1, 1, H, dtype=np.float32)[:, None]
    rad = np.sqrt(xx ** 2 * 0.8 + yy2 ** 2 * 0.6)
    edge = np.clip((rad - 0.55) / 0.6, 0, 1)[..., None]
    arr = arr + (blur(arr, 1.1) - arr) * edge * 0.7
    arr = arr * (1 - 0.16 * edge ** 1.5)

    # Sensor: fine luminance noise, stronger in the shadows as real sensors are
    rng = np.random.default_rng(seed)
    L = luma(arr)[..., None]
    noise = rng.normal(0, 1, (H, W, 1)).astype(np.float32)
    noise = 0.6 * noise + 0.4 * blur(np.repeat(noise * 0.25 + 0.5, 3, -1), 0.6)[..., :1] * 4 - 0.4 * 2
    arr = arr + noise * (0.006 + 0.01 * (1 - L))

    return np.clip(arr, 0, 1)


# ---------- outputs ----------
def write_cube(size=33):
    axis = np.linspace(0, 1, size)
    # .cube order: red changes fastest, then green, then blue
    b, g, r = np.meshgrid(axis, axis, axis, indexing="ij")
    lattice = np.stack([r, g, b], -1).reshape(-1, 3)
    out = grade(lattice)
    lines = [
        'TITLE "MegEstates Gold"',
        "# Cinematic grade for MegEstates: teal shadows, gold highlights, olive greens, matte black.",
        "# Input and output: Rec.709 / sRGB display-referred.",
        f"LUT_3D_SIZE {size}",
        "DOMAIN_MIN 0.0 0.0 0.0",
        "DOMAIN_MAX 1.0 1.0 1.0",
    ]
    lines += [f"{x:.6f} {y:.6f} {z:.6f}" for x, y, z in out]
    CUBE.write_text("\n".join(lines) + "\n")
    print(f"wrote {CUBE.relative_to(ROOT)}")


def grade_renders(preview=False):
    OUT.mkdir(exist_ok=True)
    strips = []
    for name in RENDERS:
        src = SRC / f"{name}.webp"
        im = Image.open(src).convert("RGB")
        arr = realism(im, REALISM[name], seed=RENDERS.index(name) + 7)
        graded = (grade(arr) * 255 + 0.5).astype(np.uint8)
        out = Image.fromarray(graded)
        out.save(OUT / f"{name}.webp", "WEBP", quality=86, method=6)
        print(f"graded {name}")
        if preview:
            w, h = 800, 450
            pair = Image.new("RGB", (w * 2, h))
            pair.paste(im.resize((w, h)), (0, 0))
            pair.paste(out.resize((w, h)), (w, 0))
            strips.append(pair)
    if preview and strips:
        sheet = Image.new("RGB", (1600, 450 * len(strips)))
        for i, s in enumerate(strips):
            sheet.paste(s, (0, 450 * i))
        dest = Path(sys.argv[sys.argv.index("--preview") + 1]) if len(sys.argv) > sys.argv.index("--preview") + 1 else OUT / "_before-after.jpg"
        sheet.save(dest, "JPEG", quality=82)
        print(f"preview {dest}")


if __name__ == "__main__":
    write_cube()
    grade_renders(preview="--preview" in sys.argv)
