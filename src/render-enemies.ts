import { jumpPose, type BossJump } from './boss';
import { ENEMY_STYLES, type Enemy } from './enemies';

type Look = 'mist' | 'spore' | 'crow' | 'thorn' | 'ghost' | 'tree';

export interface SpriteSheet {
  mist: string;
  thorn: string;
  ghost: string;
  spore: string;
  crow: string;
  tree: string;
  /** Sprites drawn facing left, so they turn with their velocity. */
  turn?: Look[];
}

const wolfSheet: SpriteSheet = {
  mist: 'sprites/enemy_fufeng.png',
  thorn: 'sprites/enemy_jingshi.png',
  ghost: 'sprites/enemy_canhun.png',
  spore: 'sprites/enemy_huibao.png',
  crow: 'sprites/enemy_zhouya.png',
  tree: 'sprites/boss_shigen.png',
  turn: ['crow'],
};

let sheet: SpriteSheet = wolfSheet;
const sprites = new Map<string, HTMLImageElement>();

export function useSpriteSheet(next: SpriteSheet = wolfSheet) {
  sheet = next;
}

function sprite(look: Look) {
  const file = sheet[look];
  let image = sprites.get(file);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = `${import.meta.env.BASE_URL}${file}`;
    sprites.set(file, image);
  }
  return image;
}

const straightLooks = new WeakMap<Enemy, Look>();
let straightSerial = 0;
function lookFor(enemy: Enemy): Look {
  if (enemy.kind === 'boss') return 'tree';
  if (enemy.kind === 'orbit') return 'thorn';
  if (enemy.kind === 'zigzag') return 'ghost';
  let look = straightLooks.get(enemy);
  if (!look) {
    look = (['mist', 'spore', 'crow'] as const)[straightSerial++ % 3];
    straightLooks.set(enemy, look);
  }
  return look;
}

function blit(ctx: CanvasRenderingContext2D, image: HTMLImageElement, height: number) {
  if (!image.complete || !image.naturalWidth) return;
  const width = height * (image.naturalWidth / image.naturalHeight);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
}

export function renderEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, warning = 0, reducedMotion = false, jump?: BossJump, hurt = 0, directions = 4, angleOffset = 0) {
  const color = ENEMY_STYLES[enemy.kind].color;
  const r = enemy.visualRadius;
  const look = lookFor(enemy);
  const pose = jump ? jumpPose(jump, reducedMotion) : undefined;
  ctx.save();
  if (!reducedMotion && !jump && enemy.trace.length > 1) {
    ctx.strokeStyle = color; ctx.globalAlpha = 0.22; ctx.lineWidth = 0.12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); enemy.trace.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  }
  if (pose) {
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(pose.shadow.x, pose.shadow.y + r * 0.21, r * 1.14, r * 0.41, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = color; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.ellipse(pose.shadow.x, pose.shadow.y + r * 0.21, r * 1.31, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.translate(pose?.x ?? enemy.x, pose?.y ?? enemy.y);
  if (pose) ctx.scale(pose.scale, pose.scale);
  if (sheet.turn?.includes(look)) ctx.rotate(Math.atan2(enemy.vy, enemy.vx) - Math.PI);
  if (hurt > 0) ctx.filter = 'brightness(1.85)';
  blit(ctx, sprite(look), r * (look === 'tree' ? 2.7 : 2.45));
  ctx.filter = 'none';
  if (enemy.kind === 'boss' && warning > 0) {
    ctx.globalAlpha = 0.3 + warning * 0.7;
    ctx.strokeStyle = '#ffe0c6'; ctx.lineWidth = 0.14;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.53, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * warning); ctx.stroke();
    for (let i = 0; i < directions; i++) {
      const angle = angleOffset + i * Math.PI * 2 / directions;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * r * 1.78, Math.sin(angle) * r * 1.78);
      ctx.lineTo(Math.cos(angle) * r * 2.37, Math.sin(angle) * r * 2.37); ctx.stroke();
    }
  }
  ctx.restore();
}

let spirit: HTMLImageElement | undefined;
export function renderWolfSpirit(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, drawing: boolean) {
  spirit ??= Object.assign(new Image(), { src: `${import.meta.env.BASE_URL}sprites/player_wolfspirit.png`, decoding: 'async' as const });
  if (!spirit.complete || !spirit.naturalWidth) return;
  const height = 1.35;
  const width = height * (spirit.naturalWidth / spirit.naturalHeight);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing - Math.PI);
  if (drawing) ctx.filter = 'brightness(1.25)';
  ctx.drawImage(spirit, -width / 2, -height / 2, width, height);
  ctx.restore();
}
