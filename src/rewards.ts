export type RewardId = 'clear' | 'ninety' | 'perfect';
export interface LevelRewards { clear: boolean; ninety: boolean; perfect: boolean }
/** Level 1 stays on the original fields so an existing save still opens 阿澈. Later levels live under `levels`. */
export interface Codex extends LevelRewards { levels?: Record<number, LevelRewards> }

export const EMPTY_CODEX: Codex = { clear: false, ninety: false, perfect: false };

const blank = (): LevelRewards => ({ clear: false, ninety: false, perfect: false });
const flag = (value: unknown) => value === true;

export function rewardsFor(codex: Codex, levelId = 1): LevelRewards {
  if (levelId <= 1) return { clear: flag(codex.clear), ninety: flag(codex.ninety), perfect: flag(codex.perfect) };
  const found = codex.levels?.[levelId];
  return found ? { clear: flag(found.clear), ninety: flag(found.ninety), perfect: flag(found.perfect) } : blank();
}

/** Do not display orphan legacy gallery flags as earned rewards. */
export function codexForProgress(codex: Codex, cleared: readonly number[]): Codex {
  const levels: Record<number, LevelRewards> = {};
  for (const id of cleared) if (id >= 2 && id <= 5) levels[id] = { ...rewardsFor(codex, id), clear: true };
  const first = cleared.includes(1) ? { ...rewardsFor(codex, 1), clear: true } : blank();
  return { ...first, levels };
}

export function freshUnlocks(before: Codex, percent: number, lives: number, levelId = 1): RewardId[] {
  const state = rewardsFor(before, levelId);
  const earned: RewardId[] = ['clear'];
  if (percent >= 90 - 1e-4) earned.push('ninety');
  if (lives >= 3) earned.push('perfect');
  return earned.filter(id => !state[id]);
}

export function applyUnlocks(before: Codex, percent: number, lives: number, levelId = 1): { codex: Codex; fresh: RewardId[] } {
  const fresh = freshUnlocks(before, percent, lives, levelId);
  const next = rewardsFor(before, levelId);
  if (percent >= 0) next.clear = true;
  if (percent >= 90 - 1e-4) next.ninety = true;
  if (lives >= 3) next.perfect = true;
  if (levelId <= 1) return { codex: { ...before, ...next }, fresh };
  return { codex: { ...before, levels: { ...before.levels, [levelId]: next } }, fresh };
}

const KEY = 'linkblock.fenglin.codex';

export function readCodex(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Codex {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...EMPTY_CODEX };
    const parsed = JSON.parse(raw) as Partial<Codex> & { levels?: Record<string, Partial<LevelRewards>> };
    const levels: Record<number, LevelRewards> = {};
    if (parsed.levels && typeof parsed.levels === 'object') {
      for (const [id, value] of Object.entries(parsed.levels)) {
        const levelId = Number(id);
        if (!Number.isInteger(levelId) || levelId < 2 || levelId > 5 || !value || typeof value !== 'object') continue;
        levels[levelId] = { clear: flag(value.clear), ninety: flag(value.ninety), perfect: flag(value.perfect) };
      }
    }
    return { clear: flag(parsed.clear), ninety: flag(parsed.ninety), perfect: flag(parsed.perfect), levels };
  } catch {
    return { ...EMPTY_CODEX };
  }
}

export function writeCodex(codex: Codex, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(codex)); } catch { /* Private mode can reject storage; the run still finishes. */ }
}
