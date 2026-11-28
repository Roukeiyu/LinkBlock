import { LEVELS } from './levels';
import { rewardsFor, type Codex, type LevelRewards } from './rewards';

export const STAT_IDS = ['duration', 'cooldown', 'speed', 'range', 'slay'] as const;
export type StatId = typeof STAT_IDS[number];
export const STAT_LABELS: Record<StatId, string> = {
  duration: '道具持续时间',
  cooldown: '冷却缩短',
  speed: '移速',
  range: '拾取范围',
  slay: '镇杀',
};
export const STAT_NOTES: Record<StatId, string> = {
  duration: '每点 +8% 效果时间',
  cooldown: '每点缩短下一枚道具的等待 6%',
  speed: '每点 +4% 移动与收线',
  range: '每点 +0.12 拾取距离',
  slay: '每级消耗 2 点。等级越高，能拉出的朱砂镇杀线越长',
};
/** Badge points spent for one displayed rank. 镇杀 is the only double-cost stat. */
export const STAT_COST: Record<StatId, number> = {
  duration: 1, cooldown: 1, speed: 1, range: 1, slay: 2,
};
/** Ten ranks is the cap. Four single-cost stats use 40 points; 镇杀 uses the other 20. */
export const STAT_CAP = 10;
export const DURATION_PER_POINT = 0.08;
export const COOLDOWN_PER_POINT = 0.06;
/**
 * Respawn wait bottoms out at 40% of the base delay.
 * Ten points of 6% each land exactly on this floor, so the 9th and 10th points still shorten the wait.
 */
export const COOLDOWN_MIN = 0.4;
export const SPEED_PER_POINT = 0.04;
export const RANGE_PER_POINT = 0.12;
/** Padding already used when an enemy core touches the drawn line. 镇杀 kills at this same tight distance at every rank. */
export const LINE_HIT_PADDING = 0.12;
/**
 * Slay-capable line, in world units, granted by one 镇杀 rank.
 * The playfield is 72×48. 18 is a quarter of the long side: one short jab, not a tour of the level.
 * Four ranks reach 72, one full long side. Ten ranks reach 180, two and a half long sides.
 */
export const SLAY_LENGTH_PER_RANK = 18;
export const STATS_KEY = 'linkblock.fenglin.stats';
export const PROGRESS_STORAGE_KEYS = ['linkblock.fenglin.levels', 'linkblock.fenglin.codex', STATS_KEY] as const;
/** Most badge points a full allocation can spend. Saves are not trimmed below this on write. */
export const STAT_POINT_BUDGET = STAT_IDS.reduce((sum, id) => sum + STAT_CAP * STAT_COST[id], 0);

export interface StatAllocation { duration: number; cooldown: number; speed: number; range: number; slay: number }
export interface RunModifiers { duration: number; cooldown: number; speed: number; range: number; slay: number }

export const emptyAllocation = (): StatAllocation => ({ duration: 0, cooldown: 0, speed: 0, range: 0, slay: 0 });

const flags = (rewards: LevelRewards) => Number(rewards.clear) + Number(rewards.ninety) + Number(rewards.perfect);

/** One point for each earned badge across the campaign. */
export function badgePoints(codex: Codex) {
  return LEVELS.reduce((sum, level) => sum + flags(rewardsFor(codex, level.id)), 0);
}

export function spent(allocation: StatAllocation) {
  return STAT_IDS.reduce((sum, id) => sum + allocation[id] * STAT_COST[id], 0);
}

/** Total slay-line length for a rank. Zero ranks grant none. The pool is linear in rank. */
export function slayLength(rank: number) {
  return clampedPoints(rank) * SLAY_LENGTH_PER_RANK;
}

/** Distance from the slay portion of the ink that kills a regular enemy. Rank does not widen it. */
export function slayReach(rank: number, hitRadius: number) {
  if (clampedPoints(rank) <= 0) return 0;
  return Math.max(0, hitRadius) + LINE_HIT_PADDING;
}

function clampedPoints(value: unknown) {
  const points = Math.floor(Number(value));
  return Number.isFinite(points) ? Math.max(0, Math.min(STAT_CAP, points)) : 0;
}

/** Drop illegal, fractional and overspent points. Later stats give up whole ranks first. */
export function normalizeAllocation(raw: unknown, points: number): StatAllocation {
  const next = emptyAllocation();
  const source = raw && typeof raw === 'object' ? raw as Partial<StatAllocation> : {};
  for (const id of STAT_IDS) next[id] = clampedPoints(source[id]);
  let extra = spent(next) - Math.max(0, Math.floor(points));
  for (let i = STAT_IDS.length - 1; i >= 0 && extra > 0; i--) {
    const id = STAT_IDS[i];
    while (next[id] > 0 && extra > 0) {
      next[id] -= 1;
      extra -= STAT_COST[id];
    }
  }
  return next;
}

/** Free respec. Rejects a step that would go below zero, past the cap, or past the earned points. */
export function adjustAllocation(current: StatAllocation, id: StatId, delta: number, points: number): StatAllocation {
  if (!Number.isInteger(delta) || delta === 0) return current;
  const next = { ...current, [id]: current[id] + delta };
  if (next[id] < 0 || next[id] > STAT_CAP) return current;
  if (delta > 0 && spent(next) > points) return current;
  return next;
}

export function modifiersFor(allocation: StatAllocation): RunModifiers {
  const duration = clampedPoints(allocation.duration);
  const cooldown = clampedPoints(allocation.cooldown);
  const speed = clampedPoints(allocation.speed);
  const range = clampedPoints(allocation.range);
  return {
    duration: 1 + duration * DURATION_PER_POINT,
    cooldown: Math.max(COOLDOWN_MIN, 1 - cooldown * COOLDOWN_PER_POINT),
    speed: 1 + speed * SPEED_PER_POINT,
    range: range * RANGE_PER_POINT,
    slay: clampedPoints(allocation.slay),
  };
}

export function readAllocation(points: number, storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): StatAllocation {
  try {
    const raw = storage?.getItem(STATS_KEY);
    return normalizeAllocation(raw ? JSON.parse(raw) : undefined, points);
  } catch {
    return emptyAllocation();
  }
}

export function writeAllocation(allocation: StatAllocation, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { storage?.setItem(STATS_KEY, JSON.stringify(normalizeAllocation(allocation, STAT_POINT_BUDGET))); } catch { /* Private mode can reject storage. */ }
}
