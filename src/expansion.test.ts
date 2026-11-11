import { describe, expect, it } from 'vitest';
import { LEVELS, gameOptionsFor, noteClear, readLevelProgress, writeLevelProgress } from './levels';
import { applyUnlocks, codexForProgress, readCodex, rewardsFor, writeCodex } from './rewards';
import { Game } from './engine';
import { Projectile } from './attacks';
import { LevelAttack } from './level-attacks';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
}
describe('ten-level campaign compatibility', () => {
  it('continues a completed five-level v2 save at level six without inventing clears', () => {
    const storage = memory();
    storage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 2, unlocked: 5, cleared: [1, 2, 3, 4, 5] }));
    const progress = readLevelProgress(storage);
    expect(progress).toEqual({ unlocked: 6, cleared: [1, 2, 3, 4, 5] });
    writeLevelProgress(progress, storage);
    expect(readLevelProgress(storage)).toEqual(progress);
    storage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 2, unlocked: 5, cleared: [1, 2, 3, 4] }));
    expect(readLevelProgress(storage).unlocked).toBe(5);
  });
  it('recognizes a genuine pre-v2 fifth clear while ignoring an orphan reward', () => {
    const storage = memory();
    storage.setItem('linkblock.fenglin.codex', JSON.stringify({ levels: { 5: { clear: true } } }));
    expect(readLevelProgress(storage).cleared).toEqual([]);
    storage.setItem('linkblock.fenglin.levels', JSON.stringify({ unlocked: 5 }));
    expect(readLevelProgress(storage)).toEqual({ unlocked: 6, cleared: [5] });
  });
  it('unlocks six through ten sequentially, saves all 30 rewards and never creates level eleven', () => {
    const storage = memory(); let progress = readLevelProgress(storage), codex = readCodex(storage);
    expect(LEVELS.map(l => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const level of LEVELS) {
      progress = noteClear(progress, level.id);
      codex = applyUnlocks(codex, 96, 3, level.id, 0).codex;
      writeLevelProgress(progress, storage); writeCodex(codex, storage);
      expect(readLevelProgress(storage).unlocked).toBe(Math.min(10, level.id + 1));
      expect(rewardsFor(readCodex(storage), level.id)).toEqual({ clear: true, ninety: true, perfect: true });
    }
    expect(readLevelProgress(storage).cleared).toHaveLength(10);
    const loaded = codexForProgress(readCodex(storage), progress.cleared);
    expect(LEVELS.every(l => rewardsFor(loaded, l.id).perfect)).toBe(true);
  });
  it('gives new levels independent assets, soundtracks and attack families', () => {
    const added = LEVELS.slice(5);
    expect(new Set(added.map(l => l.attackPattern)).size).toBe(5);
    expect(new Set(LEVELS.map(l => l.music)).size).toBe(10);
    for (const level of added) {
      expect(new Set([level.restored, level.sealed, level.mask, level.rewardNinety, level.rewardPerfect]).size).toBe(5);
      const game = new Game(72, 48, { ...gameOptionsFor(level), opening: false });
      expect(game.bossAttack).toBeInstanceOf(LevelAttack);
      expect(game.enemies.length).toBe(level.squad.straight + level.squad.orbit + level.squad.zigzag);
    }
  });
  it('does not award no-hit after damage followed by a healing capture', () => {
    const game = new Game(100, 100, { enemies: [], boss: null, victory: { territoryPercent: 100 } });
    game.start();
    game.spawnHazard(new Projectile({ ...game.player }, { x: 0, y: 0 })); game.update(.01);
    expect(game.hitsTaken).toBe(1); expect(game.lives).toBe(2);
    game.protection = 0;
    game.move('down', true, 30); game.move('right', true, 40); game.move('up', true, 30);
    expect(game.lives).toBe(3);
    expect(applyUnlocks(readCodex(memory()), 96, game.lives, 10, game.hitsTaken).fresh).toEqual(['clear', 'ninety']);
    expect(new Game().hitsTaken).toBe(0);
  });
});

describe('new attack identities', () => {
  function volley(pattern: 'tide' | 'fox' | 'frost' | 'gargoyle' | 'inferno', waves = 1) {
    const skill = new LevelAttack(pattern, 0), shots: Projectile[] = [];
    const context = { origin: { x: 36, y: 24 }, target: { x: 36, y: 0 }, arena: { width: 72, height: 48 }, spawn(h: unknown) { shots.push(h as Projectile); return true; }, cast() {} };
    for (let wave = 0; wave < waves; wave++) skill.update(skill.interval, context);
    return shots;
  }
  it('alternates slow and fast tide shots without homing', () => {
    const shots = volley('tide');
    expect(shots).toHaveLength(12);
    expect(Math.hypot(shots[0].velocity.x, shots[0].velocity.y)).toBeCloseTo(6.6);
    expect(Math.hypot(shots[1].velocity.x, shots[1].velocity.y)).toBeCloseTo(11);
  });
  it('alternates ice axes, groups fox/gargoyle wings and switches the final boss pattern', () => {
    const ice = volley('frost', 2);
    expect(ice).toHaveLength(12);
    expect(Math.abs(ice[1].velocity.x)).toBeGreaterThan(Math.abs(ice[1].velocity.y));
    expect(Math.abs(ice[7].velocity.y)).toBeGreaterThan(Math.abs(ice[7].velocity.x));
    expect(volley('fox')).toHaveLength(9); expect(volley('gargoyle')).toHaveLength(8);
    expect(volley('inferno')).toHaveLength(10); expect(volley('inferno', 2)).toHaveLength(16);
  });
});
