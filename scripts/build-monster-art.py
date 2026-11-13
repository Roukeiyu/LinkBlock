"""Package reviewed monster art using its checked-in, canvas-aligned character masks.

When a restored source changes, review and update its mask and opening head bounds
before rebuilding. The same mask drives the seal and in-game completion scoring.
"""
from pathlib import Path
import argparse
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
PORTRAITS = [(540, 0, 440), (600, 0, 370), (445, 0, 360), (420, 0, 380),
             (340, 0, 400), (440, 0, 430), (520, 0, 380), (470, 0, 400),
             (520, 0, 400), (450, 0, 440)]

def build(level):
    target = ROOT / 'public' / 'monster' / str(level)
    mask = Image.open(target / 'mask.png').convert('L')
    if mask.size != (1536, 1024):
        raise ValueError(f'Level {level}: mask has wrong canvas size')
    for kind, suffix in [('restored', ''), ('ninety', '-ninety'), ('perfect', '-perfect')]:
        image = Image.open(ROOT / 'art' / 'review' / 'monster-forms' / f'{level}{suffix}.png').convert('RGB')
        if image.size != mask.size:
            raise ValueError(f'Level {level} {kind}: artwork and mask have different canvases')
        image.save(target / f'{kind}.webp', 'WEBP', quality=90, method=5)
        if kind != 'restored':
            continue
        dark = ImageEnhance.Brightness(ImageEnhance.Color(image).enhance(.25)).enhance(.52)
        sealed = Image.composite(Image.new('RGB', image.size, (32, 32, 44)), dark, mask)
        sealed.save(target / 'sealed.webp', 'WEBP', quality=88, method=5)
        x, y, size = PORTRAITS[level - 1]
        box = (x, y, x + size, y + size)
        for name, source in [('portrait', image), ('portrait-sealed', sealed)]:
            source.crop(box).resize((320, 320), Image.Resampling.LANCZOS).save(target / f'{name}.webp', 'WEBP', quality=88)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('levels', nargs='*', type=int, choices=range(1, 11))
    args = parser.parse_args()
    for level in args.levels or range(1, 11):
        build(level)
