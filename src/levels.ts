import { lakeBossConfig, type BossConfig } from './boss';
import { LevelAttack, type AttackPattern } from './level-attacks';
import type { EnemyMotion } from './enemies';
import { faceProtection, type FaceArtwork } from './faces';
import type { GameOptions } from './engine';
import type { SpriteSheet } from './render-enemies';

export interface Squad {
  straight: number;
  orbit: number;
  zigzag: number;
}

export interface LevelDef {
  id: number;
  difficulty: string;
  tactic: string;
  enemyMotion?: EnemyMotion;
  attackPattern?: AttackPattern;
  theme: string;
  title: string;
  restored: FaceArtwork;
  sealed: string;
  mask: string;
  /** File stem in public/audio/, without extension. Opus is preferred, mp3 is the fallback. */
  music: string;
  portraitSealed: string;
  portraitRescued: string;
  /** Every tier uses the same 1536 × 1024 canvas. */
  rewardNinety: string;
  rewardPerfect: string;
  /** Three straight-moving looks, then the orbiter, the zigzag, and the boss. */
  names: { straight: [string, string, string]; orbit: string; zigzag: string; boss: string };
  sprites: SpriteSheet;
  /** Multiplier on the level-1 enemy speeds. 1 leaves them untouched. */
  enemySpeed: number;
  bossSpeed: number;
  squad: Squad;
  /** Multipliers on the base reinforcement interval (4 seconds) and speed (8). */
  reinforceInterval: number;
  reinforceSpeed: number;
  /** UI accent for this level. Chrome stays the same; only this tint changes. */
  accent: string;
}

const sheet = (dir: string, files: [string, string, string, string, string, string]): SpriteSheet => ({
  mist: `${dir}/${files[0]}`,
  thorn: `${dir}/${files[1]}`,
  ghost: `${dir}/${files[2]}`,
  spore: `${dir}/${files[3]}`,
  crow: `${dir}/${files[4]}`,
  tree: `${dir}/${files[5]}`,
});

