import { distance, inside, rayDistance, wallEdges, type Point, type Polygon } from './geometry';
import type { Enemy } from './enemies';

export type PowerUpKind = 'slow' | 'stop' | 'speed' | 'bomb' | 'shuffle' | 'shield' | 'ward';
export interface PowerUp extends Point { kind: PowerUpKind }
export const POWER_UP_KINDS: PowerUpKind[] = ['slow', 'stop', 'speed', 'bomb', 'shuffle', 'shield', 'ward'];
/** Shield is a one-hit charge, so its timer stays at 0. Ward and the older effects count down. */
export const POWER_UP_DURATION: Record<PowerUpKind, number> = { slow: 10, stop: 3, speed: 10, bomb: 3, shuffle: 3, shield: 0, ward: 8 };
export const POWER_UP_LABELS: Record<PowerUpKind, string> = { slow: '减速', stop: '止步', speed: '加速', bomb: '炸弹', shuffle: '洗牌', shield: '护盾', ward: '避邪符' };
export const POWER_UP_COLORS: Record<PowerUpKind, string> = {
  slow: '#9ee8bb', stop: '#a8d9ff', speed: '#ffd783', bomb: '#ff8a6a', shuffle: '#d7b4ff', shield: '#b7d7c4', ward: '#f0d7a2',
};
/** Higher weight means a more common drop. Bomb and shuffle stay rare. */
export const POWER_UP_WEIGHTS: Record<PowerUpKind, number> = { slow: 3, stop: 2, speed: 3, bomb: 1, shuffle: 1, shield: 2, ward: 2 };
export const POWER_UP_RADIUS = 1.2;
/** An item never appears closer than this to the player. Pickup reach must stay strictly inside it. */
export const POWER_UP_SPAWN_GAP = 4;
export const POWER_UP_RESPAWN_SECONDS = 5;
/** Visible spirit body used for contact pickup. The projectile core stays smaller. */
export const PICKUP_BODY_RADIUS = 1.5;
/** Enemies within this distance of the player take the bomb's single hit, before the blast roll. */
export const BOMB_RADIUS = 8;
/** Each armed bomb multiplies BOMB_RADIUS by a uniform draw from this inclusive range. */
export const BOMB_RADIUS_FACTOR = { min: 1.5, max: 1.8 } as const;
/** Monsters route around this radius while 避邪符 is active. */
export const WARD_RADIUS = 7;

/** Distance from the player center at which a pickup is taken. `rangeBonus` comes from 拾取范围. */
export function contactReach(rangeBonus = 0) {
  return POWER_UP_RADIUS + PICKUP_BODY_RADIUS + Math.max(0, rangeBonus);
}

/** Inclusive uniform factor in [1.5, 1.8], then applied to the base blast radius. */
export function rollBombRadius(base: number, random: () => number) {
  const t = Math.min(1, Math.max(0, random()));
  const factor = BOMB_RADIUS_FACTOR.min + (BOMB_RADIUS_FACTOR.max - BOMB_RADIUS_FACTOR.min) * t;
  return base * factor;
}

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

/** Spawn in open water within a quarter of the board's short side of the playable shore. */
export function powerUpPosition(width: number, height: number, regions: Polygon[], shore: [Point, Point][], player: Point, enemies: Enemy[], trail: Polygon, random: () => number): Point | undefined {
  if (!shore.length || !regions.length) return undefined;
  const reach = Math.min(width, height) / 4;
  const water = regions.map(region => ({ region, walls: wallEdges(region) }));
  const walls = water.flatMap(room => room.walls);
  const inWater = (point: Point) => water.some(room => inside(point, room.region, room.walls));
  const fits = (point: Point) => walls.every(([a, b]) => distance(point, a, b) >= POWER_UP_RADIUS);
  const clear = (point: Point) => Math.hypot(point.x - player.x, point.y - player.y) >= POWER_UP_SPAWN_GAP
    && enemies.every(enemy => Math.hypot(point.x - enemy.x, point.y - enemy.y) >= enemy.visualRadius + POWER_UP_RADIUS + 0.5)
    && trail.slice(1).every((end, i) => distance(point, trail[i], end) >= POWER_UP_RADIUS + 0.5);
  const vertices = shore.flat();
  const xs = vertices.map(p => p.x), ys = vertices.map(p => p.y);
  const left = Math.max(0, Math.min(...xs) - reach), right = Math.min(width, Math.max(...xs) + reach);
  const top = Math.max(0, Math.min(...ys) - reach), bottom = Math.min(height, Math.max(...ys) + reach);
  for (let i = 0; i < 96; i++) {
    const point = { x: left + random() * (right - left), y: top + random() * (bottom - top) };
    if (shore.some(([a, b]) => distance(point, a, b) <= reach) && inWater(point) && fits(point) && clear(point)) return point;
  }
  // Probe from the shore itself when random samples miss a narrow water strip.
  // Half the distance to the opposite wall also works in gaps smaller than an icon.
  const fallback: Point[] = [];
  for (const [a, b] of shore) {
    for (const t of [0.5, 0.25, 0.75]) {
      const bank = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const sign of [-1, 1]) {
        const normal = a.x === b.x ? { x: sign, y: 0 } : { x: 0, y: sign };
        const gap = walls.reduce((limit, [c, d]) => Math.min(limit, rayDistance(bank, normal, c, d) / 2), reach);
        const point = { x: bank.x + normal.x * gap, y: bank.y + normal.y * gap };
        if (!inWater(point)) continue;
        if (fits(point) && clear(point)) return point;
        fallback.push(point);
      }
    }
  }
  return fallback.find(clear) ?? fallback[0];
}
