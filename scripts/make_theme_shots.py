"""Turn raw theme screenshots into the images shown on /themes/.

Usage:
    python scripts/make_theme_shots.py <folder> planned=1.png excel=2.png ...

Each image is scaled to 1024 px wide, cropped from the top to 1024x640 so every card
lines up, and saved as static/img/screenshots/themes/<key>.webp and .png.
Keys must match THEMES in core/seo.py. The page picks up new files automatically.
"""
import sys
from pathlib import Path

from PIL import Image

W, H = 1024, 640
OUT = Path(__file__).resolve().parent.parent / "static" / "img" / "screenshots" / "themes"


def main(src, pairs):
    OUT.mkdir(parents=True, exist_ok=True)
    for pair in pairs:
        key, name = pair.split("=", 1)
        im = Image.open(Path(src) / name).convert("RGB")
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
        if im.height < H:  # pad short images with their own bottom-edge colour
            canvas = Image.new("RGB", (W, H), im.getpixel((W // 2, im.height - 1)))
            canvas.paste(im, (0, 0))
            im = canvas
        im = im.crop((0, 0, W, H))
        im.save(OUT / f"{key}.webp", "WEBP", quality=82, method=6)
        im.save(OUT / f"{key}.png", "PNG", optimize=True)
        print(key, (OUT / f"{key}.webp").stat().st_size // 1024, "KB webp")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
