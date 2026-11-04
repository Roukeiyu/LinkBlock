export interface Point { x: number; y: number }
export type Polygon = Point[];
export const EPS = 1e-7;
export const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < EPS;
export const edges = (points: Polygon): [Point, Point][] => points.map((p, i) => [p, points[(i + 1) % points.length]]);
export function closestPoint(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function distance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export const onSegment = (p: Point, a: Point, b: Point) => distance(p, a, b) < EPS;
export function inside(p: Point, polygon: Polygon) {
  let result = false;
  for (const [a, b] of edges(polygon)) {
    if (onSegment(p, a, b)) return false;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
export const area = (polygon: Polygon) => Math.abs(edges(polygon).reduce((s, [a, b]) => s + a.x * b.y - b.x * a.y, 0)) / 2;
export function simplify(points: Polygon, closed = false) {
  const result: Polygon = [];
  for (const point of points) {
    if (result.length && same(result.at(-1)!, point)) continue;
    while (result.length > 1 && onSegment(result.at(-1)!, result.at(-2)!, point)) result.pop();
    result.push({ ...point });
  }
  if (closed) {
    if (same(result[0], result.at(-1)!)) result.pop();
    while (result.length > 3 && onSegment(result[0], result.at(-1)!, result[1])) result.shift();
    while (result.length > 3 && onSegment(result.at(-1)!, result.at(-2)!, result[0])) result.pop();
  }
  return result;
}
// A simple cut joins two points on one boundary. The two boundary walks plus
// the cut form the exact new regions, with no raster mask or coordinate snapping.
export function split(polygon: Polygon, cut: Polygon): [Polygon, Polygon] {
  const start = cut[0], end = cut.at(-1)!;
  const boundary: Polygon = [];
  for (const [a, b] of edges(polygon)) {
    boundary.push(a);
    const inserted = [start, end].filter(p => !same(p, a) && !same(p, b) && onSegment(p, a, b));
    // Distance from the segment start, including two endpoints on the same edge.
    inserted.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
    boundary.push(...inserted);
  }
  const i = boundary.findIndex(p => same(p, start)), j = boundary.findIndex(p => same(p, end));
  if (i < 0 || j < 0 || i === j) throw new Error('Cut endpoints must join distinct boundary points');
  const walk = (from: number, to: number) => {
    const points: Polygon = [];
    for (let k = from; ; k = (k + 1) % boundary.length) { points.push(boundary[k]); if (k === to) return points; }
  };
  return [simplify([...walk(i, j), ...cut.slice(1, -1).reverse()], true), simplify([...walk(j, i), ...cut.slice(1, -1)], true)];
}
// Distance along an axis-aligned ray to a segment, including collinear walls.
export function rayDistance(p: Point, v: Point, a: Point, b: Point) {
  const horizontal = v.x !== 0, axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
  const sign = horizontal ? v.x : v.y;
  if (Math.abs(a[cross] - b[cross]) < EPS) {
    if (Math.abs(p[cross] - a[cross]) > EPS) return Infinity;
    const ds = [sign * (a[axis] - p[axis]), sign * (b[axis] - p[axis])].sort((x, y) => x - y);
    if (ds[1] < EPS) return Infinity;
    return ds[0] > EPS ? ds[0] : 0;
  }
  if (p[cross] < Math.min(a[cross], b[cross]) - EPS || p[cross] > Math.max(a[cross], b[cross]) + EPS) return Infinity;
  const d = sign * (a[axis] - p[axis]);
  return d > EPS ? d : Infinity;
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const boxesOverlap = Math.max(a.x, b.x) + EPS >= Math.min(c.x, d.x) && Math.max(c.x, d.x) + EPS >= Math.min(a.x, b.x)
    && Math.max(a.y, b.y) + EPS >= Math.min(c.y, d.y) && Math.max(c.y, d.y) + EPS >= Math.min(a.y, b.y);
  if (boxesOverlap && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) return 0;
  return Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b));
}
