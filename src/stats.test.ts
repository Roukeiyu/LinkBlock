import { describe, expect, it } from 'vitest';
import { EMPTY_CODEX, applyUnlocks } from './rewards';
import { LEVELS } from './levels';
import {
  COOLDOWN_MIN, COOLDOWN_PER_POINT, DURATION_PER_POINT, RANGE_PER_POINT, SPEED_PER_POINT, STAT_CAP, STAT_IDS,
  adjustAllocation, badgePoints, emptyAllocation, modifiersFor, normalizeAllocation, readAllocation, spent, writeAllocation,
} from './stats';

const memory = () => {
  const saved = new Map<string, string>();
  return { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
};
const win = (lives: number, winReason: 'territory' | 'boss' = 'territory') => ({ lives, maxLives: 3, winReason });

describe('badge stat allocation', () => {
  it('grants one point per earned badge and none for a locked codex', () => {
    expect(badgePoints(EMPTY_CODEX)).toBe(0);
    const first = applyUnlocks(EMPTY_CODEX, win(3, 'boss'), 1).codex;
    expect(badgePoints(first)).toBe(3);
    const second = applyUnlocks(first, win(1), 2).codex;
    expect(badgePoints(second)).toBe(4);
    expect(badgePoints(LEVELS.reduce((codex, level) => applyUnlocks(codex, win(3, 'boss'), level.id).codex, EMPTY_CODEX))).toBe(LEVELS.length * 3);
  });
  it('respecs freely until the cap or the unspent points run out', () => {
    let allocation = emptyAllocation();
    allocation = adjustAllocation(allocation, 'speed', 1, 3);
    allocation = adjustAllocation(allocation, 'speed', 1, 3);
    allocation = adjustAllocation(allocation, 'range', 1, 3);
    expect(allocation).toEqual({ duration: 0, cooldown: 0, speed: 2, range: 1 });
    expect(adjustAllocation(allocation, 'duration', 1, 3)).toBe(allocation);
    allocation = adjustAllocation(allocation, 'speed', -1, 3);
    allocation = adjustAllocation(allocation, 'duration', 1, 3);
    expect(spent(allocation)).toBe(3);
    expect(allocation.duration).toBe(1); expect(allocation.speed).toBe(1);
    let capped = emptyAllocation();
    for (let i = 0; i < 20; i++) capped = adjustAllocation(capped, 'cooldown', 1, 100);
    expect(capped.cooldown).toBe(STAT_CAP);
    expect(adjustAllocation(capped, 'cooldown', 1, 100)).toBe(capped);
    expect(adjustAllocation(capped, 'cooldown', -1, 0).cooldown).toBe(STAT_CAP - 1);
  });
  it('drops illegal and overspent saved points, trimming later stats first', () => {
    expect(normalizeAllocation({ duration: 9.8, cooldown: 8, speed: -3, range: 4, combo: 9 }, 10)).toEqual({ duration: 8, cooldown: 2, speed: 0, range: 0 });
    expect(normalizeAllocation(null, 4)).toEqual(emptyAllocation());
    expect(STAT_IDS).toEqual(['duration', 'cooldown', 'speed', 'range']);
  });
  it('turns points into modest capped modifiers', () => {
    const full = modifiersFor({ duration: 8, cooldown: 8, speed: 8, range: 8 });
    expect(full.duration).toBeCloseTo(1 + STAT_CAP * DURATION_PER_POINT, 8);
    expect(full.cooldown).toBeCloseTo(Math.max(COOLDOWN_MIN, 1 - STAT_CAP * COOLDOWN_PER_POINT), 8);
    expect(full.speed).toBeCloseTo(1 + STAT_CAP * SPEED_PER_POINT, 8);
    expect(full.range).toBeCloseTo(STAT_CAP * RANGE_PER_POINT, 8);
    expect(full.cooldown).toBeGreaterThanOrEqual(COOLDOWN_MIN);
    expect(modifiersFor({ duration: 40, cooldown: 40, speed: -2, range: 1 }).duration).toBeCloseTo(full.duration, 8);
  });
  it('persists an allocation and rereads it against the badges still owned', () => {
    const storage = memory();
    const allocation = adjustAllocation(adjustAllocation(emptyAllocation(), 'range', 1, 2), 'speed', 1, 2);
    writeAllocation(allocation, storage);
    expect(readAllocation(2, storage)).toEqual(allocation);
    expect(readAllocation(1, storage).range).toBe(0);
    expect(readAllocation(1, storage).speed).toBe(1);
    expect(readAllocation(2, { getItem: () => '{' })).toEqual(emptyAllocation());
  });
});
