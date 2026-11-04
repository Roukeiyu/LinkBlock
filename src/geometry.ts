export interface Point { x: number; y: number }
export type Polygon = Point[] & { hole?: { outer: Polygon; interior: Polygon; seam: [Point, Point] } };
export const EPS = 1e-7;
export const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < EPS;
export const edges = (points: Polygon): [Point, Point][] => points.map((p, i) => [p, points[(i + 1) % points.length]]);
// A holed region uses a zero-width bridge only to express a Canvas fill path.
// That bridge is not a gameplay wall. A player-drawn bridge has no metadata and
// remains a real, visible wall after connecting the inner and outer loops.
export function wallEdges(points: Polygon): [Point, Point][] {
  const seam = points.hole?.seam;
  return edges(points).filter(([a, b]) => !same(a, b) && (!seam || !onSegment(a, ...seam) || !onSegment(b, ...seam)));
}
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
export function inside(p: Point, polygon: Polygon, boundary = wallEdges(polygon)) {
  let result = false;
  for (const [a, b] of boundary) {
    if (onSegment(p, a, b)) return false;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
export const area = (polygon: Polygon) => Math.abs(edges(polygon).reduce((s, [a, b]) => s + a.x * b.y - b.x * a.y, 0)) / 2;
export const signedArea = (polygon: Polygon) => edges(polygon).reduce((s, [a, b]) => s + a.x * b.y - b.x * a.y, 0) / 2;
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
  const starts = boundary.flatMap((p, i) => same(p, start) ? [i] : []), ends = boundary.flatMap((p, i) => same(p, end) ? [i] : []);
  if (!starts.length || !ends.length || same(start, end)) throw new Error('Cut endpoints must join distinct boundary points');
  const walk = (from: number, to: number) => {
    const points: Polygon = [];
    for (let k = from; ; k = (k + 1) % boundary.length) { points.push(boundary[k]); if (k === to) return points; }
  };
  const candidates = starts.flatMap(i => ends.filter(j => j !== i).map(j => [simplify([...walk(i, j), ...cut.slice(1, -1).reverse()], true), simplify([...walk(j, i), ...cut.slice(1, -1)], true)] as [Polygon, Polygon]));
  // Real bridge walls occur twice in a slit polygon. Select the correct bank
  // using signed area, keeping both resulting danger faces positively wound.
  const valid = candidates.filter(parts => parts.every(part => signedArea(part) >= -EPS)
    && Math.abs(area(parts[0]) + area(parts[1]) - area(polygon)) < EPS * Math.max(1, area(polygon)));
  if (candidates.length === 1) return candidates[0];
  const centers = [...polygon, ...cut, ...edges(polygon).map(([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }))];
  const probes = centers.flatMap(p => [-1, 1].flatMap(x => [-1, 1].map(y => ({ x: p.x + x * EPS * 32, y: p.y + y * EPS * 32 }))));
  // Signed area alone cannot distinguish a negative hole accidentally attached
  // to the wrong bank. Local coverage on both sides of every original corner
  // identifies the true face without introducing a spatial grid or snapping.
  const correct = valid.find(parts => probes.every(p => {
    if (parts.some(part => wallEdges(part).some(([a, b]) => onSegment(p, a, b)))) return true;
    return parts.filter(part => inside(p, part)).length === Number(inside(p, polygon));
  }));
  if (!correct) throw new Error('Cut could not partition the connected boundary');
  return correct;
}

function boundaryWalk(polygon: Polygon, point: Point, positive: boolean): Polygon {
  let loop = polygon.map(p => ({ ...p }));
  if ((signedArea(loop) > 0) !== positive) loop.reverse();
  const inserted: Polygon = [];
  for (const [a, b] of edges(loop)) {
    inserted.push(a);
    if (!same(point, a) && !same(point, b) && onSegment(point, a, b)) inserted.push({ ...point });
  }
  const index = inserted.findIndex(p => same(p, point));
  if (index < 0) throw new Error('Boundary point is missing');
  return [...inserted.slice(index), ...inserted.slice(0, index)];
}
export function withHole(outer: Polygon, interior: Polygon): Polygon {
  const h = [...interior].sort((a, b) => a.x - b.x || a.y - b.y)[0];
  const intersections = edges(outer).filter(([a, b]) => Math.abs(a.x - b.x) < EPS && h.y >= Math.min(a.y, b.y) - EPS && h.y <= Math.max(a.y, b.y) + EPS && a.x < h.x - EPS);
  const x = Math.max(...intersections.map(([a]) => a.x));
  if (!Number.isFinite(x)) throw new Error('Hole must be inside the outer boundary');
  const o = { x, y: h.y }, outside = boundaryWalk(outer, o, true), hole = boundaryWalk(interior, h, false);
  const result: Polygon = [...outside, o, ...hole, h];
  result.hole = { outer, interior, seam: [o, h] }; return result;
}
export function partitionRegion(polygon: Polygon, cut: Polygon): Polygon[] {
  if (!polygon.hole) return split(polygon, cut);
  const { outer, interior } = polygon.hole, start = cut[0], end = cut.at(-1)!;
  const onHole = (p: Point) => edges(interior).some(([a, b]) => onSegment(p, a, b));
  const startInside = onHole(start), endInside = onHole(end);
  if (startInside && endInside) {
    const pieces = split(interior, cut);
    const pocket = pieces.find(p => signedArea(p) < -EPS), enlarged = pieces.find(p => signedArea(p) > area(interior) + EPS);
    if (!pocket || !enlarged) throw new Error('Inner cut did not enclose new territory');
    return [[...pocket].reverse(), withHole(outer, enlarged)];
  }
  if (!startInside && !endInside) {
    return split(outer, cut).map(part => inside(interior[0], part) ? withHole(part, interior) : part);
  }
  const path = startInside ? cut : [...cut].reverse(), h = path[0], o = path.at(-1)!;
  const outside = boundaryWalk(outer, o, true), hole = boundaryWalk(interior, h, false);
  // Joining the two loops opens an annulus into one slit face; no area has
  // actually been enclosed yet. Both banks of the drawn path remain visible.
  return [[...outside, o, ...path.slice(0, -1).reverse(), ...hole.slice(1), h, ...path.slice(1, -1)]];
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
