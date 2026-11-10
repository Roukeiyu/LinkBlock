export type RewardId = 'clear' | 'ninety' | 'perfect';
export interface Codex { clear: boolean; ninety: boolean; perfect: boolean }

export const EMPTY_CODEX: Codex = { clear: false, ninety: false, perfect: false };

export function freshUnlocks(before: Codex, percent: number, lives: number): RewardId[] {
  const earned: RewardId[] = ['clear'];
  if (percent >= 90 - 1e-4) earned.push('ninety');
  if (lives >= 3) earned.push('perfect');
  return earned.filter(id => !before[id]);
}

export function applyUnlocks(before: Codex, percent: number, lives: number): { codex: Codex; fresh: RewardId[] } {
  const fresh = freshUnlocks(before, percent, lives);
  const codex = { ...before };
  if (percent >= 0) codex.clear = true;
  if (percent >= 90 - 1e-4) codex.ninety = true;
  if (lives >= 3) codex.perfect = true;
  return { codex, fresh };
}

const KEY = 'linkblock.fenglin.codex';

export function readCodex(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Codex {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...EMPTY_CODEX };
    const parsed = JSON.parse(raw) as Partial<Codex>;
    return { clear: !!parsed.clear, ninety: !!parsed.ninety, perfect: !!parsed.perfect };
  } catch {
    return { ...EMPTY_CODEX };
  }
}

export function writeCodex(codex: Codex, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(codex)); } catch { /* Private mode can reject storage; the run still finishes. */ }
}
