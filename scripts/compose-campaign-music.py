#!/usr/bin/env python3
"""Compose the level 11–20 loops and encode them like the existing campaign tracks.

Background music in the game is a looping audio file, not a Web Audio synth.
Levels 5–10 are Suno recordings prepared by scripts/prepare-suno-audio.py:
trim nothing musical, overlap 3 seconds with an equal-power crossfade, rotate
the join away from the file edge, then two-pass loudness to -20 LUFS / -2 dBTP,
48 kHz stereo Opus at 96 kbps and MP3 at 160 kbps, with a 10 ms endpoint
de-click. This script renders the remaining composed theme pieces and applies that same
delivery chain. silk-tower, wisteria-boat, golden-arena, and jade-forest are
owner Suno recordings and are left in place. There is still one loop per level
and no boss-phase variant.
"""
import hashlib
import json
import struct
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
CROSSFADE = 3.0
OUT = ROOT / 'public' / 'audio'

# Musical material is original. Intensity rises by tempo, percussion and layers.
# Loudness is then matched to the rest of the campaign, so later levels are
# denser rather than simply louder.


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def measure(path):
    log = run('ffmpeg', '-hide_banner', '-i', str(path), '-af',
              'loudnorm=I=-20:TP=-2:LRA=11:print_format=json', '-f', 'null', '-').stderr.decode()
    return json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0]


def seam_jump(path):
    pcm = run('ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', '48000', '-').stdout
    first, last = struct.unpack('<ff', pcm[:8]), struct.unpack('<ff', pcm[-8:])
    return max(abs(a - b) for a, b in zip(first, last))


def pitch(root, scale, step):
    degree, octv = step % len(scale), step // len(scale)
    return root + scale[degree] + 12 * octv


def freq(midi):
    return 440 * 2 ** ((midi - 69) / 12)


class Score:
    def __init__(self, bpm, meter, bars):
        self.bpm = bpm
        self.meter = meter
        self.bars = bars
        self.events = []
        self.dur = bars * meter * 60 / bpm

    def add(self, bar, beat, beats, midi, vel, kind, pan=0.5):
        start = (bar * self.meter + beat) * 60 / self.bpm
        if start >= self.dur - 0.02 or vel <= 0:
            return
        dur = min(beats * 60 / self.bpm, self.dur - start)
        self.events.append((start, max(0.03, dur), int(midi), float(vel), kind, float(pan)))


def env_shape(kind, t, dur):
    if kind in ('kick', 'snare', 'hat', 'tick', 'tom', 'thunder'):
        return np.exp(-t / {'kick': 0.18, 'snare': 0.12, 'hat': 0.035, 'tick': 0.02, 'tom': 0.22, 'thunder': 0.55}[kind])
    attack = {'pad': 0.45, 'organ': 0.06, 'brass': 0.09, 'flute': 0.07, 'bell': 0.005, 'pluck': 0.004, 'bass': 0.02}[kind]
    release = {'pad': 0.5, 'organ': 0.12, 'brass': 0.1, 'flute': 0.08, 'bell': 0.4, 'pluck': 0.05, 'bass': 0.08}[kind]
    rise = np.minimum(t / attack, 1)
    fall = np.clip((dur - t) / release, 0, 1)
    decay = {'pluck': 3.4, 'bell': 2.2, 'bass': 1.5, 'flute': 0.7, 'brass': 0.8, 'organ': 0.35, 'pad': 0.25}[kind]
    return rise * fall * np.exp(-t * decay)


