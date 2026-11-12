"""Package the redrawn illustrations with matching seals and portrait frames.

The character masks and sprite atlases are image-generated alongside the art.
This script uses those exact masks for the sealed view and the game's weighted
completion map. It does not redraw or regenerate any source illustration.
Run with --music only when intentionally rebuilding the existing music loops.
"""
from pathlib import Path
import argparse
import base64
import math
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
# Square UI framing around each generated character's face, in source pixels.
PORTRAITS = {1: (545, 0, 420), 2: (600, 0, 350), 4: (460, 0, 400),
             6: (440, 0, 430), 7: (460, 0, 410), 8: (475, 0, 400),
             9: (530, 0, 400), 10: (450, 0, 440)}


def embed(path, mime):
    return f'data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}'


def svg(body, view='0 0 1536 1024', width=1536, height=1024):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{view}">{body}</svg>'


def build_art(levels=None, version='v3', mask_version=None):
    for level in levels or range(6, 11):
        x, y, size = PORTRAITS[level]
        folder = ROOT / 'public' / 'levels' / str(level) / version
        plate = embed(folder / 'restored.webp', 'image/webp')
        mask_folder = ROOT / 'public' / 'levels' / str(level) / (mask_version or version)
        mask = embed(mask_folder / 'mask.png', 'image/png')
        art = f'<image width="1536" height="1024" href="{plate}"/>'
        defs = ('<defs><mask id="character" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024" style="mask-type:luminance">'
                f'<image width="1536" height="1024" href="{mask}"/></mask>'
                '<filter id="dusk" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values=".2"/>'
                '<feComponentTransfer><feFuncR type="linear" slope=".5" intercept=".025"/>'
                '<feFuncG type="linear" slope=".46" intercept=".02"/>'
                '<feFuncB type="linear" slope=".6" intercept=".06"/></feComponentTransfer></filter>'
                '<filter id="veil" x="-10%" y="-10%" width="120%" height="120%">'
                '<feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#7345a0" flood-opacity=".72"/></filter></defs>')
        sealed = (defs + f'<g filter="url(#dusk)">{art}</g>'
                  '<g filter="url(#veil)"><rect width="1536" height="1024" fill="#20202c" mask="url(#character)"/></g>')
        target = ROOT / 'art' / 'expansion' / 'build' / version / str(level)
        target.mkdir(parents=True, exist_ok=True)
        (target / 'sealed.svg').write_text(svg(sealed))
        view = f'{x} {y} {size} {size}'
        (target / 'portrait.svg').write_text(svg(art, view, 320, 320))
        (target / 'portrait-sealed.svg').write_text(svg(sealed, view, 320, 320))


def build_music():
    import numpy as np
    # 16-bar original modal loops. Circular mixing wraps note/reverb tails so
    # the loop boundary has no abrupt cut; distinct roots, tempos and voicings.
    tracks = [(6, 'sunken-court', 72, 50, [0, 3, 7, 10, 12, 7, 5, 3]),
              (7, 'fox-shrine', 92, 57, [0, 2, 4, 7, 9, 12, 9, 7]),
              (8, 'aurora-throne', 66, 47, [0, 7, 12, 14, 15, 12, 7, 3]),
              (9, 'dusk-belfry', 84, 48, [0, 3, 7, 8, 7, 3, 2, 0]),
              (10, 'ember-crown', 104, 45, [0, 7, 3, 10, 12, 10, 7, 3])]
    rate = 22050
    out = ROOT / 'public' / 'audio'
    for level, stem, bpm, root, melody in tracks:
        beat = 60 / bpm; total = round(64 * beat * rate)
        audio = np.zeros((total, 2), dtype=np.float64)
        def note(midi, at, duration, gain, pan=0, bell=False):
            t = np.arange(round(duration * rate)) / rate
            frequency = 440 * 2 ** ((midi - 69) / 12)
            env = (1 - np.exp(-t * (45 if bell else 8))) * np.exp(-t / (duration * .32)) * np.minimum(1, (duration - t) * 20)
            voice = (np.sin(2 * np.pi * frequency * t) + .22 * np.sin(2 * np.pi * frequency * 2 * t) + .08 * np.sin(2 * np.pi * frequency * (3.01 if bell else 3) * t)) * env * gain
            for delay, wet in [(0, 1), (.19, .22), (.37, .12)]:
                indexes = (round((at + delay) * rate) + np.arange(len(t))) % total
                np.add.at(audio[:, 0], indexes, voice * wet * math.sqrt((1 - pan) / 2))
                np.add.at(audio[:, 1], indexes, voice * wet * math.sqrt((1 + pan) / 2))
        for bar in range(16):
            chord = [0, 5, 3, 7][bar % 4]
            for n in [root + chord, root + chord + 7, root + chord + 12]: note(n, bar * 4 * beat, beat * 5, .09)
            for pulse in range(4):
                step = bar * 4 + pulse
                note(root - 12 + chord, step * beat, beat * .85, .07)
                if step % 2 == 0 or level >= 9:
                    note(root + 12 + melody[(step + bar // 4) % 8], step * beat, beat * 1.8, .1, .35 * (-1) ** pulse, True)
        peak = np.max(np.abs(audio)); audio = np.tanh(audio / max(peak, .01) * .6)
        with tempfile.NamedTemporaryFile(suffix='.wav') as temp:
            with wave.open(temp.name, 'wb') as wav:
                wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes((audio * 32767).astype('<i2').tobytes())
            for ext, codec in [('ogg', 'libopus'), ('mp3', 'libmp3lame')]:
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', temp.name, '-c:a', codec, '-b:a', '96k', str(out / f'{stem}.{ext}')], check=True)
        print(stem, round(total / rate, 2), 'seconds')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--music', action='store_true', help='also rebuild existing ambient loops')
    parser.add_argument('--levels', type=int, nargs='+', choices=PORTRAITS, help='only package these chapters')
    parser.add_argument('--version', default='v3', help='source and output artwork version')
    parser.add_argument('--mask-version', help='reuse a mask from an earlier version when the silhouette is unchanged')
    args = parser.parse_args()
    build_art(args.levels, args.version, args.mask_version)
    if args.music:
        build_music()
