"""Prepare approved Suno downloads. Usage: python3 scripts/prepare-suno-audio.py INPUT_DIR.
Requires NumPy and ffmpeg/ffprobe. Original MP3 files are kept outside the repository.
No downloads, synthesis, tempo correction or subjective listening is performed.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import struct
import sys
import tempfile
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
STEMS = ['autumn-ride', 'sunken-court', 'fox-shrine', 'aurora-throne', 'dusk-belfry', 'ember-crown']
CROSSFADE = 3


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def measure(path):
    log = run('ffmpeg', '-hide_banner', '-i', str(path), '-af',
              'loudnorm=I=-20:TP=-2:LRA=11:print_format=json', '-f', 'null', '-').stderr
    return json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0]


def seam_jump(path):
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path),
                                   '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'])
    first, last = struct.unpack('<ff', pcm[:8]), struct.unpack('<ff', pcm[-8:])
    jump = max(abs(a-b) for a, b in zip(first, last))
    if jump >= .01:
        raise ValueError(f'Encoded endpoint discontinuity: {path} {jump}')
    return jump


def main():
    source_dir = Path(sys.argv[1])
    sources = json.loads((source_dir / 'sources.json').read_text())
    if sorted(source['chapter'] for source in sources) != list(range(5, 11)):
        raise ValueError('Supply exactly one recording for each chapter 5–10')
    report = []
    for source in sources:
        chapter = source['chapter']
        if chapter not in range(5, 11):
            raise ValueError('Expected chapters 5–10')
        original = source_dir / f'chapter{chapter:02}-suno-original.mp3'
        stem = STEMS[chapter - 5] + '-suno-v1'
        probe = json.loads(run('ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(original)).stdout)
        duration = float(probe['format']['duration'])
        silence = run('ffmpeg', '-hide_banner', '-i', str(original), '-af',
                      'silencedetect=noise=-45dB:d=0.25', '-f', 'null', '-').stderr
        starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', silence)]
        # Only trim a terminal silent interval, never an interior musical rest.
        ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', silence)]
        end = starts[-1] if starts and ends and duration - ends[-1] < .1 else duration
        if end < 120 or end > 181:
            raise ValueError(f'Unexpected duration for chapter {chapter}: {end}')
        with tempfile.TemporaryDirectory() as tmp:
            loop, normalized = Path(tmp) / 'loop.wav', Path(tmp) / 'normalized.wav'
            # Rotate by 3s: body then tail/head overlap. The endpoint rejoins
            # the original at 3s, instead of fading to silence at every repeat.
            pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(original),
                                           '-f', 'f32le', '-ar', '48000', '-ac', '2', '-'])
            samples = np.frombuffer(pcm, dtype='<f4').reshape(-1, 2)[:round(end*48000)]
            fade = CROSSFADE * 48000
            phase = np.linspace(0, np.pi/2, fade, dtype=np.float32)[:, None]
            overlap = samples[-fade:] * np.cos(phase) + samples[:fade] * np.sin(phase)
            circular = np.concatenate([samples[fade:-fade], overlap]).astype('<f4')
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', '48000', '-ac', '2',
                            '-i', '-', '-c:a', 'pcm_f32le', str(loop)], input=circular.tobytes(),
                           check=True, capture_output=True)
            stats = measure(loop)
            loudness = ('loudnorm=I=-20:TP=-2:LRA=11:linear=true:'
                        f'measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}:'
                        f'measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}:'
                        f'offset={stats["target_offset"]}')
            run('ffmpeg', '-v', 'error', '-i', str(loop), '-af', loudness,
                '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le', str(normalized))
            outputs = []
            for ext, codec, bitrate in [('ogg', 'libopus', '96k'), ('mp3', 'libmp3lame', '160k')]:
                dest = ROOT / 'public/audio' / f'{stem}.{ext}'
                run('ffmpeg', '-y', '-v', 'error', '-i', str(normalized), '-map_metadata', '-1',
                    '-af', f'afade=t=in:d=0.01,afade=t=out:st={end-CROSSFADE-0.01}:d=0.01',
                    '-c:a', codec, '-b:a', bitrate, str(dest))
                measured = measure(dest)
                if abs(float(measured['input_i']) + 20) > 1 or float(measured['input_tp']) > -1:
                    raise ValueError(f'Loudness check failed: {dest} {measured}')
                outputs.append({'file': f'public/audio/{dest.name}',
                                'integrated_lufs': float(measured['input_i']),
                                'true_peak_dbtp': float(measured['input_tp']),
                                'endpoint_sample_jump': seam_jump(dest),
                                'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
        report.append({'chapter': chapter, 'source_url': source['url'],
                       'source_sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                       'original_duration_seconds': duration, 'trim_end_seconds': end,
                       'crossfade_seconds': CROSSFADE, 'endpoint_declick_seconds': 0.01, 'loop_duration_seconds': round(end-CROSSFADE, 6),
                       'subjective_listening_verified': False, 'outputs': outputs})
        print(f'Chapter {chapter}: {end-CROSSFADE:.2f}s, {outputs}', flush=True)
    (ROOT / 'public/audio/suno-v1-sources.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
