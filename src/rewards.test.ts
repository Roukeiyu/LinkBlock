import { describe, expect, it } from 'vitest';
import { applyUnlocks, EMPTY_CODEX, freshUnlocks, readCodex, rewardsFor, writeCodex } from './rewards';

describe('封林 rewards', () => {
  it('unlocks the rescue on any clear, 90% only at the threshold, and perfect only with every life', () => {
    expect(freshUnlocks(EMPTY_CODEX, 75, 3)).toEqual(['clear', 'perfect']);
    expect(freshUnlocks(EMPTY_CODEX, 90, 2)).toEqual(['clear', 'ninety']);
    expect(freshUnlocks(EMPTY_CODEX, 96.2, 3)).toEqual(['clear', 'ninety', 'perfect']);
    expect(freshUnlocks({ clear: true, ninety: false, perfect: true }, 95, 3)).toEqual(['ninety']);
  });
  it('keeps earlier unlocks when a later clear earns nothing new', () => {
    const before = { clear: true, ninety: true, perfect: false };
    const next = applyUnlocks(before, 80, 1);
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
    const next = applyUnlocks(saved, 92, 3, 2);
    expect(next.fresh).toEqual(['clear', 'ninety', 'perfect']);
    expect(rewardsFor(next.codex, 1)).toEqual({ clear: true, ninety: false, perfect: true });
    expect(rewardsFor(next.codex, 2)).toEqual({ clear: true, ninety: true, perfect: true });
    expect(applyUnlocks(next.codex, 70, 1, 2).fresh).toEqual([]);
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
    const cleared = applyUnlocks(fresh, 80, 2, 1);
    expect(cleared.fresh).toEqual(['clear']);
    expect(rewardsFor(cleared.codex, 1)).toEqual({ clear: true, ninety: false, perfect: false });
    expect(rewardsFor(cleared.codex, 2)).toEqual(EMPTY_CODEX);
    const perfect = applyUnlocks(fresh, 96, 3, 3);
    expect(perfect.fresh).toEqual(['clear', 'ninety', 'perfect']);
    expect(rewardsFor(perfect.codex, 3)).toEqual({ clear: true, ninety: true, perfect: true });
    expect(rewardsFor(perfect.codex, 1).clear).toBe(false);
  });
});