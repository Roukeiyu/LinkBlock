import { lakeBossConfig, type BossConfig } from './boss';
import { LevelAttack, type AttackPattern } from './level-attacks';
import type { EnemyMotion } from './enemies';
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
  restored: string;
  sealed: string;
  mask: string;
  /** File stem in public/audio/, without extension. Opus is preferred, mp3 is the fallback. */
  music: string;
  portraitSealed: string;
  portraitRescued: string;
  /** Dedicated 4:3 gallery sheets. Level 1 keeps its own cards and leaves these unset. */
  rewardNinety?: string;
  rewardPerfect?: string;
  /** Three straight-moving looks, then the orbiter, the zigzag, and the boss. */
  names: { straight: [string, string, string]; orbit: string; zigzag: string; boss: string };
  sprites: SpriteSheet;
  /** Multiplier on the level-1 enemy speeds. 1 leaves them untouched. */
  enemySpeed: number;
  bossSpeed: number;
  squad: Squad;
  /** Multipliers on the level-1 reinforcement interval and speed. */
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
    restored: 'wolf-restored.webp', sealed: 'wolf-sealed.webp', mask: 'char_mask.png', music: 'moonlit-grove',
    portraitSealed: 'sprites/portrait_sealed.png', portraitRescued: 'sprites/portrait_rescued.png',
    names: { straight: ['腐风', '灰孢', '咒鸦'], orbit: '荆蚀', zigzag: '残魂', boss: '蚀根' },
    sprites: { ...sheet('sprites', ['enemy_fufeng.png', 'enemy_jingshi.png', 'enemy_canhun.png', 'enemy_huibao.png', 'enemy_zhouya.png', 'boss_shigen.png']), turn: ['crow'] },
    enemySpeed: 1, bossSpeed: 1, squad: { straight: 3, orbit: 3, zigzag: 3 }, reinforceInterval: 1, reinforceSpeed: 1,
    accent: '#c5d4e6',
  },
  {
    difficulty: '进阶', tactic: '小怪先慢行再冲刺；首领瞄准扇射。预警出现后侧移，利用慢行窗口圈地。',
    enemyMotion: { straight: 'surge', period: 2.8, orbitRate: 0.5, zigzagInterval: 1.1, zigzagAngle: Math.PI / 3 }, attackPattern: 'sand',
    id: 2, theme: '木乃伊', title: '第二关 · 沙漠神殿',
    restored: 'levels/2/mummy-restored.webp', sealed: 'levels/2/mummy_sealed_solid.webp', mask: 'levels/2/char_mask.png', music: 'desert-temple',
    portraitSealed: 'levels/2/portrait_sealed.png', portraitRescued: 'levels/2/portrait_rescued.png',
    rewardNinety: 'levels/2/mummy-90.webp', rewardPerfect: 'levels/2/mummy-perfect.webp',
    names: { straight: ['流沙', '缠布', '豺影'], orbit: '圣甲', zigzag: '罐灵', boss: '沙傀王' },
    sprites: sheet('levels/2', ['enemy_liusha.png', 'enemy_shengjia.png', 'enemy_guanling.png', 'enemy_chanbu.png', 'enemy_chaiying.png', 'boss_shakuiwang.png']),
    enemySpeed: 1.05, bossSpeed: 1.04, squad: { straight: 4, orbit: 3, zigzag: 3 }, reinforceInterval: 0.92, reinforceSpeed: 1.05,
    accent: '#e0c27a',
  },
  {
    difficulty: '挑战', tactic: '小怪定时直角转向；电弧每轮旋转，残血六向齐射。避免长时间停在旧空隙。',
    enemyMotion: { straight: 'corner', period: 1.1, orbitRate: 1.4, zigzagInterval: 0.48, zigzagAngle: Math.PI / 2 }, attackPattern: 'storm',
    id: 3, theme: '弗兰肯斯坦', title: '第三关 · 雷雨实验室',
    restored: 'levels/3/frankenstein-restored.webp', sealed: 'levels/3/frankenstein_sealed_solid.webp', mask: 'levels/3/char_mask.png', music: 'storm-lab',
    portraitSealed: 'levels/3/portrait_sealed.png', portraitRescued: 'levels/3/portrait_rescued.png',
    rewardNinety: 'levels/3/frankenstein-90.webp', rewardPerfect: 'levels/3/frankenstein-perfect.webp',
    names: { straight: ['电弧', '齿轮魂', '雷鼠'], orbit: '缝偶', zigzag: '酸雾', boss: '狂电塔' },
    sprites: sheet('levels/3', ['enemy_dianhu.png', 'enemy_fengou.png', 'enemy_suanwu.png', 'enemy_chilunhun.png', 'enemy_leishu.png', 'boss_kuangdianta.png']),
    enemySpeed: 1.1, bossSpeed: 1.08, squad: { straight: 4, orbit: 4, zigzag: 3 }, reinforceInterval: 0.85, reinforceSpeed: 1.1,
    accent: '#2ed3c6',
  },
  {
    difficulty: '高难', tactic: '小怪弧线游走；双翼弹幕夹击预警方向两侧。辨认中央通道，短线分次圈地。',
    enemyMotion: { straight: 'curve', period: 2.4, orbitRate: 1.15, zigzagInterval: 0.6, zigzagAngle: Math.PI * 0.55 }, attackPattern: 'rose',
    id: 4, theme: '吸血鬼', title: '第四关 · 玫瑰古堡',
    restored: 'levels/4/vampire-restored.webp', sealed: 'levels/4/vampire_sealed_solid.webp', mask: 'levels/4/char_mask.png', music: 'rose-waltz',
    portraitSealed: 'levels/4/portrait_sealed.png', portraitRescued: 'levels/4/portrait_rescued.png',
    rewardNinety: 'levels/4/vampire-90.webp', rewardPerfect: 'levels/4/vampire-perfect.webp',
    names: { straight: ['血蝠', '棘玫瑰', '棺鸦'], orbit: '红雾', zigzag: '镜影', boss: '血月石像' },
    sprites: sheet('levels/4', ['enemy_xuefu.png', 'enemy_hongwu.png', 'enemy_jingying.png', 'enemy_jimeigui.png', 'enemy_guanya.png', 'boss_xueyueshixiang.png']),
    enemySpeed: 1.15, bossSpeed: 1.12, squad: { straight: 4, orbit: 4, zigzag: 4 }, reinforceInterval: 0.78, reinforceSpeed: 1.15,
    accent: '#e25b78',
  },
  {
    difficulty: '终极', tactic: '小怪频繁冲锋；首领环射留下旋转缺口，残血加速。先找缺口，再趁间隔画线。',
    enemyMotion: { straight: 'surge', period: 1.6, orbitRate: 1.65, zigzagInterval: 0.42, zigzagAngle: Math.PI * 0.45 }, attackPattern: 'hunt',
    id: 5, theme: '无头骑士', title: '第五关 · 秋夜南瓜谷',
    restored: 'levels/5/horseman-restored.webp', sealed: 'levels/5/horseman_sealed_solid.webp', mask: 'levels/5/char_mask.png', music: 'autumn-ride',
    portraitSealed: 'levels/5/portrait_sealed.png', portraitRescued: 'levels/5/portrait_rescued.png',
    rewardNinety: 'levels/5/horseman-90.webp', rewardPerfect: 'levels/5/horseman-perfect.webp',
    names: { straight: ['鬼火', '铁蹄', '断缰'], orbit: '南瓜灵', zigzag: '落叶旋', boss: '秋猎魔骑' },
    sprites: sheet('levels/5', ['enemy_guihuo.png', 'enemy_nangualing.png', 'enemy_luoyexuan.png', 'enemy_tieti.png', 'enemy_duanjiang.png', 'boss_qiuliemoqi.png']),
    enemySpeed: 1.2, bossSpeed: 1.16, squad: { straight: 5, orbit: 4, zigzag: 4 }, reinforceInterval: 0.72, reinforceSpeed: 1.2,
    accent: '#f08a3c',
  },
];

