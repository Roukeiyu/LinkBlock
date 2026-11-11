import clipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import { area, closestPoint, distance, edges, EPS, inside, onSegment, same, signedArea, simplify, split, wallEdges, type Point, type Polygon } from './geometry';

const ring = (points: Polygon): Ring => points.map(p => [p.x, p.y]);
const { difference, intersection, union } = clipping;
const geometry = (points: Polygon): MultiPolygon => [(points.rings ?? [points]).map(ring)];

// Boolean results keep their true rings for collisions. The flattened Canvas
// path only adds zero-width, cancelling connections to draw holes in one fill.
export function islandPolygons(shape: MultiPolygon): Polygon[] {
  return shape.map(polygon => {
    const rings = polygon.map(r => simplify(r.map(([x, y]) => ({ x, y })), true));
    const outer = rings[0], result: Polygon = [...outer];
    for (const interior of rings.slice(1)) result.push(outer[0], ...interior, interior[0], outer[0]);
    result.rings = rings; return result;
  });
}
const size = (shape: MultiPolygon) => islandPolygons(shape).reduce((sum, p) => sum + area(p), 0);

/**
 * An enclosed slit thinner than the drawn shoreline reads as one interior line.
 * Exterior steps of the same width stay, because they are real shore.
 */
const HAIRLINE = 0.2;

/** True when exactly one side of the edge is water or outside the arena. */
export function separatesShore(edge: [Point, Point], water: Polygon[], arena: Polygon[]) {
  const [a, b] = edge;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (len <= EPS) return false;
  const nx = -dy / len, ny = dx / len;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const probe = 1e-3;
  const open = (sign: number) => {
    const point = { x: mid.x + nx * probe * sign, y: mid.y + ny * probe * sign };
    return !arena.some(region => inside(point, region)) || water.some(region => inside(point, region));
  };
  return open(1) !== open(-1);
}

/** Width of the narrowest slab that still contains the polygon. */
function slabWidth(region: Polygon) {
  const points = (region.rings ?? [region]).flat();
  let tight = Infinity;
  for (const ring of region.rings ?? [region]) for (const [a, b] of edges(ring)) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len <= EPS) continue;
    let max = 0;
    for (const point of points) max = Math.max(max, Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / len);
    tight = Math.min(tight, max);
  }
  return tight;
}

/** Enclosed water thin enough to draw as a single interior stroke. */
export function enclosedSlivers(water: Polygon[], arena: Polygon[]) {
  const limit = arena.flatMap(wallEdges);
  const touchesFrame = (region: Polygon) => (region.rings ?? [region]).some(ring => edges(ring).some(([a, b]) => limit.some(([c, d]) => distance({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, c, d) <= 1e-4)));
  return water.filter(region => area(region) > EPS && !touchesFrame(region) && slabWidth(region) < HAIRLINE);
}

export function repairLand(arenaShape: MultiPolygon, land: MultiPolygon) {
  const arena = islandPolygons(arenaShape);
  let regions = islandPolygons(difference(arenaShape, land));
  let owned = land;
  const fills = enclosedSlivers(regions, arena).map(region => geometry(region)).filter(shape => size(shape) > EPS);
  let gaps: Polygon[] = [];
  if (fills.length) {
    const sealed = fills.reduce((acc, piece) => union(acc, piece));
    gaps = islandPolygons(difference(sealed, owned));
    owned = union(owned, sealed);
    regions = islandPolygons(difference(arenaShape, owned));
  }
  // A zero-width spike, or both banks of a slit, can survive inside land that is
  // already enclosed. Those edges do not separate land from open water.
  const coast = islandPolygons(owned).flatMap(wallEdges).filter(edge => separatesShore(edge, regions, arena));
  return { land: owned, regions, coast, gaps };
}

export class Island {
  private land: MultiPolygon;
  private readonly arena: MultiPolygon;
  regions: Polygon[] = [];
  coast: [Point, Point][] = [];
  /** Hairline gaps folded into land on the last refresh. Their area is claimed, not scored. */
  sealedGaps: Polygon[] = [];

  constructor(outline: Polygon, starting: Polygon) {
    this.arena = geometry(outline); this.land = union(geometry(starting)); this.refresh();
  }
  private refresh(land = this.land) {
    const repaired = repairLand(this.arena, land);
    this.land = repaired.land; this.regions = repaired.regions; this.coast = repaired.coast; this.sealedGaps = repaired.gaps;
  }
  project(point: Point, tolerance = EPS): Point | undefined {
    // Contact tolerance must not create a second, slightly displaced shore.
    // Project to the actual continuous edge/vertex; never to a coordinate grid.
    const candidates = this.coast.filter(([a, b]) => distance(point, a, b) < tolerance).map(([a, b]) =>
      Math.hypot(point.x - a.x, point.y - a.y) < tolerance ? { ...a } : Math.hypot(point.x - b.x, point.y - b.y) < tolerance ? { ...b } : closestPoint(point, a, b));
    return candidates.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
  }
  close(trail: Polygon, water?: Polygon): Polygon[] | undefined {
    if (trail.length < 2) return undefined;
    const start = this.project(trail[0]), end = this.project(trail.at(-1)!);
    if (!start || !end) return undefined;
    trail = [{ ...start }, ...trail.slice(1, -1), { ...end }];
    const loops: Polygon[] = [];
    if (same(start, end)) loops.push(simplify(trail, true));
    else for (const polygon of this.land) for (const source of polygon) {
      const boundary: Polygon = source.slice(0, -1).map(([x, y]) => ({ x, y }));
      if (!edges(boundary).some(([a, b]) => onSegment(start, a, b))
        || !edges(boundary).some(([a, b]) => onSegment(end, a, b))) continue;
      // split expects a positive source ring. The Boolean difference below
      // discards old land from each candidate, so it is never rewarded twice.
      if (signedArea(boundary) < 0) boundary.reverse();
      loops.push(...split(boundary, trail));
    }
    const candidates = loops.filter(p => area(p) > EPS).map(p => difference(intersection(geometry(p), water ? geometry(water) : this.arena), this.land))
      .map(shape => ({ shape, area: size(shape) })).filter(p => p.area > EPS).sort((a, b) => a.area - b.area);
    // A normal outward-and-back loop produces the same pocket by both walks.
    // If two distinct valid pockets exist at a junction, choose the smaller.
    const selected = candidates[0];
    if (!selected) return undefined;
    this.refresh(union(this.land, selected.shape));
    return islandPolygons(selected.shape);
  }
}
