import { distance, edges, EPS, inside, type Point, type Polygon } from './geometry';
import type { Enemy } from './enemies';
import type { BossAttackFactory } from './attacks';

export interface BossPhase {
  id: string;
  when: { healthAtMost?: number; territoryAtLeast?: number };
  createAttack?: BossAttackFactory;
}
export interface BossConfig {
  maxHealth?: number;
  jumpDuration?: number;
  phases?: BossPhase[];
}
export interface VictoryConfig { territoryPercent?: number; territory?: boolean; defeatBoss?: boolean }
export interface BossJump { from: Point; to: Point | null; elapsed: number; duration: number; retryIn?: number }
export interface BossHitVisual extends Point { points: number; health: number; maxHealth: number }
export const BOSS_HIT_POINTS = 250;

export function jumpPose(jump: BossJump, reducedMotion = false) {
  const progress = jump.to ? Math.min(1, jump.elapsed / jump.duration) : 0.5;
  const target = jump.to ?? jump.from;
  const height = reducedMotion ? 0 : Math.sin(progress * Math.PI);
  return {
    x: jump.from.x + (target.x - jump.from.x) * progress,
    y: jump.from.y + (target.y - jump.from.y) * progress - height * 2.4,
    scale: 1 + height * 0.35, shadow: target, progress,
  };
}
export function safeLanding(point: Point, regions: Polygon[], boss: Enemy, enemies: Enemy[], player: Point, trail: Polygon) {
  const clearance = boss.radius + 0.16;
  const region = regions.find(region => inside(point, region));
  return Boolean(region && edges(region).every(([a, b]) => distance(point, a, b) >= clearance - EPS)
    && enemies.every(enemy => Math.hypot(point.x - enemy.x, point.y - enemy.y) >= boss.radius + enemy.radius + 0.16)
    && Math.hypot(point.x - player.x, point.y - player.y) >= boss.radius + 0.5
    && trail.slice(1).every((p, i) => distance(point, trail[i], p) >= clearance));
}
export function findLanding(regions: Polygon[], boss: Enemy, enemies: Enemy[], player: Point, trail: Polygon, random = Math.random): Point | null {
  const safe = (p: Point) => safeLanding(p, regions, boss, enemies, player, trail);
  const ordered = [...regions];
  if (ordered.length) { const offset = Math.floor(random() * ordered.length) % ordered.length; ordered.push(...ordered.splice(0, offset)); }
  for (const region of ordered) {
    const minX = Math.min(...region.map(p => p.x)), maxX = Math.max(...region.map(p => p.x));
    const minY = Math.min(...region.map(p => p.y)), maxY = Math.max(...region.map(p => p.y));
    for (let i = 0; i < 64; i++) {
      const p = { x: minX + random() * (maxX - minX), y: minY + random() * (maxY - minY) };
      if (safe(p)) return p;
    }
    // Geometric scan lines provide a deterministic fallback in concave rooms.
    // These candidates choose a landing point; player motion is never quantized.
    const ys = [...new Set(region.map(p => p.y))].sort((a, b) => a - b);
    const r = boss.radius + 0.16;
    const candidates = [(minY + maxY) / 2, ...ys.flatMap(y => [y - r, y + r]), ...ys.slice(1).map((y, i) => (y + ys[i]) / 2)];
    for (const y of candidates) {
      if (y <= minY || y >= maxY) continue;
      const xs = edges(region).filter(([a, b]) => (a.y > y) !== (b.y > y))
        .map(([a, b]) => a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)).sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        if (xs[i + 1] - xs[i] < r * 2 - EPS) continue;
        for (const x of [(xs[i] + xs[i + 1]) / 2, xs[i] + r, xs[i + 1] - r]) if (safe({ x, y })) return { x, y };
      }
    }
  }
  return null;
}
