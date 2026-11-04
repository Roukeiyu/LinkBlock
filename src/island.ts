import clipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import { area, edges, EPS, onSegment, same, signedArea, simplify, split, wallEdges, type Point, type Polygon } from './geometry';

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

export class Island {
  private land: MultiPolygon;
  private readonly arena: MultiPolygon;
  regions: Polygon[] = [];
  coast: [Point, Point][] = [];

  constructor(private readonly outline: Polygon, starting: Polygon) {
    this.arena = geometry(outline); this.land = union(geometry(starting)); this.refresh();
  }
  private refresh(land = this.land) {
    const regions = islandPolygons(difference(this.arena, land));
    // Only the island shore facing unrevealed space is walkable. The arena
    // frame remains an enemy/arena limit, never a place for the player to land.
    const coast = islandPolygons(land).flatMap(wallEdges).filter(([a, b]) =>
      !edges(this.outline).some(([c, d]) => onSegment(a, c, d) && onSegment(b, c, d)));
    this.land = land; this.regions = regions; this.coast = coast;
  }
  close(trail: Polygon, water?: Polygon): Polygon[] | undefined {
    if (trail.length < 2) return undefined;
    const start = trail[0], end = trail.at(-1)!;
    if (![start, end].every(p => this.coast.some(([a, b]) => onSegment(p, a, b)))) return undefined;
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
