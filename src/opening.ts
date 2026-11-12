import { area, type Point, type Polygon } from './geometry';

export const OPENING_SECONDS = 5;
export const OPENING_HZ = 30;
export interface Opening { region: Polygon; elapsed: number; nextAt: number; candidates: number }
/** Protected head and neck bounds in image fractions (0–1), scaled with the game board. */
export interface OpeningFace { left: number; top: number; right: number; bottom: number }
/** Counts edge/corner contact and containment as collisions, not only overlap. */
export function openingTouchesFace(region: Polygon, width: number, height: number, face: OpeningFace) {
  return Math.max(...region.map(p => p.x)) >= face.left * width
    && Math.min(...region.map(p => p.x)) <= face.right * width
    && Math.max(...region.map(p => p.y)) >= face.top * height
    && Math.min(...region.map(p => p.y)) <= face.bottom * height;
}

export const openingFaceGap = (width: number, height: number) => Math.min(width, height) / 48 * 0.25;

// Beta(3,6) puts the typical result near 10% while keeping the full 0.1–30%
// range available. Gamma sums avoid rejection loops, even with a constant RNG.
export function openingFraction(random = Math.random) {
  const gamma = (count: number) => Array.from({ length: count }, () => -Math.log(Math.max(Number.EPSILON, 1 - random()))).reduce((a, b) => a + b, 0);
  const a = gamma(3), b = gamma(6);
  return 0.001 + 0.299 * (a + b > 0 ? a / (a + b) : 1 / 3);
}
export function openingRectangle(width: number, height: number, random = Math.random, boss: Point = { x: width / 2, y: height / 2 }, face?: OpeningFace): Polygon {
  let target = width * height * openingFraction(random);
  const margin = Math.min(4.5, width * 0.15, height * 0.15), reserve = Math.min(4, width * 0.15, height * 0.15);
  let zones = [
    { x: margin, y: margin, w: boss.x - reserve - margin, h: height - margin * 2 },
    { x: boss.x + reserve, y: margin, w: width - boss.x - reserve - margin, h: height - margin * 2 },
    { x: margin, y: margin, w: width - margin * 2, h: boss.y - reserve - margin },
    { x: margin, y: boss.y + reserve, w: width - margin * 2, h: height - boss.y - reserve - margin },
  ].filter(z => z.w > 0 && z.h > 0);
  if (face) {
    const gap = openingFaceGap(width, height);
    const left = face.left * width - gap, right = face.right * width + gap;
    const top = face.top * height - gap, bottom = face.bottom * height + gap;
    // Every candidate fits wholly beside the face, including previews. Checking
    // only candidate corners would miss rectangles spanning across the face.
    zones = zones.flatMap(z => {
      if (z.x + z.w <= left || z.x >= right || z.y + z.h <= top || z.y >= bottom) return [z];
      return [
        { ...z, w: left - z.x },
        { ...z, x: right, w: z.x + z.w - right },
        { ...z, h: top - z.y },
        { ...z, y: bottom, h: z.y + z.h - bottom },
      ].filter(part => part.w > 0 && part.h > 0);
    });
  }
  if (!zones.length) throw new Error('No safe opening area outside the face and boss');
  // If no safe zone fits the sampled area, shrink the candidate; never fall
  // back to an unchecked rectangle that could expose the face.
  target = Math.min(target, Math.max(...zones.map(z => z.w * z.h)));
  zones = zones.filter(z => z.w * z.h >= target);
  const zone = zones[Math.min(zones.length - 1, Math.floor(random() * zones.length))];
  const minSide = Math.min(1.2, Math.sqrt(target) / 2, zone.w, zone.h);
  const low = Math.max(minSide, target / zone.h), high = Math.min(zone.w, target / minSide);
  const w = Math.exp(Math.log(low) + random() * Math.log(high / low)), h = target / w;
  const x = zone.x + random() * Math.max(0, zone.w - w), y = zone.y + random() * Math.max(0, zone.h - h);
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}
export function openingSpawn(region: Polygon, random = Math.random): Point {
  const side = Math.min(3, Math.floor(random() * 4)), t = 0.15 + random() * 0.7;
  const a = region[side], b = region[(side + 1) % 4];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export const openingPercent = (opening: Opening, width: number, height: number) => area(opening.region) / (width * height) * 100;