export const LEVELS: LevelDef[] = [
  {
    difficulty: '入门', tactic: '小怪匀速巡游；首领十字与 X 交替，残血改为八向散射。看清空隙再出线。',
    id: 1, theme: '狼人', title: '第一关 · 月下封林',
    restored: 'levels/1/v8/restored.webp', sealed: 'levels/1/v8/sealed.webp', mask: 'levels/1/v8/mask.png', music: 'moonlit-grove',
    portraitSealed: 'levels/1/v8/portrait-sealed.webp', portraitRescued: 'levels/1/v8/portrait.webp',
    rewardNinety: 'levels/1/v8/ninety.webp', rewardPerfect: 'levels/1/v8/perfect.webp',
    names: { straight: ['腐风', '灰孢', '咒鸦'], orbit: '荆蚀', zigzag: '残魂', boss: '蚀根' },
    sprites: { ...sheet('levels/1/v3', ['mist.webp', 'thorn.webp', 'ghost.webp', 'spore.webp', 'crow.webp', 'boss.webp']), tree: 'sprites/boss_shigen.png', turn: ['crow'] },
    enemySpeed: 1, bossSpeed: 1, squad: { straight: 2, orbit: 2, zigzag: 2 }, reinforceInterval: 1.5, reinforceSpeed: 1,
    accent: '#c5d4e6',
  },
  {
    difficulty: '进阶', tactic: '小怪匀速巡游；首领瞄准扇射。预警出现后侧移，趁发射间隔圈地。',
    enemyMotion: { straight: 'steady', period: 2.8, orbitRate: 0.5, zigzagInterval: 1.1, zigzagAngle: Math.PI / 3 }, attackPattern: 'sand',
    id: 2, theme: '木乃伊', title: '第二关 · 沙漠神殿',
    restored: 'levels/2/v8/restored.webp', sealed: 'levels/2/v8/sealed.webp', mask: 'levels/2/v8/mask.png', music: 'desert-temple',
    portraitSealed: 'levels/2/v8/portrait-sealed.webp', portraitRescued: 'levels/2/v8/portrait.webp',
    rewardNinety: 'levels/2/v8/ninety.webp', rewardPerfect: 'levels/2/v8/perfect.webp',
    names: { straight: ['流沙', '缠布', '豺影'], orbit: '圣甲', zigzag: '罐灵', boss: '沙傀王' },
    sprites: sheet('levels/2', ['enemy_liusha.png', 'enemy_shengjia.png', 'enemy_guanling.png', 'enemy_chanbu.png', 'enemy_chaiying.png', 'boss_shakuiwang.png']),
    enemySpeed: 1.05, bossSpeed: 1.04, squad: { straight: 3, orbit: 2, zigzag: 2 }, reinforceInterval: 1.375, reinforceSpeed: 1.05,
    accent: '#e0c27a',
  },
  {
    difficulty: '挑战', tactic: '小怪匀速巡游，定时直角转向；电弧每轮旋转，残血六向齐射。避免长时间停在旧空隙。',
    enemyMotion: { straight: 'corner', period: 1.1, orbitRate: 1.4, zigzagInterval: 0.48, zigzagAngle: Math.PI / 2 }, attackPattern: 'storm',
    id: 3, theme: '弗兰肯斯坦', title: '第三关 · 雷雨实验室',
    restored: 'levels/3/v8/restored.webp', sealed: 'levels/3/v8/sealed.webp', mask: 'levels/3/v8/mask.png', music: 'storm-lab',
    portraitSealed: 'levels/3/portrait_sealed.png', portraitRescued: 'levels/3/portrait_rescued.png',
    rewardNinety: 'levels/3/v8/ninety.webp', rewardPerfect: 'levels/3/v8/perfect.webp',
    names: { straight: ['电弧', '齿轮魂', '雷鼠'], orbit: '缝偶', zigzag: '酸雾', boss: '狂电塔' },
    sprites: sheet('levels/3', ['enemy_dianhu.png', 'enemy_fengou.png', 'enemy_suanwu.png', 'enemy_chilunhun.png', 'enemy_leishu.png', 'boss_kuangdianta.png']),
    enemySpeed: 1.1, bossSpeed: 1.08, squad: { straight: 3, orbit: 3, zigzag: 2 }, reinforceInterval: 1.25, reinforceSpeed: 1.1,
    accent: '#2ed3c6',
  },
  {
    difficulty: '高难', tactic: '小怪匀速沿弧线游走；双翼弹幕夹击预警方向两侧。辨认中央通道，短线分次圈地。',
    enemyMotion: { straight: 'curve', period: 2.4, orbitRate: 1.15, zigzagInterval: 0.6, zigzagAngle: Math.PI * 0.55 }, attackPattern: 'rose',
    id: 4, theme: '吸血鬼', title: '第四关 · 玫瑰古堡',
    restored: 'levels/4/v8/restored.webp', sealed: 'levels/4/v8/sealed.webp', mask: 'levels/4/v8/mask.png', music: 'rose-waltz',
    portraitSealed: 'levels/4/v8/portrait-sealed.webp', portraitRescued: 'levels/4/v8/portrait.webp',
    rewardNinety: 'levels/4/v8/ninety.webp', rewardPerfect: 'levels/4/v8/perfect.webp',
    names: { straight: ['血蝠', '棘玫瑰', '棺鸦'], orbit: '红雾', zigzag: '镜影', boss: '血月石像' },
    sprites: { ...sheet('levels/4/v3', ['mist.webp', 'thorn.webp', 'ghost.webp', 'spore.webp', 'crow.webp', 'boss.webp']), tree: 'levels/4/boss_xueyueshixiang.png' },
    enemySpeed: 1.15, bossSpeed: 1.12, squad: { straight: 3, orbit: 3, zigzag: 3 }, reinforceInterval: 1.125, reinforceSpeed: 1.15,
    accent: '#e25b78',
  },
  {
    difficulty: '高阶', tactic: '小怪频繁冲锋；首领环射留下旋转缺口，残血加速。先找缺口，再趁间隔画线。',
    enemyMotion: { straight: 'surge', period: 1.6, orbitRate: 1.65, zigzagInterval: 0.42, zigzagAngle: Math.PI * 0.45 }, attackPattern: 'hunt',
    id: 5, theme: '无头骑士', title: '第五关 · 秋夜南瓜谷',
    restored: 'levels/5/v8/restored.webp', sealed: 'levels/5/v8/sealed.webp', mask: 'levels/5/v8/mask.png', music: 'autumn-ride-suno-v1',
    portraitSealed: 'levels/5/portrait_sealed.png', portraitRescued: 'levels/5/portrait_rescued.png',
    rewardNinety: 'levels/5/v8/ninety.webp', rewardPerfect: 'levels/5/v8/perfect.webp',
    names: { straight: ['鬼火', '铁蹄', '断缰'], orbit: '南瓜灵', zigzag: '落叶旋', boss: '秋猎魔骑' },
    sprites: sheet('levels/5', ['enemy_guihuo.png', 'enemy_nangualing.png', 'enemy_luoyexuan.png', 'enemy_tieti.png', 'enemy_duanjiang.png', 'boss_qiuliemoqi.png']),
    enemySpeed: 1.2, bossSpeed: 1.16, squad: { straight: 4, orbit: 3, zigzag: 3 }, reinforceInterval: 1, reinforceSpeed: 1.2,
    accent: '#f08a3c',
  },
  {
    id: 6, theme: '海妖', title: '第六关 · 沉潮王庭', difficulty: '深海',
    tactic: '小怪沿潮汐弧线游走；首领快慢双潮错位扩散。先避快潮，别急着穿过慢潮。', attackPattern: 'tide',
    enemyMotion: { straight: 'curve', period: 3.2, orbitRate: 0.65, zigzagInterval: 0.8, zigzagAngle: 1.1 },
    restored: 'levels/6/v7/restored.webp', sealed: 'levels/6/v7/sealed.webp', mask: 'levels/6/v3/mask.png', music: 'sunken-court-suno-v1',
    portraitSealed: 'levels/6/v7/portrait-sealed.webp', portraitRescued: 'levels/6/v7/portrait.webp',
    rewardNinety: 'levels/6/v7/ninety.webp', rewardPerfect: 'levels/6/v4/perfect.webp',
    names: { straight: ['潮沫', '礁刺', '溺影'], orbit: '涡灵', zigzag: '暗鳐', boss: '渊潮巨螺' },
    sprites: sheet('levels/6/v2', ['mist.webp', 'thorn.webp', 'ghost.webp', 'spore.webp', 'crow.webp', 'boss.webp']),
    enemySpeed: 1.24, bossSpeed: 1.2, squad: { straight: 5, orbit: 4, zigzag: 4 }, reinforceInterval: 0.7, reinforceSpeed: 1.22, accent: '#55d9df',
  },
  {
    id: 7, theme: '狐妖', title: '第七关 · 狐火神社', difficulty: '幻术',
    tactic: '小怪定时折返；首领朝三个方向释放狐火扇。预警后侧移，注意身后折返的小怪。', attackPattern: 'fox',
    enemyMotion: { straight: 'reverse', period: 1.9, orbitRate: 1.35, zigzagInterval: 0.5, zigzagAngle: 1.4 },
    restored: 'levels/7/v3/restored.webp', sealed: 'levels/7/v3/sealed.webp', mask: 'levels/7/v3/mask.png', music: 'fox-shrine-suno-v1',
    portraitSealed: 'levels/7/v3/portrait-sealed.webp', portraitRescued: 'levels/7/v3/portrait.webp',
    rewardNinety: 'levels/7/v3/ninety.webp', rewardPerfect: 'levels/7/v4/perfect.webp',
    names: { straight: ['纸符', '灯妖', '狐焰'], orbit: '铃灵', zigzag: '面影', boss: '九灯妖镜' },
    sprites: sheet('levels/7/v2', ['mist.webp', 'thorn.webp', 'ghost.webp', 'spore.webp', 'crow.webp', 'boss.webp']),
    enemySpeed: 1.28, bossSpeed: 1.23, squad: { straight: 5, orbit: 4, zigzag: 5 }, reinforceInterval: 0.67, reinforceSpeed: 1.24, accent: '#f3b87b',
  },
  {
    id: 8, theme: '冰霜巨人', title: '第八关 · 极光冰座', difficulty: '严寒',
    tactic: '小怪走冰面直角路线；首领交替水平与竖直冰晶排射。沿本轮开放方向移动。', attackPattern: 'frost',
    enemyMotion: { straight: 'corner', period: 0.95, orbitRate: 0.7, zigzagInterval: 0.85, zigzagAngle: 1.57 },
    restored: 'levels/8/v3/restored.webp', sealed: 'levels/8/v3/sealed.webp', mask: 'levels/8/v3/mask.png', music: 'aurora-throne-suno-v1',
    portraitSealed: 'levels/8/v3/portrait-sealed.webp', portraitRescued: 'levels/8/v3/portrait.webp',
    rewardNinety: 'levels/8/v4/ninety.webp', rewardPerfect: 'levels/8/v4/perfect.webp',
    names: { straight: ['冰棱', '雪魄', '霜狼'], orbit: '冰环', zigzag: '裂晶', boss: '永冻方碑' },
    sprites: sheet('levels/8/v2', ['mist.webp', 'thorn.webp', 'ghost.webp', 'spore.webp', 'crow.webp', 'boss.webp']),
    enemySpeed: 1.32, bossSpeed: 1.26, squad: { straight: 5, orbit: 5, zigzag: 5 }, reinforceInterval: 0.64, reinforceSpeed: 1.26, accent: '#89cdff',
  },
  {
    id: 9, theme: '石像鬼', title: '第九关 · 暮钟圣城', difficulty: '险境',
    tactic: '小怪巡行后突然折返；首领四翼石羽逐轮旋转。观察翼间通道，避免贪长线。', attackPattern: 'gargoyle',
    enemyMotion: { straight: 'reverse', period: 1.4, orbitRate: 1.75, zigzagInterval: 0.46, zigzagAngle: 1.4 },
    restored: 'levels/9/v3/restored.webp', sealed: 'levels/9/v3/sealed.webp', mask: 'levels/9/v3/mask.png', music: 'dusk-belfry-suno-v1',
    portraitSealed: 'levels/9/v3/portrait-sealed.webp', portraitRescued: 'levels/9/v3/portrait.webp',
    rewardNinety: 'levels/9/v7/ninety.webp', rewardPerfect: 'levels/9/v8/perfect.webp',
    names: { straight: ['碎翼', '钟尘', '石鸦'], orbit: '铜环', zigzag: '影像', boss: '暮钟石卫' },
    sprites: sheet('levels/9/v2', ['mist.webp', 'thorn.webp', 'ghost.webp', 'spore.webp', 'crow.webp', 'boss.webp']),
    enemySpeed: 1.36, bossSpeed: 1.29, squad: { straight: 6, orbit: 5, zigzag: 5 }, reinforceInterval: 0.61, reinforceSpeed: 1.28, accent: '#b8a4eb',
  },
  {
    id: 10, theme: '炎魔', title: '第十关 · 熔冠终庭', difficulty: '终章',
    tactic: '小怪高速冲锋；首领交替缺口火环与双向瞄准扇射。每轮先读预警，再选择逃生方向。', attackPattern: 'inferno',
    enemyMotion: { straight: 'surge', period: 1.35, orbitRate: 1.8, zigzagInterval: 0.4, zigzagAngle: 1.5 },
    restored: 'levels/10/v3/restored.webp', sealed: 'levels/10/v3/sealed.webp', mask: 'levels/10/v3/mask.png', music: 'ember-crown-suno-v1',
    portraitSealed: 'levels/10/v3/portrait-sealed.webp', portraitRescued: 'levels/10/v3/portrait.webp',
    rewardNinety: 'levels/10/v3/ninety.webp', rewardPerfect: 'levels/10/v8/perfect.webp',
    names: { straight: ['烬火', '熔爪', '焰鸦'], orbit: '火环', zigzag: '灰魂', boss: '熔冠魔像' },
    sprites: sheet('levels/10/v2', ['mist.webp', 'thorn.webp', 'ghost.webp', 'spore.webp', 'crow.webp', 'boss.webp']),
    enemySpeed: 1.4, bossSpeed: 1.32, squad: { straight: 6, orbit: 6, zigzag: 5 }, reinforceInterval: 0.58, reinforceSpeed: 1.3, accent: '#ff805a',
  },
];

