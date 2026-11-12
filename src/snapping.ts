import { EPS, onSegment, rayDistance, same, type Point } from './geometry';

// About four pixels on the reference canvas. This is input assistance, not a
// change to geometric tolerances or the coordinates of existing territory.
export const DRAW_SNAP_DISTANCE = 0.35;
type Segment = [Point, Point];

/** A short orthogonal route to a nearby shore vertex or forward boundary. */
export function snapDrawing(start: Point, direction: Point, amount: number, coast: Segment[], arenaReach: number) {
  const wall = Math.min(Infinity, ...coast.map(([a, b]) => rayDistance(start, direction, a, b)));
  const limit = Math.min(wall, Math.max(0, arenaReach));
  const travel = Math.min(amount, limit);
  const pointAt = (distance: number) => ({ x: start.x + direction.x * distance, y: start.y + direction.y * distance });
  const next = pointAt(travel);
  const corners = coast.flat().map(point => ({
    point,
    forward: (point.x - start.x) * direction.x + (point.y - start.y) * direction.y,
    gap: Math.hypot(point.x - next.x, point.y - next.y),
  })).filter(candidate => candidate.forward > EPS && candidate.forward <= limit + EPS
    && candidate.gap <= DRAW_SNAP_DISTANCE && !same(candidate.point, start))
    .sort((a, b) => a.gap - b.gap || a.forward - b.forward || a.point.x - b.point.x || a.point.y - b.point.y);
  for (const { point, forward } of corners) {
    const bend = pointAt(forward), gap = Math.hypot(point.x - bend.x, point.y - bend.y);
    if (gap > EPS) {
      const side = { x: (point.x - bend.x) / gap, y: (point.y - bend.y) / gap };
      // Never jump across another bank to reach the preferred vertex.
      if (coast.some(([a, b]) => !(onSegment(bend, a, b) && onSegment(point, a, b))
        && rayDistance(bend, side, a, b) < gap - EPS)) continue;
    }
    return { points: gap > EPS ? [bend, { ...point }] : [{ ...point }], closes: true };
  }
  const snapped = limit > EPS && limit - travel <= DRAW_SNAP_DISTANCE ? limit : travel;
  return { points: [pointAt(snapped)], closes: wall <= snapped + EPS };
}
