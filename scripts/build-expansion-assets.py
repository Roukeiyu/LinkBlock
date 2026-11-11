"""Build original vector seals/sprites and five synthesized music loops.

Restored/reward WebP illustrations are generated separately. SVGs embed their
source art so they work in canvas without external SVG resource requests.
Run from any directory with Python/numpy and ffmpeg available.
"""
from pathlib import Path
import base64
import math
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
COLORS = {6: '#55d9df', 7: '#f3b87b', 8: '#89cdff', 9: '#b8a4eb', 10: '#ff805a'}
# Authored silhouette geometry shares the exact world frame with the artwork.
MASKS = {
    6: 'M650 280 Q590 160 700 85 Q790 30 870 100 L900 220 Q1000 240 1080 360 L1150 320 Q1220 330 1205 460 L1190 520 Q1300 780 1260 1024 L140 1024 Q250 800 270 630 L350 370 Q430 250 650 280Z',
    7: 'M640 230 L680 50 L725 95 Q800 10 860 100 L925 40 L890 220 Q1040 155 1140 170 Q1080 230 1100 270 Q1250 250 1300 320 L1160 420 Q1340 420 1300 580 L1180 620 Q1170 890 1250 990 L350 1000 Q400 750 300 620 L190 590 Q300 530 240 410 Q350 270 470 330 Q380 220 390 190 Q540 140 560 250 Q500 130 550 95 Q650 100 640 230Z',
    8: 'M650 180 L680 50 Q760 5 835 65 L875 190 Q940 150 1010 240 L1150 350 Q1210 380 1170 500 Q1270 720 1530 900 L1180 940 L950 925 L840 880 L760 940 L590 955 L530 890 Q240 990 0 920 Q250 730 320 460 Q340 280 470 200 Q550 130 650 180Z',
    9: 'M620 170 Q570 70 660 30 Q770 -20 820 80 L825 205 L940 210 Q900 60 985 20 Q1110 45 1140 170 L1170 700 L1090 790 L960 810 L870 820 L825 1024 L550 1024 L520 800 Q370 800 300 735 L250 710 Q220 670 300 655 L325 570 L290 330 Q260 140 390 45 L495 0 Q510 130 500 230 L620 170Z',
    10: 'M610 200 Q560 160 585 60 L630 105 Q640 45 715 50 Q760 50 775 20 L805 90 L790 170 L830 225 Q950 220 1010 310 L1120 365 Q1190 375 1200 470 L1165 510 Q1170 750 1250 870 L1420 980 L1150 1020 L1020 970 L730 950 L590 1000 L150 1000 L110 870 Q270 790 320 620 L400 355 Q455 280 480 225 L550 170Z',
}

def svg(body, view='0 0 1536 1024', width=1536, height=1024):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{view}">{body}</svg>'

def build_art():
    for level, color in COLORS.items():
        folder = ROOT / 'public' / 'levels' / str(level)
        data = base64.b64encode((folder / 'restored.webp').read_bytes()).decode()
        art = f'<image width="1536" height="1024" href="data:image/webp;base64,{data}"/>'
        silhouette = f'<path d="{MASKS[level]}"/>'
        (folder / 'mask.svg').write_text(svg(f'<rect width="1536" height="1024" fill="black"/><g fill="white">{silhouette}</g>'))
        seal = f'<rect width="1536" height="1024" fill="#080b22" opacity=".68"/><g fill="#080b1d" stroke="{color}" stroke-width="5" stroke-opacity=".6">{silhouette}</g>'
        sigil = f'<g fill="none" stroke="{color}" opacity=".4"><circle cx="770" cy="475" r="100" stroke-width="4"/><path d="M770 375L856 525H684Z M770 575L684 425H856Z" stroke-width="3"/></g>'
        (folder / 'sealed.svg').write_text(svg(art + seal + sigil))
        (folder / 'portrait.svg').write_text(svg(art, '550 0 500 500', 320, 320))
        (folder / 'portrait-sealed.svg').write_text(svg(art + seal + sigil, '550 0 500 500', 320, 320))
        build_sprites(folder, level, color)

def build_sprites(folder, level, color):
    defs = f'<defs><radialGradient id="core"><stop stop-color="#fff3ce"/><stop offset=".45" stop-color="{color}"/><stop offset="1" stop-color="#161529"/></radialGradient></defs>'
    motifs = {
        6: '<path d="M54 22C100 7 113 69 76 94C47 114 15 84 22 56C27 33 67 26 79 48C91 70 60 89 47 68C37 51 65 44 63 61" fill="none" stroke-width="9"/>',
        7: '<path d="M20 15L48 32L80 32L108 15L97 87L64 111L31 87Z"/><path d="M38 55L54 62M90 55L74 62M58 84L70 84" stroke="#fff4cc" fill="none" stroke-width="5"/>',
        8: '<path d="M64 5L97 36L91 110H37L31 36Z"/><path d="M64 5V110M31 36L64 52L97 36M43 75H85" fill="none" stroke-width="4"/>',
        9: '<path d="M43 33Q64 10 85 33L93 85L109 100H19L35 85Z"/><circle cx="64" cy="108" r="9"/><path d="M45 49H83M42 60H86" fill="none"/>',
        10: '<path d="M15 35L45 55L64 12L83 55L113 35L99 101H29Z"/><path d="M29 82H99"/><circle cx="64" cy="73" r="11" fill="#fff3ce"/>',
    }
    for i, name in enumerate(['mist', 'thorn', 'ghost', 'spore', 'crow', 'boss']):
        shapes = [
            '<path d="M64 8Q101 42 97 74Q94 108 64 118Q22 101 28 68Q48 84 42 49Q62 57 64 8Z"/>',
            '<circle cx="64" cy="64" r="37"/><path d="M64 6V28M122 64H100M64 122V100M6 64H28" stroke-width="9"/>',
            '<path d="M64 10L103 45L92 109L64 95L36 109L25 45Z"/>',
            '<path d="M64 7L87 40L122 64L87 88L64 121L41 88L6 64L41 40Z"/>',
            '<path d="M6 32L52 52L64 23L76 52L122 32L99 83L76 73L64 113L52 73L29 83Z"/>',
            motifs[level],
        ]
        body = defs + f'<g fill="url(#core)" stroke="{color}" stroke-width="3" stroke-linejoin="round">{shapes[i]}</g>'
        if name != 'boss':
            body += f'<g transform="translate(39 39) scale(.4)" fill="#15212c" stroke="#fff1c7" stroke-width="4">{motifs[level]}</g>'
        body += '<circle cx="51" cy="59" r="3" fill="#fff7d5"/><circle cx="77" cy="59" r="3" fill="#fff7d5"/>'
        (folder / f'{name}.svg').write_text(svg(body, '0 0 128 128', 128, 128))

def build_music():
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
    build_art()
    build_music()