export const levelById = (id: number) => LEVELS.find(level => level.id === id) ?? LEVELS[0];

/** Early levels retain their starting population cap through every boss phase. */
export function bossConfigFor(level: LevelDef): BossConfig {
  const early = level.id <= 5;
  const count = level.squad.straight + level.squad.orbit + level.squad.zigzag;
  return {
    maxHealth: lakeBossConfig.maxHealth,
    jumpDuration: lakeBossConfig.jumpDuration,
    phases: lakeBossConfig.phases?.map((phase, stage) => ({
      ...phase,
      createAttack: level.attackPattern ? () => new LevelAttack(level.attackPattern!, stage) : phase.createAttack,
      reinforcements: phase.reinforcements ? {
        ...phase.reinforcements,
        targetCount: early ? count : stage === 2 ? 13 + level.id : 8 + level.id,
        batchSize: early ? 1 : phase.reinforcements.batchSize,
        interval: phase.reinforcements.interval * level.reinforceInterval,
        speed: phase.reinforcements.speed * level.reinforceSpeed,
      } : undefined,
    })),
  };
}

/** Shared by the page and simulation tests, including restart and next-level. */
export function gameOptionsFor(level: LevelDef): GameOptions {
  return { opening: true, openingFace: faceProtection(level.restored), bossConfig: bossConfigFor(level), squad: level.squad,
    speedScale: level.enemySpeed, bossSpeedScale: level.bossSpeed, enemyMotion: level.enemyMotion };
}