def voice(kind, midi, n, rng):
    t = np.arange(n) / SR
    f = freq(midi)
    if kind == 'kick':
        sweep = 140 * np.exp(-t * 18) + 46
        sig = np.sin(2 * np.pi * np.cumsum(sweep) / SR)
    elif kind == 'tom':
        sweep = f * (1 + 1.4 * np.exp(-t * 10))
        sig = np.sin(2 * np.pi * np.cumsum(sweep) / SR)
    elif kind == 'snare':
        sig = 0.75 * rng.standard_normal(n) + 0.35 * np.sin(2 * np.pi * 188 * t)
    elif kind == 'hat':
        noise = rng.standard_normal(n)
        sig = noise - np.r_[0, noise[:-1]]
    elif kind == 'tick':
        sig = 0.65 * np.sin(2 * np.pi * 1760 * t) + 0.45 * (rng.standard_normal(n) - np.r_[0, rng.standard_normal(n)[:-1]])
    elif kind == 'thunder':
        noise = rng.standard_normal(n)
        sig = np.cumsum(noise)
        sig /= np.max(np.abs(sig)) + 1e-6
        sig *= np.sin(np.pi * np.clip(t / max(t[-1], 1e-3), 0, 1))
    elif kind == 'bell':
        sig = sum(amp * np.sin(2 * np.pi * f * ratio * t) for ratio, amp in ((1, 1), (2.0, 0.55), (2.76, 0.32), (5.4, 0.16), (8.93, 0.08)))
    elif kind == 'organ':
        sig = sum(amp * np.sin(2 * np.pi * f * k * t) for k, amp in ((1, 0.7), (2, 0.45), (3, 0.28), (4, 0.16), (6, 0.1), (8, 0.05)))
    elif kind == 'brass':
        sig = sum((1 / k) * np.sin(2 * np.pi * f * k * t) for k in range(1, 8))
    elif kind == 'flute':
        sig = np.sin(2 * np.pi * f * t) + 0.16 * np.sin(2 * np.pi * f * 2 * t) + 0.03 * rng.standard_normal(n)
    elif kind == 'bass':
        sig = np.sin(2 * np.pi * f * t) + 0.28 * np.sin(2 * np.pi * f * 2 * t)
    elif kind == 'pad':
        sig = sum(amp * np.sin(2 * np.pi * f * k * t * det) for k, amp, det in
                  ((1, 0.62, 1), (2, 0.22, 1.003), (3, 0.1, 0.997), (4, 0.05, 1.001)))
    else:  # pluck
        sig = sum(amp * np.sin(2 * np.pi * f * k * t) for k, amp in ((1, 1), (2, 0.42), (3, 0.2), (4, 0.1), (6, 0.04)))
    sig = np.asarray(sig, dtype=np.float64)
    sig *= env_shape(kind, t, n / SR)
    peak = np.max(np.abs(sig)) + 1e-8
    return (sig / peak).astype(np.float32)


GAINS = {
    'pad': 0.07, 'pluck': 0.11, 'flute': 0.12, 'bell': 0.07, 'organ': 0.09,
    'brass': 0.1, 'bass': 0.15, 'kick': 0.2, 'snare': 0.11, 'hat': 0.045,
    'tick': 0.055, 'tom': 0.14, 'thunder': 0.09,
}


def render(score, space):
    n = int(score.dur * SR)
    mix = np.zeros((n, 2), np.float32)
    rng = np.random.default_rng(0x11_20)
    for start, dur, midi, vel, kind, pan in score.events:
        i0 = int(start * SR)
        length = min(n - i0, int(dur * SR))
        if length < 8:
            continue
        sig = voice(kind, midi, length, rng) * (GAINS[kind] * vel)
        angle = np.clip(pan, 0, 1) * np.pi / 2
        mix[i0:i0 + length, 0] += sig * np.cos(angle)
        mix[i0:i0 + length, 1] += sig * np.sin(angle)
    wet = mix.copy()
    for delay, gain, src in ((29, 0.16, 1), (47, 0.12, 0), (73, 0.09, 1), (110, 0.06, 0)):
        shift = int(delay * SR / 1000)
        wet[shift:, 1 - src] += mix[:-shift, src] * gain * space
    mix = mix * (1 - 0.35 * space) + wet * (0.35 * space + 0.65)
    # Make the opening and the ending the same phrase so the 3 s crossfade joins identical music.
    fade = int(CROSSFADE * SR)
    splice = int(0.06 * SR)
    head = mix[:fade].copy()
    ramp = np.linspace(0, 1, splice, dtype=np.float32)[:, None]
    mix[-fade - splice:-fade] = mix[-fade - splice:-fade] * (1 - ramp) + head[:splice] * ramp
    mix[-fade:] = head
    peak = np.max(np.abs(mix)) + 1e-8
    return (mix / peak * 0.7).astype('<f4')


