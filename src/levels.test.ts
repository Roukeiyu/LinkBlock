import { describe, expect, it } from 'vitest';
import { lakeBossConfig } from './boss';
import { ENEMY_STYLES } from './enemies';
import { Game } from './engine';
import { LEVELS, bossConfigFor, noteClear, readLevelProgress, writeLevelProgress } from './levels';

describe('level catalog', () => {
  it('keeps level 1 on the original speeds, squad and boss phases', () => {
    const first = LEVELS[0];
    expect(first.enemySpeed).toBe(1);
    expect(first.bossSpeed).toBe(1);
    expect(first.squad).toEqual({ straight: 3, orbit: 3, zigzag: 3 });
    expect(bossConfigFor(first)).toBe(lakeBossConfig);
  });

  it('ramps later levels gently and names every cast', () => {
    expect(LEVELS.map(level => level.theme)).toEqual(['狼人', '木乃伊', '弗兰肯斯坦', '吸血鬼', '无头骑士']);
    expect(LEVELS.map(level => level.title)).toEqual([
      '第一关 · 月下封林', '第二关 · 沙漠神殿', '第三关 · 雷雨实验室', '第四关 · 玫瑰古堡', '第五关 · 秋夜南瓜谷',
    ]);
    expect(LEVELS[1].names.boss).toBe('沙傀王');
    expect(LEVELS[2].names.boss).toBe('狂电塔');
    expect(LEVELS[3].names.boss).toBe('血月石像');
    expect(LEVELS[4].names.boss).toBe('秋猎魔骑');
    expect(LEVELS.map(level => level.accent)).toEqual(['#c5d4e6', '#e0c27a', '#2ed3c6', '#e25b78', '#f08a3c']);
    expect(LEVELS[0].rewardNinety).toBeUndefined();
    expect(LEVELS[0].rewardPerfect).toBeUndefined();
    expect(LEVELS.slice(1).map(level => [level.rewardNinety, level.rewardPerfect])).toEqual([
      ['levels/2/mummy-90.webp', 'levels/2/mummy-perfect.webp'],
      ['levels/3/frankenstein-90.webp', 'levels/3/frankenstein-perfect.webp'],
      ['levels/4/vampire-90.webp', 'levels/4/vampire-perfect.webp'],
      ['levels/5/horseman-90.webp', 'levels/5/horseman-perfect.webp'],
    ]);
    for (let i = 1; i < LEVELS.length; i++) {
      const level = LEVELS[i], previous = LEVELS[i - 1];
      const count = level.squad.straight + level.squad.orbit + level.squad.zigzag;
      const before = previous.squad.straight + previous.squad.orbit + previous.squad.zigzag;
      expect(level.enemySpeed).toBeGreaterThan(previous.enemySpeed);
      expect(level.enemySpeed).toBeLessThanOrEqual(1.2);
      expect(count).toBeGreaterThanOrEqual(before);
      expect(level.reinforceInterval).toBeLessThan(previous.reinforceInterval);
      expect(bossConfigFor(level)).not.toBe(lakeBossConfig);
      expect(bossConfigFor(level).phases?.[2].reinforcements?.speed).toBeCloseTo(8 * level.reinforceSpeed);
    }
  });
});

describe('level progress', () => {
  it('starts at level 1 and unlocks the next clear without going past the last level', () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) };
    expect(readLevelProgress(storage).unlocked).toBe(1);
    let progress = noteClear(readLevelProgress(storage), 1);
    writeLevelProgress(progress, storage);
    expect(readLevelProgress(storage).unlocked).toBe(2);
    progress = noteClear(progress, 5);
    expect(progress.unlocked).toBe(5);
    progress = noteClear(progress, 2);
    expect(progress.unlocked).toBe(5);
    writeLevelProgress({ unlocked: 9, cleared: [] }, storage);
    expect(readLevelProgress(storage).unlocked).toBe(5);
  });
});

describe('level difficulty reaches the simulation only when asked', () => {
  it('leaves a default game at the level-1 squad and speed', () => {
    const game = new Game(72, 48, { random: () => 0.37 });
    expect(game.enemies.filter(enemy => enemy.kind === 'straight')).toHaveLength(3);
    expect(game.enemies).toHaveLength(9);
    const straight = game.enemies.find(enemy => enemy.kind === 'straight')!;
    expect(Math.hypot(straight.vx, straight.vy)).toBeCloseTo(ENEMY_STYLES.straight.speed);
    expect(Math.hypot(game.boss!.vx, game.boss!.vy)).toBeCloseTo(ENEMY_STYLES.boss.speed);
  });

  it('applies a faster, larger squad when a later level asks for one', () => {
    const level = LEVELS[4];
    const game = new Game(72, 48, { random: () => 0.37, squad: level.squad, speedScale: level.enemySpeed, bossSpeedScale: level.bossSpeed });
    expect(game.enemies.filter(enemy => enemy.kind === 'straight')).toHaveLength(level.squad.straight);
    expect(game.enemies.filter(enemy => enemy.kind === 'orbit')).toHaveLength(level.squad.orbit);
    expect(game.enemies.filter(enemy => enemy.kind === 'zigzag')).toHaveLength(level.squad.zigzag);
    const straight = game.enemies.find(enemy => enemy.kind === 'straight')!;
    expect(Math.hypot(straight.vx, straight.vy)).toBeCloseTo(ENEMY_STYLES.straight.speed * level.enemySpeed);
    expect(Math.hypot(game.boss!.vx, game.boss!.vy)).toBeCloseTo(ENEMY_STYLES.boss.speed * level.bossSpeed);
  });
});
