// Sound effects are synthesized in the browser with the Web Audio API (CC0).
// Background music uses owner-authorized tracks, one per level, loaded on the
// first gesture. See AUDIO.txt for Suno sources and processing details.

export type Mood = 'calm' | 'tense' | 'bright';

export interface AudioPrefs {
  music: boolean;
  sfx: boolean;
  musicVolume: number;
  sfxVolume: number;
}

const STORAGE_KEY = 'linkblock.fenglin.audio';
const DEFAULT_PREFS: AudioPrefs = { music: true, sfx: true, musicVolume: 0.62, sfxVolume: 0.78 };

type AudioCtor = typeof AudioContext;

function musicSrc(stem: string) {
  const base = import.meta.env.BASE_URL;
  const probe = document.createElement('audio');
  const opus = probe.canPlayType('audio/ogg; codecs="opus"') || probe.canPlayType('audio/ogg; codecs=opus');
  return `${base}audio/${stem}.${opus ? 'ogg' : 'mp3'}`;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function readAudioPrefs(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): AudioPrefs {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    return {
      music: parsed.music !== false,
      sfx: parsed.sfx !== false,
      musicVolume: clamp01(Number(parsed.musicVolume ?? DEFAULT_PREFS.musicVolume)),
      sfxVolume: clamp01(Number(parsed.sfxVolume ?? DEFAULT_PREFS.sfxVolume)),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeAudioPrefs(prefs: AudioPrefs, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* Private mode can reject storage. */ }
}

export class LakeAudio {
  prefs = readAudioPrefs();
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private noise?: AudioBuffer;
  private hum?: { osc: OscillatorNode; gain: GainNode };
  private track?: HTMLAudioElement;
  private stem = 'moonlit-grove';
  private mood: Mood = 'calm';
  private hidden = false;
  private started = false;
  private last: Record<string, number> = {};
  private unlocked = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (!this.ctx) return;
      if (this.hidden) {
        this.applyMusicGain(0.0001);
        this.track?.pause();
      } else {
        void this.ctx.resume().catch(() => {});
        this.applyMusicGain();
        if (this.started && this.prefs.music) this.startTrack();
      }
    });
  }

  /** Call from a pointer or key handler so Safari and Chrome allow sound. */
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    if (!this.unlocked) {
      this.unlocked = true;
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const blip = ctx.createBufferSource();
      blip.buffer = buffer;
      blip.connect(ctx.destination);
      blip.start(0);
    }
    if (!this.started && this.prefs.music && !this.hidden) {
      this.started = true;
      this.startTrack();
    }
  }

  setMusic(on: boolean) {
    this.prefs.music = on;
    writeAudioPrefs(this.prefs);
    this.applyMusicGain();
    if (on && this.unlocked && !this.hidden) {
      this.started = true;
      this.startTrack();
    } else if (!on) this.track?.pause();
  }

  setSfx(on: boolean) {
    this.prefs.sfx = on;
    writeAudioPrefs(this.prefs);
    this.applySfxGain();
    if (!on) this.drawHum(false);
  }

  setMusicVolume(volume: number) {
    this.prefs.musicVolume = clamp01(volume);
    writeAudioPrefs(this.prefs);
    this.applyMusicGain();
  }

  setSfxVolume(volume: number) {
    this.prefs.sfxVolume = clamp01(volume);
    writeAudioPrefs(this.prefs);
    this.applySfxGain();
  }

  setMood(mood: Mood) {
    if (this.mood === mood) return;
    this.mood = mood;
    this.applyMusicGain();
  }

  drawHum(on: boolean) {
    const ctx = this.ctx;
    if (!this.unlocked || !ctx || !this.sfxGain || !this.prefs.sfx) {
      if (!on) this.stopHum();
      return;
    }
    if (on) {
      if (this.hum) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      osc.type = 'sine';
      osc.frequency.value = 196;
      gain.gain.value = 0.0001;
      osc.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
      osc.start();
      gain.gain.setTargetAtTime(0.018, ctx.currentTime, 0.05);
      this.hum = { osc, gain };
    } else this.stopHum();
  }

  play(name: string, amount = 1, delay = 0) {
    if (!this.unlocked || !this.prefs.sfx || this.hidden) return;
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const now = ctx.currentTime + delay;
    const gap = name === 'draw-tick' || name === 'rewind' ? 0.16 : name === 'click' ? 0.04 : 0;
    if (gap && now - (this.last[name] ?? -9) < gap) return;
    this.last[name] = now;
    const bus = this.sfxGain;
    const note = (freq: number, dur: number, gain: number, at = now, type: OscillatorType = 'sine', end?: number, attack?: number) => {
      this.voice(ctx, { freq, endFreq: end, dur, type, gain, attack, at, bus });
    };
    if (name === 'click') note(1480, 0.035, 0.04, now, 'triangle');
    else if (name === 'draw-start') { note(784, 0.09, 0.05, now, 'triangle', 523, 0.01); }
    else if (name === 'draw-tick') note(660, 0.04, 0.02, now, 'sine');
    else if (name === 'rebound') { note(392, 0.07, 0.06, now, 'triangle', 240); note(196, 0.1, 0.04, now + 0.05, 'sine'); }
    else if (name === 'rewind') note(320, 0.05, 0.025, now, 'triangle', 180);
    else if (name === 'capture') this.chime(ctx, bus, now, amount);
    else if (name === 'partition') note(440, 0.08, 0.03, now, 'sine');
    else if (name === 'defeat') { note(660, 0.1, 0.05, now, 'triangle'); note(880, 0.12, 0.04, now + 0.06, 'sine'); }
    else if (name === 'boss-hit') note(180, 0.16, 0.06, now, 'triangle', 90);
    else if (name === 'hurt') { note(96, 0.22, 0.08, now, 'triangle', 54); this.puff(ctx, bus, now, 0.18, 0.05, 240); }
    else if (name === 'respawn') note(392, 0.16, 0.04, now + 0.18, 'sine', 587, 0.04);
    else if (name === 'boss') { note(82, 0.7, 0.05, now, 'sine', 55, 0.2); note(164, 0.5, 0.03, now + 0.1, 'triangle'); }
    else if (name === 'boss-jump') this.puff(ctx, bus, now, 0.28, 0.045, 500);
    else if (name === 'level') { note(392, 0.16, 0.04, now, 'sine'); note(523, 0.22, 0.04, now + 0.1, 'sine'); }
    else if (name === 'gameover') { note(311, 0.25, 0.05, now, 'triangle', 196); note(146, 0.4, 0.04, now + 0.16, 'sine'); }
    else if (name === 'milestone') { note(659, 0.14, 0.045, now, 'sine'); note(880, 0.18, 0.04, now + 0.12, 'sine'); note(1175, 0.28, 0.035, now + 0.24, 'triangle'); }
    else if (name === 'perfect') { note(988, 0.12, 0.04, now, 'sine'); note(1319, 0.2, 0.035, now + 0.1, 'triangle'); }
    else if (name === 'reward') note(1046, 0.2, 0.045, now, 'sine', 1568, 0.02);
    else if (name === 'seal') this.seal(ctx, bus, now);
  }

  private chime(ctx: AudioContext, bus: GainNode, now: number, area: number) {
    const scale = Math.min(1, Math.max(0.25, area / 6));
    const notes = scale > 0.72 ? [523, 659, 784, 1046] : scale > 0.4 ? [523, 659, 784] : [523, 784];
    notes.forEach((freq, i) => this.voice(ctx, {
      freq, dur: 0.18 + scale * 0.2, type: 'sine', gain: 0.035 + scale * 0.02, attack: 0.01, at: now + i * 0.07, bus,
    }));
  }

  private seal(ctx: AudioContext, bus: GainNode, now: number) {
    for (const [i, chord] of [[[293.66, 349.23, 440]], [[293.66, 369.99, 440], [587.33]]].entries()) {
      for (const freq of chord.flat()) this.voice(ctx, {
        freq, dur: 0.9, type: 'sine', gain: 0.03, attack: 0.08, at: now + i * 0.55, bus,
      });
    }
  }

  private puff(ctx: AudioContext, bus: GainNode, at: number, dur: number, gain: number, freq: number) {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(freq, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.35), at + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.03);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter); filter.connect(amp); amp.connect(bus);
    src.start(at); src.stop(at + dur + 0.02);
  }

  private voice(ctx: AudioContext, voice: { freq: number; endFreq?: number; dur: number; type: OscillatorType; gain: number; attack?: number; at: number; bus: AudioNode }) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = voice.type;
    osc.frequency.setValueAtTime(Math.max(40, voice.freq), voice.at);
    if (voice.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, voice.endFreq), voice.at + Math.max(0.03, voice.dur));
    const attack = voice.attack ?? Math.min(0.02, voice.dur * 0.35);
    amp.gain.setValueAtTime(0.0001, voice.at);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, voice.gain), voice.at + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, voice.at + voice.dur);
    osc.connect(amp); amp.connect(voice.bus);
    osc.start(voice.at); osc.stop(voice.at + voice.dur + 0.03);
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctx) return undefined;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const musicGain = ctx.createGain();
      const sfxGain = ctx.createGain();
      musicGain.connect(master); sfxGain.connect(master); master.connect(ctx.destination);
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      let seed = 1;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = seed / 2147483647 * 2 - 1;
      }
      this.ctx = ctx; this.master = master; this.musicGain = musicGain; this.sfxGain = sfxGain; this.noise = noise;
      this.applyMusicGain(); this.applySfxGain();
      return ctx;
    } catch {
      return undefined;
    }
  }

  private applyMusicGain(override?: number) {
    if (!this.musicGain || !this.ctx) return;
    const mood = this.mood === 'tense' ? 1.12 : this.mood === 'bright' ? 1.05 : 1;
    const level = override ?? (this.prefs.music && !this.hidden ? this.prefs.musicVolume * 0.7 * mood : 0.0001);
    this.musicGain.gain.setTargetAtTime(Math.max(0.0001, level), this.ctx.currentTime, 0.08);
  }

  private applySfxGain() {
    if (!this.sfxGain) return;
    this.sfxGain.gain.value = this.prefs.sfx ? this.prefs.sfxVolume : 0;
  }

  /** Remember which level's loop to play. The file is fetched only once playback starts. */
  useTrack(stem: string) {
    if (this.stem === stem) return;
    this.stem = stem;
    if (!this.track) return;
    this.track.pause();
    this.track.src = musicSrc(stem);
    if (this.started && this.prefs.music && !this.hidden) void this.track.play().catch(() => {});
  }

  /** Fetch the current level's track only after a gesture, then loop it through the music gain. */
  private startTrack() {
    const ctx = this.ctx;
    const bus = this.musicGain;
    if (!ctx || !bus || !this.prefs.music || this.hidden) return;
    const src = musicSrc(this.stem);
    if (!this.track) {
      const track = new Audio();
      track.loop = true;
      track.preload = 'none';
      track.setAttribute('playsinline', '');
      track.setAttribute('aria-hidden', 'true');
      track.style.display = 'none';
      track.src = src;
      document.body.appendChild(track);
      const source = ctx.createMediaElementSource(track);
      source.connect(bus);
      this.track = track;
    } else if (!this.track.src.endsWith(src)) {
      this.track.pause();
      this.track.src = src;
    }
    void this.track.play().catch(() => {});
  }

  private stopHum() {
    const ctx = this.ctx;
    if (!this.hum || !ctx) return;
    const { osc, gain } = this.hum;
    this.hum = undefined;
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
    osc.stop(ctx.currentTime + 0.15);
  }

}

export const lakeAudio = new LakeAudio();
