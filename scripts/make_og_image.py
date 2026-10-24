"""Builds static/img/og-image.png (1200x630), the social preview used for og:image.

Run: python scripts/make_og_image.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "img" / "og-image.png"
W, H = 1200, 630
BG_TOP, BG_BOTTOM = (20, 24, 32), (14, 30, 28)
TEXT, MUTED, ACCENT = (240, 242, 245), (170, 180, 192), (52, 211, 153)


def font(names, size):
    for n in names:
        for d in (Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu")):
            if (d / n).exists():
                return ImageFont.truetype(str(d / n), size)
    return ImageFont.load_default(size)


BOLD = ["segoeuib.ttf", "DejaVuSans-Bold.ttf"]
REG = ["segoeui.ttf", "DejaVuSans.ttf"]


def main():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):  # vertical gradient
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))

    logo = Image.open(ROOT / "static" / "img" / "logo-full.png").convert("RGBA")
    logo = logo.resize((560, int(560 * logo.height / logo.width)), Image.LANCZOS)
    img.paste(logo, (80, 105), logo)

    y = 105 + logo.height + 40
    d.text((84, y), "Private cash-flow & budget planner", font=font(BOLD, 52), fill=TEXT)
    y += 76
    d.text((84, y), "Spreadsheet-style entry · Analytics · Savings projections", font=font(REG, 32), fill=MUTED)
    y += 50
    d.text((84, y), "Encrypted in your browser. Free.", font=font(REG, 32), fill=ACCENT)

    d.rectangle([0, H - 10, W, H], fill=ACCENT)
    img.save(OUT, optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
