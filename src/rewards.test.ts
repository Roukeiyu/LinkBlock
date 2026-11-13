import { describe, expect, it } from 'vitest';
import { Game } from './engine';
import { createEnemy } from './enemies';
import { applyUnlocks, EMPTY_CODEX, freshUnlocks, readCodex, rewardsFor, writeCodex } from './rewards';

const win = (lives: number, winReason: 'territory' | 'boss' = 'territory') => ({ lives, maxLives: 3, winReason });

describe('封林 rewards', () => {
  it('awards full health and Boss victory independently, including both in one clear', () => {
    expect(freshUnlocks(EMPTY_CODEX, win(3))).toEqual(['clear', 'ninety']);
    expect(freshUnlocks(EMPTY_CODEX, win(2))).toEqual(['clear']);
    expect(freshUnlocks(EMPTY_CODEX, win(1, 'boss'))).toEqual(['clear', 'perfect']);
    expect(freshUnlocks(EMPTY_CODEX, win(3, 'boss'))).toEqual(['clear', 'ninety', 'perfect']);
    expect(freshUnlocks({ clear: true, ninety: false, perfect: true }, win(3))).toEqual(['ninety']);
    expect(freshUnlocks(EMPTY_CODEX, { lives: 3, maxLives: 4, winReason: 'territory' })).toEqual(['clear']);
  });
  it('does not award a full-health unfinished or lost run', () => {
    const result = { lives: 3, maxLives: 3, winReason: undefined };
    expect(freshUnlocks(EMPTY_CODEX, result)).toEqual([]);
    expect(applyUnlocks(EMPTY_CODEX, result).codex).toEqual(EMPTY_CODEX);
  });
  it.each([1, 2])('uses the actual victory reason when a capture hits a Boss with %s health and reaches the territory goal', health => {
    const game = new Game(100, 100, { enemies: [], boss: createEnemy('boss', { x: 70, y: 15 }, { x: 0, y: 0 }), victory: { territoryPercent: 10 } });
    game.start(); game.bossHealth = health; game.lives = 1; game.hitsTaken = 2;
    game.move('down', true, 30); game.move('right', true, 40); game.move('up', true, 30);
    expect(game.phase).toBe('won'); expect(game.lives).toBe(2);
    expect(game.winReason).toBe(health === 1 ? 'boss' : 'territory');
    expect(applyUnlocks(EMPTY_CODEX, game).fresh).toEqual(health === 1 ? ['clear', 'perfect'] : ['clear']);
  });
  it('keeps earlier unlocks when a later clear earns nothing new', () => {
    const before = { clear: true, ninety: true, perfect: false };
    const next = applyUnlocks(before, win(1));
    expect(next.fresh).toEqual([]);
    expect(next.codex).toEqual(before);
    expect(before).toEqual({ clear: true, ninety: true, perfect: false });
  });
  it('records later levels beside level 1 and keeps an old save as 阿澈 only', () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    storage.setItem('linkblock.fenglin.codex', JSON.stringify({ clear: true, ninety: false, perfect: true }));
    const saved = readCodex(storage);
    expect(rewardsFor(saved, 1)).toEqual({ clear: true, ninety: false, perfect: true });
    expect(rewardsFor(saved, 2)).toEqual(EMPTY_CODEX);
    const next = applyUnlocks(saved, win(3, 'boss'), 2);
    expect(next.fresh).toEqual(['clear', 'ninety', 'perfect']);
    expect(rewardsFor(next.codex, 1)).toEqual({ clear: true, ninety: false, perfect: true });
    expect(rewardsFor(next.codex, 2)).toEqual({ clear: true, ninety: true, perfect: true });
    expect(applyUnlocks(next.codex, win(1), 2).fresh).toEqual([]);
    writeCodex(next.codex, storage);
    expect(rewardsFor(readCodex(storage), 2).clear).toBe(true);
    expect(rewardsFor(readCodex(storage), 3).clear).toBe(false);
  });
  it('keeps every reward sealed until that level earns it', () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    const fresh = readCodex(storage);
    for (const level of [1, 2, 3, 4, 5]) expect(rewardsFor(fresh, level)).toEqual({ clear: false, ninety: false, perfect: false });
    expect(rewardsFor(readCodex({ getItem: () => JSON.stringify({ clear: 'true', ninety: 1, perfect: false }) }), 1)).toEqual(EMPTY_CODEX);
    const cleared = applyUnlocks(fresh, win(2), 1);
    expect(cleared.fresh).toEqual(['clear']);
    expect(rewardsFor(cleared.codex, 1)).toEqual({ clear: true, ninety: false, perfect: false });
    expect(rewardsFor(cleared.codex, 2)).toEqual(EMPTY_CODEX);
    const perfect = applyUnlocks(fresh, win(3, 'boss'), 3);
    expect(perfect.fresh).toEqual(['clear', 'ninety', 'perfect']);
    expect(rewardsFor(perfect.codex, 3)).toEqual({ clear: true, ninety: true, perfect: true });
    expect(rewardsFor(perfect.codex, 1).clear).toBe(false);
  });
});