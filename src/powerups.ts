import { distance, inside, wallEdges, type Point, type Polygon } from './geometry';
import type { Enemy } from './enemies';

export type PowerUpKind = 'slow' | 'stop' | 'speed' | 'bomb' | 'shuffle';
export interface PowerUp extends Point { kind: PowerUpKind }
export const POWER_UP_KINDS: PowerUpKind[] = ['slow', 'stop', 'speed', 'bomb', 'shuffle'];
export const POWER_UP_DURATION: Record<PowerUpKind, number> = { slow: 10, stop: 3, speed: 10, bomb: 3, shuffle: 3 };
export const POWER_UP_LABELS: Record<PowerUpKind, string> = { slow: '减速', stop: '止步', speed: '加速', bomb: '炸弹', shuffle: '洗牌' };
/** Higher weight means a more common drop. Bomb and shuffle stay rare. */
export const POWER_UP_WEIGHTS: Record<PowerUpKind, number> = { slow: 3, stop: 2, speed: 3, bomb: 1, shuffle: 1 };
export const POWER_UP_RADIUS = 1.2;
/** Enemies farther than this from the player take the bomb's single hit. */
export const BOMB_RADIUS = 8;

export function pickPowerUp(random: () => number): PowerUpKind {
  const total = POWER_UP_KINDS.reduce((sum, kind) => sum + POWER_UP_WEIGHTS[kind], 0);
  let roll = random() * total;
  for (const kind of POWER_UP_KINDS) {
    roll -= POWER_UP_WEIGHTS[kind];
    if (roll < 0) return kind;
  }
  return 'shuffle';
}

export interface BoardRect { x: number; y: number; w: number; h: number }

/** A 3:2 rectangle of exactly `claimed` area, kept inside the board and centered on `anchor`. */
export function rectangleOfArea(width: number, height: number, claimed: number, anchor: Point): BoardRect {
  const exact = Math.min(width * height, Math.max(0, claimed));
  let w = Math.sqrt(exact * width / height);
  let h = w > 0 ? exact / w : 0;
  if (w > width) { w = width; h = w > 0 ? exact / w : 0; }
  if (h > height) { h = height; w = h > 0 ? exact / h : 0; }
  const x = Math.max(0, Math.min(width - w, anchor.x - w / 2));
  const y = Math.max(0, Math.min(height - h, anchor.y - h / 2));
  return { x, y, w, h };
}

/** Move toward `to` while keeping the rectangle area equal to `claimed`. */
export function lerpClaimedRect(from: BoardRect, to: BoardRect, t: number, claimed: number, width: number, height: number): BoardRect {
  const blend = Math.min(1, Math.max(0, t));
  let w = from.w + (to.w - from.w) * blend;
  if (w > width) w = width;
  if (w < 1e-4) w = 1e-4;
  let h = claimed / w;
  if (h > height) { h = height; w = claimed / h; }
  const cx = from.x + from.w / 2 + (to.x + to.w / 2 - (from.x + from.w / 2)) * blend;
  const cy = from.y + from.h / 2 + (to.y + to.h / 2 - (from.y + from.h / 2)) * blend;
  const x = Math.max(0, Math.min(width - w, cx - w / 2));
  const y = Math.max(0, Math.min(height - h, cy - h / 2));
  return { x, y, w, h };
}

/** Find an exposed, reachable spot without placing an item under an actor. */
export function powerUpPosition(width: number, height: number, regions: Polygon[], player: Point, enemies: Enemy[], trail: Polygon, random: () => number): Point | undefined {
  const margin = POWER_UP_RADIUS;
  const safe = (point: Point) => regions.some(region => inside(point, region))
    && Math.hypot(point.x - player.x, point.y - player.y) >= 4
    && enemies.every(enemy => Math.hypot(point.x - enemy.x, point.y - enemy.y) >= enemy.visualRadius + POWER_UP_RADIUS + 0.5)
    && trail.slice(1).every((end, i) => distance(point, trail[i], end) >= POWER_UP_RADIUS + 0.5);
  for (let i = 0; i < 96; i++) {
    const point = { x: margin + random() * (width - 2 * margin), y: margin + random() * (height - 2 * margin) };
    if (safe(point)) return point;
  }
  // A bounded fallback handles repeated random numbers and narrow regions.
  for (const region of regions) {
    const ys = [...new Set(region.flatMap(p => [p.y, p.y + margin, p.y - margin]))].sort((a, b) => a - b);
    const candidates = [...ys, ...ys.slice(1).map((y, i) => (y + ys[i]) / 2)];
    for (const y of candidates) {
      if (y < margin || y > height - margin) continue;
      const xs = wallEdges(region).filter(([a, b]) => (a.y > y) !== (b.y > y))
        .map(([a, b]) => a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)).sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (const x of [(xs[i] + xs[i + 1]) / 2, xs[i] + margin, xs[i + 1] - margin]) {
          const point = { x, y };
          if (x >= margin && x <= width - margin && safe(point)) return point;
        }
      }
    }
  }
  // In a cramped or crowded region, use a water interior point even when
  // ideal clearance is unavailable. A shoreline point cannot be enclosed.
  const fallback: Point[] = [];
  for (const region of regions) {
    const ys = [...new Set((region.rings ?? [region]).flat().map(p => p.y))].sort((a, b) => a - b);
    for (let row = 1; row < ys.length; row++) {
      const y = (ys[row - 1] + ys[row]) / 2;
      const xs = wallEdges(region).filter(([a, b]) => (a.y > y) !== (b.y > y))
        .map(([a, b]) => a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)).sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const point = { x: (xs[i] + xs[i + 1]) / 2, y };
        if (inside(point, region)) fallback.push(point);
      }
    }
  }
  return fallback.length ? fallback[Math.min(fallback.length - 1, Math.floor(random() * fallback.length))] : undefined;
}
