"""Generate the extension icons (16/32/48/128 px) as PNGs.

Design: a YouTube-red rounded square with a white play triangle and a small
clock badge in the corner, signalling "video + time/year".
Run:  python tools/make_icons.py
"""

import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
SIZES = [16, 32, 48, 128]

YT_RED = (255, 0, 0, 255)
WHITE = (255, 255, 255, 255)
DARK = (15, 15, 15, 255)

# Render large, then downscale for crisp anti-aliasing.
SS = 8  # supersample factor


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make(size):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background rounded square
    margin = int(S * 0.06)
    rounded_rect(d, [margin, margin, S - margin, S - margin], radius=int(S * 0.22), fill=YT_RED)

    # Play triangle (centred, slightly left to leave room for badge)
    cx, cy = S * 0.46, S * 0.5
    w, h = S * 0.30, S * 0.34
    triangle = [
        (cx - w / 2, cy - h / 2),
        (cx - w / 2, cy + h / 2),
        (cx + w / 2, cy),
    ]
    d.polygon(triangle, fill=WHITE)

    # Clock badge (bottom-right)
    r = S * 0.20
    bx, by = S * 0.74, S * 0.74
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=WHITE)
    d.ellipse([bx - r, by - r, bx + r, by + r], outline=DARK, width=max(1, int(S * 0.012)))
    # clock hands
    lw = max(1, int(S * 0.018))
    d.line([(bx, by), (bx, by - r * 0.55)], fill=DARK, width=lw)  # minute hand up
    d.line([(bx, by), (bx + r * 0.45, by)], fill=DARK, width=lw)  # hour hand right

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in SIZES:
        icon = make(s)
        path = os.path.join(OUT_DIR, f"icon{s}.png")
        icon.save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