def encode(samples, stem):
    end = len(samples) / SR
    fade_n = int(CROSSFADE * SR)
    phase = np.linspace(0, np.pi / 2, fade_n, dtype=np.float32)[:, None]
    overlap = samples[-fade_n:] * np.cos(phase) + samples[:fade_n] * np.sin(phase)
    circular = np.concatenate([samples[fade_n:-fade_n], overlap]).astype('<f4')
    loop_dur = len(circular) / SR
    wav = OUT / f'{stem}.wav'
    run('ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
        '-c:a', 'pcm_f32le', str(wav), input=circular.tobytes())
    stats = measure(wav)
    loudness = ('loudnorm=I=-20:TP=-2:LRA=11:linear=true:'
                f'measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}:'
                f'measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}:'
                f'offset={stats["target_offset"]}')
    normal = OUT / f'{stem}.norm.wav'
    run('ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-af', loudness, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le', str(normal))
    outputs = []
    for ext, codec, bitrate in (('ogg', 'libopus', '96k'), ('mp3', 'libmp3lame', '160k')):
        dest = OUT / f'{stem}.{ext}'
        run('ffmpeg', '-y', '-v', 'error', '-i', str(normal), '-map_metadata', '-1',
            '-af', f'afade=t=in:d=0.01,afade=t=out:st={loop_dur - 0.01}:d=0.01',
            '-c:a', codec, '-b:a', bitrate, str(dest))
        measured = measure(dest)
        if abs(float(measured['input_i']) + 20) > 1 or float(measured['input_tp']) > -1:
            raise ValueError(f'Loudness check failed: {dest} {measured}')
        jump = seam_jump(dest)
        if jump >= 0.01:
            raise ValueError(f'Endpoint discontinuity: {dest} {jump}')
        outputs.append({'file': f'public/audio/{dest.name}', 'bytes': dest.stat().st_size,
                        'integrated_lufs': float(measured['input_i']), 'true_peak_dbtp': float(measured['input_tp']),
                        'endpoint_sample_jump': jump, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
    wav.unlink()
    normal.unlink()
    return {'source_seconds': round(end, 3), 'loop_seconds': round(loop_dur, 3), 'outputs': outputs}


# Scales and the ten themes. Music stems are theme names, not level numbers.
MINOR = [0, 2, 3, 5, 7, 8, 10]
HARM = [0, 2, 3, 5, 7, 8, 11]
MAJOR = [0, 2, 4, 5, 7, 9, 11]
PHRYG = [0, 1, 3, 5, 7, 8, 10]
PENTA = [0, 2, 4, 7, 9]
DORIAN = [0, 2, 3, 5, 7, 9, 10]


def triad(root, scale, degree, octave=0):
    return [pitch(root, scale, degree + off) + 12 * octave for off in (0, 2, 4)]


def pad_and_bass(score, scale, root, degrees, vel, bass_vel):
    for bar, degree in enumerate(degrees):
        low, mid, high = triad(root, scale, degree, 0)
        score.add(bar, 0, score.meter * 0.98, low - 12, bass_vel, 'bass', 0.5)
        if bass_vel > 0.45 and score.meter >= 3:
            fifth = pitch(root, scale, degree + 4) - 12
            score.add(bar, score.meter / 2, score.meter / 2, fifth, bass_vel * 0.7, 'bass', 0.5)
        for tone, pan in ((low, 0.32), (mid, 0.5), (high, 0.68)):
            score.add(bar, 0, score.meter * 0.98, tone, vel, 'pad', pan)


def motif(score, scale, root, degrees, pattern, kind, vel, pan, octave=1):
    """pattern is (beat, duration, scale step) repeated inside every bar, transposed by the chord."""
    for bar, degree in enumerate(degrees):
        for beat, dur, step in pattern:
            if beat >= score.meter:
                continue
            score.add(bar, beat, dur, pitch(root, scale, degree + step) + 12 * octave, vel, kind, pan)


def drums(score, style, vel):
    for bar in range(score.bars):
        if style == 'silk':
            if bar % 2 == 0:
                score.add(bar, 0, 0.4, 48, vel * 0.35, 'kick', 0.5)
            score.add(bar, score.meter * 0.5, 0.2, 70, vel * 0.25, 'hat', 0.72)
        elif style == 'water':
            for beat in np.arange(0, score.meter, 0.5):
                score.add(bar, float(beat), 0.2, 74, vel * (0.22 if beat % 1 else 0.4), 'hat', 0.7)
            if bar % 2 == 0:
                score.add(bar, 0, 0.5, 45, vel * 0.4, 'kick', 0.42)
        elif style == 'arena':
            score.add(bar, 0, 0.4, 42, vel, 'kick', 0.48)
            score.add(bar, score.meter / 2, 0.35, 40, vel * 0.85, 'kick', 0.52)
            for beat in (1, 3) if score.meter == 4 else (1,):
                score.add(bar, beat, 0.25, 58, vel * 0.8, 'snare', 0.55)
            for beat in np.arange(0, score.meter, 0.5):
                score.add(bar, float(beat), 0.08, 76, vel * 0.35, 'hat', 0.75)
            if bar % 4 == 3:
                score.add(bar, score.meter - 0.5, 0.4, 52, vel * 0.7, 'tom', 0.3)
                score.add(bar, score.meter - 0.25, 0.3, 55, vel * 0.6, 'tom', 0.7)
        elif style == 'forest':
            score.add(bar, 0, 0.45, 46, vel * 0.7, 'tom', 0.4)
            score.add(bar, 1.5 if score.meter == 4 else 1, 0.3, 53, vel * 0.55, 'tom', 0.62)
            for beat in np.arange(0, score.meter, 1):
                score.add(bar, float(beat), 0.12, 78, vel * 0.28, 'hat', 0.78)
        elif style == 'clock':
            for beat in range(score.meter):
                score.add(bar, beat, 0.08, 96, vel * (0.7 if beat == 0 else 0.4), 'tick', 0.5)
            if bar % 4 == 0:
                score.add(bar, 0, 0.5, 40, vel * 0.55, 'kick', 0.5)
            for beat in np.arange(0.5, score.meter, 1):
                score.add(bar, float(beat), 0.06, 88, vel * 0.22, 'hat', 0.62)
        elif style == 'heavy':
            score.add(bar, 0, 0.7, 36, vel, 'kick', 0.5)
            if bar % 2:
                score.add(bar, score.meter / 2, 0.5, 43, vel * 0.75, 'tom', 0.38)
            if bar % 4 == 0:
                score.add(bar, 0, 1.2, 40, vel * 0.5, 'thunder', 0.5)
        elif style == 'waltz':
            score.add(bar, 0, 0.45, 40, vel * 0.9, 'kick', 0.48)
            score.add(bar, 1, 0.25, 62, vel * 0.35, 'hat', 0.32)
            score.add(bar, 2, 0.25, 66, vel * 0.35, 'hat', 0.7)
        elif style == 'drive':
            for beat in range(score.meter):
                score.add(bar, beat, 0.3, 40, vel * 0.85, 'kick', 0.5)
            score.add(bar, 1, 0.22, 60, vel * 0.75, 'snare', 0.46)
            score.add(bar, 3, 0.22, 60, vel * 0.75, 'snare', 0.56)
            for beat in np.arange(0, score.meter, 0.5):
                score.add(bar, float(beat), 0.06, 80, vel * 0.32, 'hat', 0.74)
            if bar % 8 == 7:
                score.add(bar, 0, 1.5, 34, vel * 0.7, 'thunder', 0.5)
        elif style == 'cosmos':
            if bar % 2 == 0:
                score.add(bar, 0, 0.8, 38, vel * 0.55, 'kick', 0.5)
            for beat in (0, 2) if score.meter == 4 else (0,):
                score.add(bar, beat, 0.7, 86, vel * 0.2, 'bell', 0.7)
        elif style == 'finale':
            for beat in range(score.meter):
                score.add(bar, beat, 0.28, 38, vel, 'kick', 0.5)
                score.add(bar, beat, 0.05, 98, vel * 0.45, 'tick', 0.5)
            score.add(bar, 1, 0.24, 58, vel * 0.85, 'snare', 0.42)
            score.add(bar, 3, 0.24, 58, vel * 0.85, 'snare', 0.58)
            for beat in np.arange(0, score.meter, 0.5):
                score.add(bar, float(beat), 0.05, 82, vel * 0.34, 'hat', 0.76)
            if bar % 8 == 0:
                score.add(bar, 0, 1.4, 32, vel * 0.65, 'thunder', 0.5)


def tile(pattern, bars):
    return [pattern[i % len(pattern)] for i in range(bars)]


def silk():
    score = Score(76, 4, 36)
    degrees = tile([0, 0, 1, 4, 0, 5, 3, 4], score.bars)
    pad_and_bass(score, PHRYG, 50, degrees, 0.34, 0.28)
    motif(score, PHRYG, 50, degrees, [(0, 1.5, 7), (2, 1.2, 8), (3.5, 0.4, 6)], 'pluck', 0.55, 0.38, 1)
    motif(score, PHRYG, 50, degrees, [(1, 2.2, 11), (3, 0.8, 9)], 'bell', 0.28, 0.78, 1)
    drums(score, 'silk', 0.45)
    return score, 0.55


def wisteria():
    score = Score(92, 3, 52)
    degrees = tile([0, 4, 5, 3, 0, 6, 4, 0], score.bars)
    pad_and_bass(score, PENTA, 57, degrees, 0.4, 0.42)
    motif(score, PENTA, 57, degrees, [(0, 0.7, 4), (0.75, 0.5, 5), (1.5, 0.7, 7), (2.25, 0.6, 4)], 'flute', 0.7, 0.34, 1)
    motif(score, PENTA, 57, degrees, [(0.5, 1.5, 0), (2, 0.8, 2)], 'pluck', 0.32, 0.7, 0)
    drums(score, 'water', 0.55)
    return score, 0.62


def arena():
    score = Score(118, 4, 48)
    degrees = tile([0, 0, 3, 4, 0, 1, 4, 0], score.bars)
    pad_and_bass(score, PHRYG, 52, degrees, 0.28, 0.62)
    motif(score, PHRYG, 52, degrees, [(0, 0.4, 0), (0.5, 0.4, 3), (1, 0.5, 4), (2, 0.35, 7), (2.5, 0.3, 6), (3, 0.7, 4)], 'brass', 0.78, 0.42, 0)
    motif(score, PHRYG, 52, degrees, [(0, 0.25, 7), (1, 0.25, 8), (2, 0.25, 7), (3, 0.4, 4)], 'brass', 0.4, 0.66, 1)
    drums(score, 'arena', 0.85)
    return score, 0.7


def forest():
    score = Score(104, 4, 44)
    degrees = tile([0, 4, 5, 3, 0, 2, 4, 0], score.bars)
    pad_and_bass(score, MAJOR, 55, degrees, 0.46, 0.5)
    motif(score, MAJOR, 55, degrees, [(0, 0.8, 4), (1, 0.6, 6), (2, 1.2, 7), (3.25, 0.6, 4)], 'flute', 0.75, 0.36, 1)
    motif(score, MAJOR, 55, degrees, [(0.5, 0.4, 2), (1.5, 0.4, 4), (2.5, 0.8, 0)], 'pluck', 0.4, 0.68, 1)
    drums(score, 'forest', 0.7)
    return score, 0.75


def clockwork():
    score = Score(126, 4, 52)
    degrees = tile([0, 0, 3, 4, 5, 3, 4, 0], score.bars)
    pad_and_bass(score, MINOR, 48, degrees, 0.22, 0.48)
    sixteenths = [(beat, 0.22, step) for beat, step in zip(np.arange(0, 4, 0.25), [0, 2, 4, 2, 7, 4, 2, 4, 0, 4, 7, 4, 2, 0, 4, 2])]
    motif(score, MINOR, 48, degrees, sixteenths, 'pluck', 0.42, 0.34, 1)
    motif(score, MINOR, 48, degrees, [(0, 1.5, 7), (2, 1.5, 4)], 'bell', 0.36, 0.72, 1)
    drums(score, 'clock', 0.8)
    return score, 0.8


def amber():
    score = Score(72, 4, 32)
    degrees = tile([0, 0, 1, 4, 0, 3, 4, 0], score.bars)
    pad_and_bass(score, PHRYG, 46, degrees, 0.62, 0.7)
    motif(score, PHRYG, 46, degrees, [(0, 2.2, 0), (2.5, 1.2, 3)], 'brass', 0.7, 0.4, 0)
    motif(score, PHRYG, 46, degrees, [(1, 2.5, 7), (3, 0.8, 8)], 'pad', 0.35, 0.66, 1)
    drums(score, 'heavy', 0.95)
    return score, 0.85


def opera():
    score = Score(132, 3, 72)
    degrees = tile([0, 5, 3, 4, 0, 6, 4, 0], score.bars)
    pad_and_bass(score, HARM, 55, degrees, 0.2, 0.55)
    for bar, degree in enumerate(degrees):
        low, mid, high = triad(55, HARM, degree, 0)
        for beat, tone in ((0, low), (1, mid), (2, high)):
            score.add(bar, beat, 0.7, tone, 0.55, 'organ', 0.3 + beat * 0.18)
    motif(score, HARM, 55, degrees, [(0, 0.8, 7), (1, 0.45, 8), (1.5, 0.4, 6), (2, 0.8, 4)], 'flute', 0.62, 0.62, 1)
    drums(score, 'waltz', 0.75)
    return score, 0.88


def thunder():
    score = Score(146, 4, 64)
    degrees = tile([0, 0, 3, 4, 5, 3, 6, 4], score.bars)
    pad_and_bass(score, MINOR, 52, degrees, 0.3, 0.66)
    motif(score, MINOR, 52, degrees, [(0, 0.45, 0), (0.5, 0.45, 3), (1, 0.45, 4), (1.5, 0.45, 7),
                                      (2, 0.45, 4), (2.5, 0.45, 3), (3, 0.7, 0)], 'brass', 0.8, 0.4, 0)
    motif(score, MINOR, 52, degrees, [(0.5, 0.4, 7), (1.5, 0.4, 8), (2.5, 0.4, 11)], 'pluck', 0.45, 0.7, 1)
    drums(score, 'drive', 1)
    return score, 0.92


def stars():
    score = Score(84, 4, 40)
    degrees = tile([0, 4, 5, 2, 0, 6, 4, 0], score.bars)
    pad_and_bass(score, [0, 2, 4, 6, 7, 9, 11], 59, degrees, 0.58, 0.4)
    motif(score, [0, 2, 4, 6, 7, 9, 11], 59, degrees,
          [(0, 0.4, 7), (0.5, 0.4, 9), (1, 0.4, 11), (1.5, 0.4, 12), (2, 0.8, 11), (3, 0.8, 7)], 'bell', 0.5, 0.74, 1)
    motif(score, [0, 2, 4, 6, 7, 9, 11], 59, degrees, [(0, 3.2, 0), (3, 0.8, 4)], 'flute', 0.4, 0.3, 0)
    drums(score, 'cosmos', 0.7)
    return score, 0.96


def finale():
    score = Score(152, 4, 68)
    degrees = tile([0, 0, 3, 4, 5, 6, 4, 0], score.bars)
    pad_and_bass(score, HARM, 48, degrees, 0.4, 0.75)
    for bar, degree in enumerate(degrees):
        if bar % 2:
            continue
        for tone in triad(48, HARM, degree, 0):
            score.add(bar, 0, 2, tone + 12, 0.5, 'organ', 0.35)
    motif(score, HARM, 48, degrees, [(0, 0.5, 0), (0.5, 0.5, 3), (1, 0.5, 4), (1.5, 0.5, 7),
                                      (2, 0.75, 8), (3, 0.8, 7)], 'brass', 0.9, 0.46, 0)
    motif(score, HARM, 48, degrees, [(0, 0.25, 12), (1, 0.25, 11), (2, 0.5, 8), (3, 0.5, 7)], 'bell', 0.42, 0.74, 1)
    drums(score, 'finale', 1)
    return score, 1.0


# These four stems are owner Suno recordings. Do not overwrite their exports.
SUNO_STEMS = {'silk-tower', 'wisteria-boat', 'golden-arena', 'jade-forest'}
PIECES = [
    ('clockwork-archive', '钟械秘阁', clockwork),
    ('amber-cave', '琥珀龙窟', amber),
    ('eclipse-opera', '月蚀歌剧院', opera),
    ('thunder-citadel', '雷纹天城', thunder),
    ('fallen-star', '星陨神座', stars),
    ('myriad-gate', '万象封门', finale),
]
ORDER = ['silk-tower', 'wisteria-boat', 'golden-arena', 'jade-forest',
         'clockwork-archive', 'amber-cave', 'eclipse-opera', 'thunder-citadel', 'fallen-star', 'myriad-gate']


def main():
    report_path = OUT / 'campaign-11-20.json'
    existing = json.loads(report_path.read_text()) if report_path.exists() else []
    by_stem = {item['stem']: item for item in existing}
    for stem, title, build in PIECES:
        score, space = build()
        print(f'{stem} ({title}): {len(score.events)} events, {score.dur:.1f}s', flush=True)
        samples = render(score, space)
        meta = encode(samples, stem)
        meta.update({'stem': stem, 'theme': title, 'bpm': score.bpm, 'meter': score.meter, 'bars': score.bars,
                     'events': len(score.events), 'subjective_listening_verified': False,
                     'crossfade_seconds': CROSSFADE, 'endpoint_declick_seconds': 0.01,
                     'sample_rate': SR, 'channels': 2, 'loudness_target_lufs': -20, 'true_peak_ceiling_dbtp': -2,
                     'opus_bitrate': '96k', 'mp3_bitrate': '160k'})
        by_stem[stem] = meta
        print(f'  loop {meta["loop_seconds"]}s  ' + '  '.join(f'{item["file"].split("/")[-1]} {item["bytes"]}' for item in meta['outputs']), flush=True)
    kept = [stem for stem in SUNO_STEMS if stem not in by_stem]
    if kept:
        raise SystemExit(f'Missing Suno manifest entries: {kept}')
    report_path.write_text(json.dumps([by_stem[stem] for stem in ORDER], ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
