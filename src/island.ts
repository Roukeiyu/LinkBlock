import clipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import { area, closestPoint, distance, edges, EPS, onSegment, same, signedArea, simplify, split, wallEdges, type Point, type Polygon } from './geometry';

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

  constructor(outline: Polygon, starting: Polygon) {
    this.arena = geometry(outline); this.land = union(geometry(starting)); this.refresh();
  }
  private refresh(land = this.land) {
    const regions = islandPolygons(difference(this.arena, land));
    // Every real island edge is a shore, including a section against the arena
    // limit. Bare frame sections never enter this land-derived perimeter.
    const coast = islandPolygons(land).flatMap(wallEdges);
    this.land = land; this.regions = regions; this.coast = coast;
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
