import { EPS, onSegment, same, type Point } from './geometry';

// At the 864×576 reference canvas, 0.35 world units are about 4 pixels.
// This is a walking allowance for real connected shore, not a geometry grid.
export const SHORE_STEP_TOLERANCE = 0.35;
export const SHORE_CONTACT_TOLERANCE = 1e-5;
type Segment = [Point, Point];
const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const along = (a: Point, b: Point, v: Point) => (b.x - a.x) * v.x + (b.y - a.y) * v.y;

function forward(point: Point, v: Point, segments: Segment[], excluded: number[] = [], origin = point) {
  let reach = 0;
  for (let i = 0; i < segments.length; i++) {
    if (excluded.includes(i)) continue;
    const [a, b] = segments[i];
    if (!onSegment(point, a, b) || Math.abs((b.x - a.x) * v.y - (b.y - a.y) * v.x) > EPS) continue;
    for (const end of [a, b]) if (along(origin, end, v) > EPS) reach = Math.max(reach, along(point, end, v));
  }
  return reach;
}

function tinyConnection(start: Point, v: Point, segments: Segment[], allowance = SHORE_STEP_TOLERANCE, accepts = (_point: Point) => true) {
  const queue = [{ points: [start], used: [] as number[], cost: 0 }], visited: Point[] = [];
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const route = queue.shift()!, point = route.points.at(-1)!;
    if (visited.some(p => same(p, point))) continue;
    visited.push(point);
    if (route.used.length && forward(point, v, segments, route.used, start) > EPS && accepts(point)) return route;
    for (let i = 0; i < segments.length; i++) {
      const [a, b] = segments[i];
      if (route.used.includes(i) || !onSegment(point, a, b)) continue;
      for (const end of [a, b]) {
        const distance = length(point, end), cost = route.cost + distance;
        if (distance <= EPS || cost > allowance + EPS || route.points.some(p => same(p, end))) continue;
        queue.push({ points: [...route.points, end], used: [...route.used, i], cost });
      }
    }
  }
  return undefined;
}

// At a crossing, continuous movement can pass the exact turn point between
// frames. A blocked turn may follow a short real shore route back to that
// junction. Ordinary corners and disconnected banks are not shortcuts.
export function turnAtJunction(start: Point, v: Point, amount: number, segments: Segment[]): Point[] & { stepping?: boolean } {
  const axes = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const connection = tinyConnection(start, v, segments, SHORE_STEP_TOLERANCE,
    point => axes.filter(axis => forward(point, axis, segments) > EPS).length > 2);
  const path: Point[] & { stepping?: boolean } = [{ ...start }];
  if (!connection) return path;
  let remaining = amount;
  for (const target of connection.points.slice(1)) {
    const point = path.at(-1)!, distance = length(point, target);
    if (remaining < distance) {
      path.push({ x: point.x + (target.x - point.x) * remaining / distance, y: point.y + (target.y - point.y) * remaining / distance });
      return path;
    }
    path.push({ ...target }); remaining -= distance;
  }
  const onward = walkCoast(path.at(-1)!, v, remaining, segments);
  path.push(...onward.slice(1)); path.stepping = onward.stepping;
  return path;
}

// Return the actual piecewise coast route so projectile collision can sweep
// every tiny bend. Disconnected edges are never joined by proximity.
export function walkCoast(start: Point, v: Point, amount: number, segments: Segment[], continuingStep = false): Point[] & { stepping?: boolean } {
  const path: Point[] & { stepping?: boolean } = [{ ...start }]; let remaining = amount;
  const consume = (target: Point) => {
    const point = path.at(-1)!, distance = length(point, target);
    if (distance <= EPS) return;
    const travel = Math.min(distance, remaining), ratio = travel / distance;
    path.push(travel >= distance - EPS ? { ...target } : { x: point.x + (target.x - point.x) * ratio, y: point.y + (target.y - point.y) * ratio });
    remaining = Math.max(0, remaining - travel);
  };
  for (let i = 0; i < segments.length * 3 + 3 && remaining > EPS; i++) {
    const point = path.at(-1)!, reach = forward(point, v, segments);
    if (reach > EPS) { consume({ x: point.x + v.x * reach, y: point.y + v.y * reach }); continue; }
    // Both banks must run in the requested axis. This distinguishes a tiny
    // offset from deliberately leaving a short shore toward open water.
    const reverse = { x: -v.x, y: -v.y };
    const alignedBehind = forward(point, reverse, segments) > EPS;
    // Starting in the middle of a perpendicular shore is a new direction, not
    // permission to turn toward a nearby corner. Only resume an established
    // automatic step there, even when the wider allowance reaches both banks.
    if (!alignedBehind && !continuingStep) break;
    const behind = alignedBehind ? 0 : tinyConnection(point, reverse, segments)?.cost;
    if (behind === undefined) break;
    const connection = tinyConnection(point, v, segments, SHORE_STEP_TOLERANCE - behind);
    if (!connection) break;
    for (const target of connection.points.slice(1)) { if (remaining <= EPS) break; consume(target); }
    if (!same(path.at(-1)!, connection.points.at(-1)!)) path.stepping = true;
  }
  return path;
}
