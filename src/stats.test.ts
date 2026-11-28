import { describe, expect, it } from 'vitest';
import { EMPTY_CODEX, applyUnlocks } from './rewards';
import { LEVELS } from './levels';
import { POWER_UP_RADIUS, POWER_UP_SPAWN_GAP, PICKUP_BODY_RADIUS, contactReach } from './powerups';
import {
  COOLDOWN_MIN, COOLDOWN_PER_POINT, DURATION_PER_POINT, LINE_HIT_PADDING, RANGE_PER_POINT, SLAY_LENGTH_PER_RANK, SPEED_PER_POINT, STAT_CAP, STAT_COST, STAT_IDS, STATS_KEY,
  adjustAllocation, badgePoints, emptyAllocation, modifiersFor, normalizeAllocation, readAllocation, slayLength, slayReach, spent, writeAllocation,
} from './stats';
import { ENEMY_STYLES, enemyHitRadius, createEnemy } from './enemies';

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
    expect(allocation).toEqual({ duration: 0, cooldown: 0, speed: 2, range: 1, slay: 0 });
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
    expect(normalizeAllocation({ duration: 10.9, cooldown: 8, speed: -3, range: 4, combo: 9 }, 12)).toEqual({ duration: 10, cooldown: 2, speed: 0, range: 0, slay: 0 });
    expect(normalizeAllocation({ duration: 10, slay: 3 }, 12)).toEqual({ duration: 10, cooldown: 0, speed: 0, range: 0, slay: 1 });
    expect(normalizeAllocation(null, 4)).toEqual(emptyAllocation());
    expect(STAT_IDS).toEqual(['duration', 'cooldown', 'speed', 'range', 'slay']);
  });
  it('spends two points per 镇杀 rank, rejects a single leftover point, and refunds the pair', () => {
    let allocation = emptyAllocation();
    allocation = adjustAllocation(allocation, 'slay', 1, 3);
    expect(allocation.slay).toBe(1);
    expect(spent(allocation)).toBe(2);
    expect(adjustAllocation(allocation, 'slay', 1, 3)).toBe(allocation);
    allocation = adjustAllocation(allocation, 'slay', -1, 3);
    expect(allocation).toEqual(emptyAllocation());
    allocation = adjustAllocation(allocation, 'speed', 1, 3);
    expect(spent(allocation)).toBe(1);
    let capped = emptyAllocation();
    for (let i = 0; i < 30; i++) capped = adjustAllocation(capped, 'slay', 1, 100);
    expect(capped.slay).toBe(STAT_CAP);
    expect(spent(capped)).toBe(STAT_CAP * STAT_COST.slay);
    expect(adjustAllocation(capped, 'slay', 1, 100)).toBe(capped);
  });
  it('turns points into modest capped modifiers', () => {
    const full = modifiersFor({ duration: STAT_CAP, cooldown: STAT_CAP, speed: STAT_CAP, range: STAT_CAP, slay: 0 });
    expect(full.duration).toBeCloseTo(1 + STAT_CAP * DURATION_PER_POINT, 8);
    expect(full.cooldown).toBeCloseTo(Math.max(COOLDOWN_MIN, 1 - STAT_CAP * COOLDOWN_PER_POINT), 8);
    expect(full.speed).toBeCloseTo(1 + STAT_CAP * SPEED_PER_POINT, 8);
    expect(full.range).toBeCloseTo(STAT_CAP * RANGE_PER_POINT, 8);
    expect(full.cooldown).toBe(COOLDOWN_MIN);
    const ninth = modifiersFor({ ...emptyAllocation(), cooldown: STAT_CAP - 1 });
    expect(ninth.cooldown).toBeGreaterThan(full.cooldown);
    expect(ninth.cooldown).toBeCloseTo(1 - (STAT_CAP - 1) * COOLDOWN_PER_POINT, 8);
    expect(contactReach(full.range)).toBeCloseTo(POWER_UP_RADIUS + PICKUP_BODY_RADIUS + STAT_CAP * RANGE_PER_POINT, 8);
    expect(contactReach(full.range)).toBeLessThan(POWER_UP_SPAWN_GAP);
    const core = enemyHitRadius(createEnemy('straight', { x: 0, y: 0 }));
    expect(core).toBeCloseTo(ENEMY_STYLES.straight.radius * 0.85, 8);
    expect(slayReach(0, core)).toBe(0);
    expect(slayReach(1, core)).toBeCloseTo(core + LINE_HIT_PADDING, 8);
    expect(slayReach(4, core)).toBeCloseTo(slayReach(1, core), 8);
    expect(slayReach(STAT_CAP, core)).toBeCloseTo(slayReach(1, core), 8);
    expect(slayLength(0)).toBe(0);
    expect(slayLength(1)).toBe(SLAY_LENGTH_PER_RANK);
    expect(slayLength(4)).toBe(4 * SLAY_LENGTH_PER_RANK);
    expect(slayLength(STAT_CAP)).toBe(STAT_CAP * SLAY_LENGTH_PER_RANK);
    expect(slayLength(4)).toBeGreaterThan(slayLength(1) * 3);
    expect(slayLength(STAT_CAP)).toBeGreaterThan(slayLength(4) * 2);
    expect(modifiersFor({ ...emptyAllocation(), duration: 40, speed: -2 }).duration).toBeCloseTo(full.duration, 8);
  });
  it('persists an allocation and rereads it against the badges still owned', () => {
    const storage = memory();
    const allocation = adjustAllocation(adjustAllocation(emptyAllocation(), 'range', 1, 2), 'speed', 1, 2);
    writeAllocation(allocation, storage);
    expect(readAllocation(2, storage)).toEqual(allocation);
    expect(readAllocation(1, storage).range).toBe(0);
    expect(readAllocation(1, storage).speed).toBe(1);
    expect(readAllocation(2, { getItem: () => '{' })).toEqual(emptyAllocation());
    const legacy = memory();
    legacy.setItem(STATS_KEY, JSON.stringify({ duration: 2, cooldown: 0, speed: 0, range: 1 }));
    expect(readAllocation(5, legacy)).toEqual({ duration: 2, cooldown: 0, speed: 0, range: 1, slay: 0 });
  });
});
