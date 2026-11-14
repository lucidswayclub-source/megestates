"""Make the 'satellite-look' copy of the handoff render.

The flight hands over from satellite imagery to the graded aerial render. To
make that read as one camera, the render first appears as a soft copy with
satellite-like resolution and colour, then resolves into the sharp graded
render as the camera closes in (detail resolving with distance).

Usage: python tools/lut/soften.py   (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
src = ROOT / "assets" / "lucids" / "graded" / "aerial-day.webp"
out = ROOT / "assets" / "lucids" / "graded" / "aerial-day-soft.webp"

im = Image.open(src).convert("RGB")
w, h = im.size
# Satellite-like resolution: lose fine detail, keep shapes
soft = im.resize((w // 5, h // 5), Image.LANCZOS).resize((w, h), Image.BICUBIC)
soft = soft.filter(ImageFilter.GaussianBlur(1.2))
# Satellite-like tone: flatter, less saturated, a little darker and cooler
soft = ImageEnhance.Contrast(soft).enhance(0.86)
soft = ImageEnhance.Color(soft).enhance(0.78)
soft = ImageEnhance.Brightness(soft).enhance(0.9)
r, g, b = soft.split()
g = g.point(lambda v: min(255, int(v * 1.02)))
b = b.point(lambda v: min(255, int(v * 1.02)))
soft = Image.merge("RGB", (r, g, b))
soft.save(out, "WEBP", quality=72, method=6)
print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
