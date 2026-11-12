import { describe, expect, it } from 'vitest';
import { lakeBossConfig } from './boss';
import { ENEMY_STYLES } from './enemies';
import { Game } from './engine';
import { LEVELS, bossConfigFor, gameOptionsFor, noteClear, readLevelProgress, writeLevelProgress } from './levels';

describe('level catalog', () => {
  it('keeps level 1 speeds and boss attacks while reducing its population', () => {
    const first = LEVELS[0];
    expect(first.enemySpeed).toBe(1);
    expect(first.bossSpeed).toBe(1);
    expect(first.squad).toEqual({ straight: 2, orbit: 2, zigzag: 2 });
    const phases = bossConfigFor(first).phases!;
    expect(phases.map(p => p.createAttack)).toEqual(lakeBossConfig.phases!.map(p => p.createAttack));
    expect(phases.map(p => p.when)).toEqual(lakeBossConfig.phases!.map(p => p.when));
    expect(lakeBossConfig.phases![2].reinforcements?.targetCount).toBe(15);
    expect(lakeBossConfig.phases![2].reinforcements?.interval).toBe(4);
  });

  it.each(LEVELS.slice(0, 5))('$title starts with a mixed roster and keeps that cap in both reinforcement phases', level => {
    const game = new Game(72, 48, { ...gameOptionsFor(level), random: () => 0.37 });
    game.start(); game.confirmOpening();
    expect(game.enemies).toHaveLength(level.id + 5);
    for (const kind of ['straight', 'orbit', 'zigzag'] as const) {
      expect(game.enemies.filter(enemy => enemy.kind === kind)).toHaveLength(level.squad[kind]);
      expect(level.squad[kind]).toBeGreaterThanOrEqual(2);
    }
    const phases = bossConfigFor(level).phases!;
    expect(phases[0].reinforcements).toBeUndefined();
    for (const phase of phases.slice(1)) expect(phase.reinforcements).toMatchObject({
      targetCount: level.id + 5, batchSize: 1, interval: 6.5 - level.id * 0.5,
    });
  });

  it.each(LEVELS.slice(5))('$title retains its later-game population and full refill waves', level => {
    expect(level.squad.straight + level.squad.orbit + level.squad.zigzag).toBe(level.id + 7);
    const phases = bossConfigFor(level).phases!;
    expect(phases[1].reinforcements?.targetCount).toBe(level.id + 8);
    expect(phases[2].reinforcements?.targetCount).toBe(level.id + 13);
    expect(phases[2].reinforcements?.batchSize).toBeUndefined();
  });

  it('ramps later levels gently and names every cast', () => {
    expect(LEVELS.slice(0, 5).map(level => level.theme)).toEqual(['狼人', '木乃伊', '弗兰肯斯坦', '吸血鬼', '无头骑士']);
    expect(LEVELS.slice(0, 5).map(level => level.title)).toEqual([
      '第一关 · 月下封林', '第二关 · 沙漠神殿', '第三关 · 雷雨实验室', '第四关 · 玫瑰古堡', '第五关 · 秋夜南瓜谷',
    ]);
    expect(LEVELS[1].names.boss).toBe('沙傀王');
    expect(LEVELS[2].names.boss).toBe('狂电塔');
    expect(LEVELS[3].names.boss).toBe('血月石像');
    expect(LEVELS[4].names.boss).toBe('秋猎魔骑');
    expect(LEVELS.slice(0, 5).map(level => level.accent)).toEqual(['#c5d4e6', '#e0c27a', '#2ed3c6', '#e25b78', '#f08a3c']);
    for (const level of LEVELS.slice(0, 5)) {
      const version = level.id === 1 ? 'v10' : level.id === 3 ? 'v14' : 'v15';
      expect(level.rewardNinety).toBe(`levels/${level.id}/${level.id === 2 ? 'v11' : 'v10'}/ninety.webp`);
      expect(level.rewardPerfect).toBe(`levels/${level.id}/${version}/perfect.webp`);
    }
    for (let i = 1; i < LEVELS.length; i++) {
      const level = LEVELS[i], previous = LEVELS[i - 1];
      const count = level.squad.straight + level.squad.orbit + level.squad.zigzag;
      const before = previous.squad.straight + previous.squad.orbit + previous.squad.zigzag;
      expect(level.enemySpeed).toBeGreaterThan(previous.enemySpeed);
      expect(level.enemySpeed).toBeLessThanOrEqual(1.4);
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
    expect(progress.unlocked).toBe(6);
    progress = noteClear(progress, 2);
    expect(progress.unlocked).toBe(6);
    writeLevelProgress({ unlocked: 99, cleared: [] }, storage);
    expect(readLevelProgress(storage).unlocked).toBe(10);
  });
});

describe('level difficulty reaches the simulation only when asked', () => {
  it('keeps the legacy engine defaults when no level configuration is supplied', () => {
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