export const levelById = (id: number) => LEVELS.find(level => level.id === id) ?? LEVELS[0];

/** Level 1 returns the live config object so its phases are not copied or retuned. */
export function bossConfigFor(level: LevelDef): BossConfig {
  if (level.id === 1) return lakeBossConfig;
  return {
    maxHealth: lakeBossConfig.maxHealth,
    jumpDuration: lakeBossConfig.jumpDuration,
    phases: lakeBossConfig.phases?.map((phase, stage) => ({
      ...phase,
      createAttack: level.attackPattern ? () => new LevelAttack(level.attackPattern!, stage) : phase.createAttack,
      reinforcements: phase.reinforcements ? {
        ...phase.reinforcements,
        targetCount: stage === 2 ? 13 + level.id : 8 + level.id,
        interval: phase.reinforcements.interval * level.reinforceInterval,
        speed: phase.reinforcements.speed * level.reinforceSpeed,
      } : undefined,
    })),
  };
}

/** Shared by the page and simulation tests, including restart and next-level. */
export function gameOptionsFor(level: LevelDef): GameOptions {
  return { opening: true, bossConfig: bossConfigFor(level), squad: level.squad,
    speedScale: level.enemySpeed, bossSpeedScale: level.bossSpeed, enemyMotion: level.enemyMotion };
}

export interface LevelProgress { unlocked: number }
const KEY = 'linkblock.fenglin.levels';

export function readLevelProgress(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): LevelProgress {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { unlocked: 1 };
    const unlocked = Math.round(Number(JSON.parse(raw).unlocked));
    if (!Number.isFinite(unlocked)) return { unlocked: 1 };
    return { unlocked: Math.min(LEVELS.length, Math.max(1, unlocked)) };
  } catch {
    return { unlocked: 1 };
  }
}

export function writeLevelProgress(progress: LevelProgress, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify({ unlocked: progress.unlocked })); } catch { /* Private mode can reject storage. */ }
}

/** Clearing a level opens the next one and never locks a later level already reached. */
export function noteClear(progress: LevelProgress, levelId: number): LevelProgress {
  return { unlocked: Math.max(progress.unlocked, Math.min(LEVELS.length, levelId + 1)) };
}
