"""Prepare a downloaded Suno menu recording without changing level recordings.
Usage: python3 scripts/prepare-menu-audio.py ORIGINAL SOURCE_URL
Requires the same tools as prepare-suno-audio.py. No downloads or synthesis.
"""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'scripts/prepare-suno-audio.py'))
run, measure, seam_jump = (helpers[name] for name in ['run', 'measure', 'seam_jump'])
original, source_url = Path(sys.argv[1]), sys.argv[2]
duration = float(json.loads(run('ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(original)).stdout)['format']['duration'])
pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(original), '-f', 'f32le', '-ar', '48000', '-ac', '2', '-'])
samples = np.frombuffer(pcm, dtype='<f4').reshape(-1, 2)
# Trim only actual leading/trailing near-silence, never an interior musical rest.
non_silent = np.flatnonzero(np.max(np.abs(samples), axis=1) > 10 ** (-45/20))
if not len(non_silent):
    raise ValueError('Recording is silent')
start = max(0, int(non_silent[0]) - 480)
end = min(len(samples), int(non_silent[-1]) + 481)
samples = samples[start:end]
if not 60 < len(samples) / 48000 < 360:
    raise ValueError('Unexpected menu recording duration')
fade = 3 * 48000
phase = np.linspace(0, np.pi/2, fade, dtype=np.float32)[:, None]
overlap = samples[-fade:] * np.cos(phase) + samples[:fade] * np.sin(phase)
circular = np.concatenate([samples[fade:-fade], overlap]).astype('<f4')
loop_seconds = len(circular) / 48000
with tempfile.TemporaryDirectory() as tmp:
    loop, normalized = Path(tmp) / 'loop.wav', Path(tmp) / 'normalized.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', str(loop)], input=circular.tobytes(), check=True, capture_output=True)
    stats = measure(loop)
    loudness = ('loudnorm=I=-20:TP=-2:LRA=11:linear=true:'
                f'measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}:'
                f'measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}:'
                f'offset={stats["target_offset"]}')
    run('ffmpeg', '-v', 'error', '-i', str(loop), '-af', loudness, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le', str(normalized))
    outputs = []
    for ext, codec, bitrate in [('ogg', 'libopus', '96k'), ('mp3', 'libmp3lame', '160k')]:
        dest = ROOT / 'public/audio' / f'curious-pages-suno-v1.{ext}'
        run('ffmpeg', '-y', '-v', 'error', '-i', str(normalized), '-map_metadata', '-1', '-af',
            f'afade=t=in:d=0.01,afade=t=out:st={loop_seconds-0.01}:d=0.01', '-c:a', codec, '-b:a', bitrate, str(dest))
        measured = measure(dest)
        if abs(float(measured['input_i']) + 20) > 1 or float(measured['input_tp']) > -1:
            raise ValueError(f'Loudness check failed: {dest}')
        if seam_jump(dest) >= .01:
            raise ValueError(f'Loop boundary check failed: {dest}')
        outputs.append({'file': f'public/audio/{dest.name}', 'integrated_lufs': float(measured['input_i']),
                        'true_peak_dbtp': float(measured['input_tp']), 'endpoint_sample_jump': seam_jump(dest),
                        'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
report = {'purpose': 'main menu', 'source_url': source_url, 'source_sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
          'original_duration_seconds': duration, 'trim_start_seconds': start/48000, 'trim_end_seconds': end/48000,
          'crossfade_seconds': 3, 'endpoint_declick_seconds': .01, 'loop_duration_seconds': loop_seconds,
          'subjective_listening_verified': False, 'outputs': outputs}
(ROOT / 'public/audio/menu-suno-source.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
