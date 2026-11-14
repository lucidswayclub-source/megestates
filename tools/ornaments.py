"""Draw the gold carved ornaments used by the site's carved sections.

Writes assets/ornament/: four baroque corners (tl, tr, bl, br). Every ornament is drawn three times so it reads as engraved gold
rather than flat line work: a dark shadow offset down-right, a bright
highlight offset up-left, then the foil-gold line on top.

Usage: python3 tools/ornaments.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'ornament'

GOLD = '''<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#f9e9b0"/><stop offset="0.22" stop-color="#e2c063"/>
  <stop offset="0.4" stop-color="#fff3c8"/><stop offset="0.6" stop-color="#c9992c"/>
  <stop offset="0.8" stop-color="#e8c96a"/><stop offset="1" stop-color="#a87917"/>
</linearGradient>'''


def carved(lines, fills, width=1.6):
    """Shadow, highlight and gold passes over the same line work and leaf fills."""
    def layer(stroke, fill, w, dx, dy, op):
        return (f'<g transform="translate({dx} {dy})" opacity="{op}">'
                f'<g fill="none" stroke="{stroke}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round">{lines}</g>'
                f'<g fill="{fill}" stroke="none">{fills}</g></g>')
    return (layer('#000', '#000', width + 0.6, 1.4, 1.6, 0.85)
            + layer('#fff6d8', '#fff6d8', width * 0.7, -0.7, -0.8, 0.55)
            + layer('url(#g)', 'url(#g)', width, 0, 0, 1))


# ---------- Baroque corner (drawn for the top-left, 200 x 200) ----------
# One half of the flourish runs along the top edge; it is mirrored across the
# diagonal to run down the side, so the corner is symmetric.
HALF_LINES = (
    # Double frame rule, rounded at the corner
    '<path d="M8 200 V22 Q8 8 22 8 H200"/>'
    '<path d="M16 200 V30 Q16 16 30 16 H200" stroke-width="0.9"/>'
    # Volute: a spiral scroll at the heart of the corner
    '<path d="M48 48 m-5 0 a5 5 0 1 1 5 5 a10 10 0 1 1 -10 -10 a17 17 0 1 1 17 17 a24 24 0 0 1 -24 -24"/>'
    # Tendril along the top, ending in a curl
    '<path d="M70 38 C92 28 108 44 130 34 C143 28 152 30 160 38"/>'
    '<path d="M160 38 c6 6 2 14 -5 12 c-5 -1 -5 -8 0 -8"/>'
    '<path d="M108 30 C118 22 130 22 138 26"/>'
    # Inner fleuron arc
    '<path d="M60 74 C68 66 76 64 86 66"/>'
)
HALF_FILLS = (
    # Acanthus leaves along the tendril
    '<path d="M94 38 C100 26 114 24 121 28 C113 33 104 39 94 38 Z"/>'
    '<path d="M128 35 C134 27 144 27 149 30 C143 34 136 37 128 35 Z"/>'
    # Studs along the frame
    '<circle cx="132" cy="22" r="1.9"/><circle cx="178" cy="22" r="1.6"/><circle cx="192" cy="12" r="1.2"/>'
)
CORNER_LINES = HALF_LINES + f'<g transform="matrix(0 1 1 0 0 0)">{HALF_LINES}</g>'
CORNER_FILLS = (HALF_FILLS + f'<g transform="matrix(0 1 1 0 0 0)">{HALF_FILLS}</g>'
                # Jewel at the corner and a bud at the heart
                + '<path d="M22 4 L30 12 L22 20 L14 12 Z"/>'
                + '<circle cx="48" cy="48" r="2.4"/>')

TRANSFORMS = {
    'tl': '',
    'tr': 'transform="translate(200 0) scale(-1 1)"',
    'bl': 'transform="translate(0 200) scale(1 -1)"',
    'br': 'transform="translate(200 200) scale(-1 -1)"',
}


def corner_svg(t):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">'
            f'<defs>{GOLD}</defs><g {t}>{carved(CORNER_LINES, CORNER_FILLS)}</g></svg>')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, t in TRANSFORMS.items():
        (OUT / f'corner-{name}.svg').write_text(corner_svg(t))
    print('wrote', ', '.join(sorted(p.name for p in OUT.iterdir())))