export interface LevelProgress { unlocked: number; cleared: number[] }
const KEY = 'linkblock.fenglin.levels';

export function readLevelProgress(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): LevelProgress {
  const empty = (): LevelProgress => ({ unlocked: 1, cleared: [] });
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    const unlocked = Math.round(Number(parsed.unlocked));
    if (!Number.isFinite(unlocked)) return empty();
    let available = Math.min(LEVELS.length, Math.max(1, unlocked));
    let cleared: number[] = [];
    if (parsed.version === 2 || parsed.version === 3) {
      if (Array.isArray(parsed.cleared)) cleared = LEVELS.map(level => level.id)
        .filter(id => id <= available && parsed.cleared.includes(id));
    } else if (parsed.version === undefined) {
      // Legacy gallery flags alone are not proof of a completed level. Import
      // only when both the reward and subsequent level availability agree.
      try {
        const rewards = JSON.parse(storage?.getItem('linkblock.fenglin.codex') ?? 'null');
        cleared = LEVELS.filter(level => level.id <= 5 && (level.id < available || level.id === 5 && available >= 5)
          && (level.id === 1 ? rewards?.clear === true : rewards?.levels?.[level.id]?.clear === true)).map(level => level.id);
      } catch { /* Keep available levels even if old gallery data is corrupt. */ }
    }
    // A five-level save may have finished its former final level. Advance to
    // the next actual level without replaying it, while preserving all clears.
    available = Math.max(available, Math.min(LEVELS.length, Math.max(0, ...cleared) + 1));
    return { unlocked: available, cleared };
  } catch {
    return empty();
  }
}

export function writeLevelProgress(progress: LevelProgress, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify({ version: 3, unlocked: progress.unlocked, cleared: progress.cleared })); } catch { /* Private mode can reject storage. */ }
}

/** Only a completed run records a seal. Opening level 1 is not a completion. */
export function noteClear(progress: LevelProgress, levelId: number): LevelProgress {
  if (!LEVELS.some(level => level.id === levelId)) return progress;
  return { unlocked: Math.max(progress.unlocked, Math.min(LEVELS.length, levelId + 1)),
    cleared: [...new Set([...progress.cleared, levelId])].sort((a, b) => a - b) };
}
