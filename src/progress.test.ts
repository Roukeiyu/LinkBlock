import { describe, expect, it } from 'vitest';
import { noteClear, readLevelProgress, writeLevelProgress } from './levels';
import { applyUnlocks, codexForProgress, readCodex, rewardsFor, writeCodex } from './rewards';

const levelKey = 'linkblock.fenglin.levels', rewardKey = 'linkblock.fenglin.codex';
function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
describe('completed seals versus available levels', () => {
  it('starts at zero completed seals with level 1 available, including repeated reads', () => {
    const storage = memory();
    for (let i = 0; i < 3; i++) expect(readLevelProgress(storage)).toEqual({ unlocked: 1, cleared: [] });
  });
  it('does not mistake an orphan legacy gallery reward or an unlocked level for a completed seal', () => {
    const storage = memory();
    storage.setItem(rewardKey, JSON.stringify({ clear: true, ninety: true, perfect: true }));
    for (const unlocked of [undefined, 1]) {
      if (unlocked) storage.setItem(levelKey, JSON.stringify({ unlocked }));
      const progress = readLevelProgress(storage);
      expect(progress.cleared).toEqual([]);
      expect(rewardsFor(codexForProgress(readCodex(storage), progress.cleared), 1)).toEqual({ clear: false, ninety: false, perfect: false });
    }
    storage.setItem(rewardKey, '{}'); storage.setItem(levelKey, JSON.stringify({ unlocked: 5 }));
    expect(readLevelProgress(storage).cleared).toEqual([]);
  });
  it('preserves consistent legacy clears, including all five, without modifying old storage', () => {
    const storage = memory();
    storage.setItem(levelKey, JSON.stringify({ unlocked: 2 }));
    storage.setItem(rewardKey, JSON.stringify({ clear: true, ninety: false, perfect: true }));
    expect(readLevelProgress(storage)).toEqual({ unlocked: 2, cleared: [1] });
    storage.setItem(levelKey, JSON.stringify({ unlocked: 5 }));
    const raw = JSON.stringify({ clear: true, levels: Object.fromEntries([2, 3, 4, 5].map(id => [id, { clear: true }])) });
    storage.setItem(rewardKey, raw);
    expect(readLevelProgress(storage).cleared).toEqual([1, 2, 3, 4, 5]);
    expect(storage.getItem(rewardKey)).toBe(raw);
  });
  it('records a win once, persists it, and ignores stray reward changes on refresh', () => {
    const storage = memory();
    const first = noteClear(readLevelProgress(storage), 1);
    writeLevelProgress(noteClear(first, 1), storage);
    writeCodex(applyUnlocks(readCodex(storage), { lives: 2, maxLives: 3, winReason: 'territory' }).codex, storage);
    expect(readLevelProgress(storage)).toEqual({ unlocked: 2, cleared: [1] });
    storage.setItem(rewardKey, JSON.stringify({ clear: true, levels: { 2: { clear: true } } }));
    expect(readLevelProgress(storage).cleared).toEqual([1]);
    expect(rewardsFor(codexForProgress(readCodex(storage), [1]), 2).clear).toBe(false);
  });
  it('sanitizes malformed saved completions and never falls back to orphan gallery flags', () => {
    const storage = memory();
    storage.setItem(rewardKey, JSON.stringify({ clear: true }));
    for (const cleared of [null, 'all', true, []]) {
      storage.setItem(levelKey, JSON.stringify({ version: 2, unlocked: 5, cleared }));
      expect(readLevelProgress(storage).cleared).toEqual([]);
    }
    storage.setItem(levelKey, JSON.stringify({ version: 2, unlocked: 3, cleared: [1, 1, '2', 3, 5, 99] }));
    expect(readLevelProgress(storage).cleared).toEqual([1, 3]);
    expect(noteClear(readLevelProgress(storage), 99).cleared).toEqual([1, 3]);
  });
});
