import { describe, expect, it } from 'vitest';
import { sameMusicSource } from './audio';

const pages = 'https://roukeiyu.github.io/LinkBlock/';
const pagesFile = 'https://roukeiyu.github.io/LinkBlock/index.html';

describe('music source identity', () => {
  it('treats a relative stem and the absolute URL reported by an audio element as the same track', () => {
    const relative = './audio/curious-pages-suno-v1.ogg';
    const absolute = 'https://roukeiyu.github.io/LinkBlock/audio/curious-pages-suno-v1.ogg';
    expect(sameMusicSource(absolute, relative, pages)).toBe(true);
    expect(sameMusicSource(absolute, relative, pagesFile)).toBe(true);
    expect(sameMusicSource(relative, absolute, 'http://127.0.0.1:5173/')).toBe(false);
    expect(sameMusicSource(absolute, relative, 'http://127.0.0.1:5173/')).toBe(false);
  });

  it('reloads only for a different stem or the ogg/mp3 fallback', () => {
    const base = 'http://127.0.0.1:5173/';
    expect(sameMusicSource('http://127.0.0.1:5173/audio/moonlit-grove.ogg', './audio/moonlit-grove.ogg', base)).toBe(true);
    expect(sameMusicSource('http://127.0.0.1:5173/audio/moonlit-grove.ogg', './audio/myriad-gate.ogg', base)).toBe(false);
    expect(sameMusicSource('http://127.0.0.1:5173/audio/moonlit-grove.ogg', './audio/moonlit-grove.mp3', base)).toBe(false);
    expect(sameMusicSource('http://127.0.0.1:5173/audio/moonlit-grove.mp3', './audio/moonlit-grove.mp3', base)).toBe(true);
  });

  it('ignores a cache query when the file is unchanged', () => {
    expect(sameMusicSource(
      'https://roukeiyu.github.io/LinkBlock/audio/myriad-gate.ogg?v=1',
      './audio/myriad-gate.ogg',
      pages,
    )).toBe(true);
  });
});
