"""Rasterize hand-traced contours from the monster restored plates.

The outline and cut-outs are drawn independently from each monster image; no
human mask or human illustration is used. Refresh the contour and source hash
when a monster source changes, then review the overlay before rebuilding seals.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def build(level):
    spec = json.loads((ROOT / 'art' / 'monster-masks' / f'{level}.json').read_text())
    source = ROOT / spec['source']
    if hashlib.sha256(source.read_bytes()).hexdigest() != spec['source_sha256']:
        raise ValueError(f'Level {level}: monster image changed; review and redraw its mask')
    canvas = spec['canvas']
    image = Image.open(source)
    if image.size != (canvas[0] * 2, canvas[1] * 2):
        raise ValueError(f'Level {level}: source and contour canvases do not match')
    # Rasterize at 2x the final resolution, then antialias sub-pixel edges.
    scale = 4
    mask = Image.new('L', (canvas[0] * scale, canvas[1] * scale), 0)
    draw = ImageDraw.Draw(mask)
    for points, fill in [(spec['outline'], 255), *((hole, 0) for hole in spec['holes'])]:
        draw.polygon([(x * scale, y * scale) for x, y in points], fill=fill)
    mask = mask.resize(image.size, Image.Resampling.LANCZOS)
    target = ROOT / 'public' / 'monster' / str(level) / 'mask.png'
    mask.save(target, optimize=True)
    spec['mask_sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
    (ROOT / 'art' / 'monster-masks' / f'{level}.json').write_text(json.dumps(spec, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('levels', nargs='*', type=int, choices=range(1, 11))
    args = parser.parse_args()
    for level in args.levels or range(1, 11):
        build(level)
