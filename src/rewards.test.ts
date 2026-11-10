import { describe, expect, it } from 'vitest';
import { applyUnlocks, EMPTY_CODEX, freshUnlocks } from './rewards';

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
});