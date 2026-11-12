"""Package the chapter-two art experiment; never change the active LEVELS.

Usage: python scripts/pack-layered-preview.py /workspace/generated_images
Requires Pillow only during asset preparation, not regular site builds.
"""
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'art/canvas/level-2-layered-preview.json').read_text())
source_dir = Path(sys.argv[1])
target = ROOT / 'public' / manifest['directory']
target.mkdir(parents=True, exist_ok=True)
size = manifest['width'], manifest['height']

background = Image.open(source_dir / manifest['background']).convert('RGB')
if background.size != size:
    raise ValueError(f'Background canvas {background.size} must equal {size}')
background.save(target / 'background.webp', quality=94, method=6)
# Compose against the shipped background bytes, so every tier has the same base.
background = Image.open(target / 'background.webp').convert('RGBA')
for tier, spec in manifest['tiers'].items():
    source = Image.open(source_dir / spec['source'])
    if source.size != size or source.mode != 'RGBA':
        raise ValueError(f'{tier}: expected {size} RGBA character source')
    alpha = source.getchannel('A').histogram()
    if alpha[0] < size[0] * size[1] * 0.2 or sum(alpha[240:]) < size[0] * size[1] * 0.1:
        raise ValueError(f'{tier}: character source has no usable transparent cutout')
    scaled = source.resize(tuple(round(v * spec['scale']) for v in size), Image.Resampling.LANCZOS)
    layer = Image.new('RGBA', size)
    layer.alpha_composite(scaled, tuple(spec['offset']))
    layer.save(target / f'character-{tier}.webp', quality=96, method=6)
    layer = Image.open(target / f'character-{tier}.webp').convert('RGBA')
    # This is derived directly from the shipped character alpha, not a second drawing.
    layer.getchannel('A').save(target / f'alpha-{tier}.png', optimize=True)
    composite = background.copy()
    composite.alpha_composite(layer)
    # Lossless export preserves the exact shared plate outside the character alpha.
    composite.convert('RGB').save(target / f'{tier}.webp', lossless=True, method=6)
    print(f'{tier}: {size[0]} × {size[1]}, actual alpha, one shared background')
