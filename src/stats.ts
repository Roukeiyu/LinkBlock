import { LEVELS } from './levels';
import { rewardsFor, type Codex, type LevelRewards } from './rewards';

export const STAT_IDS = ['duration', 'cooldown', 'speed', 'range'] as const;
export type StatId = typeof STAT_IDS[number];
export const STAT_LABELS: Record<StatId, string> = {
  duration: '道具持续时间',
  cooldown: '冷却缩短',
  speed: '移速',
  range: '拾取范围',
};
export const STAT_NOTES: Record<StatId, string> = {
  duration: '每点 +8% 效果时间',
  cooldown: '每点缩短下一枚道具的等待 6%',
  speed: '每点 +4% 移动与收线',
  range: '每点 +0.12 拾取距离',
};
/** Eight points is the useful cap for every stat. Extra badges stay unspent. */
export const STAT_CAP = 8;
export const DURATION_PER_POINT = 0.08;
export const COOLDOWN_PER_POINT = 0.06;
/** Respawn wait never drops below half, even if the cap changes. */
export const COOLDOWN_MIN = 0.5;
export const SPEED_PER_POINT = 0.04;
export const RANGE_PER_POINT = 0.12;
export const STATS_KEY = 'linkblock.fenglin.stats';
export const PROGRESS_STORAGE_KEYS = ['linkblock.fenglin.levels', 'linkblock.fenglin.codex', STATS_KEY] as const;

export interface StatAllocation { duration: number; cooldown: number; speed: number; range: number }
export interface RunModifiers { duration: number; cooldown: number; speed: number; range: number }

export const emptyAllocation = (): StatAllocation => ({ duration: 0, cooldown: 0, speed: 0, range: 0 });

const flags = (rewards: LevelRewards) => Number(rewards.clear) + Number(rewards.ninety) + Number(rewards.perfect);

/** One point for each earned badge across the campaign. */
export function badgePoints(codex: Codex) {
  return LEVELS.reduce((sum, level) => sum + flags(rewardsFor(codex, level.id)), 0);
}

export function spent(allocation: StatAllocation) {
  return STAT_IDS.reduce((sum, id) => sum + allocation[id], 0);
}

function clampedPoints(value: unknown) {
  const points = Math.floor(Number(value));
  return Number.isFinite(points) ? Math.max(0, Math.min(STAT_CAP, points)) : 0;
}

/** Drop illegal, fractional and overspent points. Later stats give up points first. */
export function normalizeAllocation(raw: unknown, points: number): StatAllocation {
  const next = emptyAllocation();
  const source = raw && typeof raw === 'object' ? raw as Partial<StatAllocation> : {};
  for (const id of STAT_IDS) next[id] = clampedPoints(source[id]);
  let extra = spent(next) - Math.max(0, Math.floor(points));
  for (let i = STAT_IDS.length - 1; i >= 0 && extra > 0; i--) {
    const id = STAT_IDS[i];
    const cut = Math.min(next[id], extra);
    next[id] -= cut;
    extra -= cut;
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
  try { storage?.setItem(STATS_KEY, JSON.stringify(normalizeAllocation(allocation, STAT_IDS.length * STAT_CAP))); } catch { /* Private mode can reject storage. */ }
}
