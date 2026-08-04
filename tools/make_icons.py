"""Generate the extension icons (16/32/48/128 px) as PNGs.

Design: a YouTube-red rounded square with a white filter funnel — the same
path used by the in-page "Filters" button, so the branding matches.
Run:  python tools/make_icons.py
"""

import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
SIZES = [16, 32, 48, 128]

YT_RED = (255, 0, 0, 255)
WHITE = (255, 255, 255, 255)

SS = 8  # supersample factor, downscaled with LANCZOS for clean edges

# Funnel path in a 24x24 box — identical to the button's SVG:
#   M3 5 h18 l-7 8 v5 l-4 2 v-7 z
FUNNEL_24 = [(3, 5), (21, 5), (14, 13), (14, 18), (10, 20), (10, 13)]
BOX = 24.0


def make(size):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background rounded square.
    margin = int(S * 0.06)
    d.rounded_rectangle(
        [margin, margin, S - margin, S - margin], radius=int(S * 0.22), fill=YT_RED
    )

    # Funnel, scaled to ~74% of the tile and centred. Kept large so the shape
    # is still legible at the 16 px toolbar size.
    scale = (S * 0.74) / BOX
    pts = [(x * scale, y * scale) for x, y in FUNNEL_24]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    dx = (S - (max(xs) + min(xs))) / 2
    dy = (S - (max(ys) + min(ys))) / 2
    d.polygon([(x + dx, y + dy) for x, y in pts], fill=WHITE)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in SIZES:
        path = os.path.join(OUT_DIR, "icon%d.png" % s)
        make(s).save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
