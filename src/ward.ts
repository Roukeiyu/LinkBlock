import { distance, type Point } from './geometry';

/** Keep `to` outside the ward circle. A body already inside steps away; if every exit is walled in, its natural step is kept so it cannot freeze. */
export function avoidWard(from: Point, to: Point, player: Point, radius: number, blocked: (point: Point) => boolean): Point {
  const travel = Math.hypot(to.x - from.x, to.y - from.y);
  if (travel <= 1e-8) return to;
  const fromDist = Math.hypot(from.x - player.x, from.y - player.y);
  const toDist = Math.hypot(to.x - player.x, to.y - player.y);
  const grazes = distance(player, from, to) < radius - 1e-6;
  if (fromDist >= radius && toDist >= radius && !grazes) return to;

  if (fromDist < radius) {
    if (toDist > fromDist + 1e-4 && !blocked(to)) return to;
    return bestStep(from, aim(from, player), travel, player, blocked) ?? (blocked(to) ? from : to);
  }

  const t = circleEntry(from, to, player, radius);
  const entry = t === undefined
    ? { x: from.x, y: from.y }
    : { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  const remain = Math.max(0, travel * (1 - (t ?? 0)));
  const rx = entry.x - player.x, ry = entry.y - player.y;
  const rl = Math.hypot(rx, ry) || 1;
  const forwardX = to.x - from.x, forwardY = to.y - from.y;
  const tangents = [
    { x: -ry / rl, y: rx / rl },
    { x: ry / rl, y: -rx / rl },
  ].sort((a, b) => (b.x * forwardX + b.y * forwardY) - (a.x * forwardX + a.y * forwardY));
  for (const tangent of tangents) {
    const outside = placeOutside({ x: entry.x + tangent.x * remain, y: entry.y + tangent.y * remain }, player, radius);
    if (!blocked(outside)) return outside;
  }
  const held = placeOutside(entry, player, radius);
  if (!blocked(held)) return held;
  return from;
}

function aim(from: Point, player: Point) {
  const dx = from.x - player.x, dy = from.y - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

function placeOutside(point: Point, player: Point, radius: number): Point {
  const dist = Math.hypot(point.x - player.x, point.y - player.y);
  if (dist >= radius) return point;
  const dir = aim(point, player);
  return { x: player.x + dir.x * (radius + 0.02), y: player.y + dir.y * (radius + 0.02) };
}

function bestStep(from: Point, outward: Point, travel: number, player: Point, blocked: (point: Point) => boolean) {
  const base = Math.atan2(outward.y, outward.x);
  let best: Point | undefined;
  let bestDist = Math.hypot(from.x - player.x, from.y - player.y);
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
    const candidate = { x: from.x + Math.cos(base + turn) * travel, y: from.y + Math.sin(base + turn) * travel };
    if (blocked(candidate)) continue;
    const dist = Math.hypot(candidate.x - player.x, candidate.y - player.y);
    if (dist > bestDist + 1e-4) { best = candidate; bestDist = dist; }
  }
  return best;
}

function circleEntry(from: Point, to: Point, player: Point, radius: number) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const fx = from.x - player.x, fy = from.y - player.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return undefined;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return undefined;
  const root = Math.sqrt(disc);
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)].sort((p, q) => p - q)) {
    if (t >= -1e-6 && t <= 1 + 1e-6) return Math.min(1, Math.max(0, t));
  }
  return undefined;
}
