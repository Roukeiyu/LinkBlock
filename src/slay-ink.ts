import { distance, EPS, type Point, type Polygon } from './geometry';

/** 朱砂红. Bright enough to read on the forest plate and on pale paper. */
export const SLAY_INK = '#f04a38';
export const SLAY_INK_GLOW = '#ffc7be';

export interface SlaySpan { start: number; end: number }

export function trailLength(trail: Polygon) {
  let length = 0;
  for (let i = 1; i < trail.length; i++) length += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
  return length;
}

export function linesLength(lines: Polygon[]) {
  return lines.reduce((sum, line) => sum + trailLength(line), 0);
}

function pointAt(a: Point, b: Point, start: number, at: number): Point {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const t = len <= EPS ? 0 : (at - start) / len;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cutsOn(start: number, end: number, spans: SlaySpan[]) {
  const cuts = [start, end];
  const add = (value: number) => {
    if (value <= start + EPS || value >= end - EPS) return;
    if (cuts.some(cut => Math.abs(cut - value) <= 1e-4)) return;
    cuts.push(value);
  };
  for (const span of spans) { add(span.start); add(span.end); }
  cuts.sort((a, b) => a - b);
  return cuts;
}

/**
 * Split a stroke into the arc-length that spent slay budget and the ordinary remainder.
 * A span may end in the middle of a segment; both pieces stay connected at that point.
 */
export function splitTrail(trail: Polygon, spans: SlaySpan[]): { slay: Polygon[]; plain: Polygon[] } {
  const slay: Polygon[] = [];
  const plain: Polygon[] = [];
  if (trail.length < 2) return { slay, plain };
  let cursor = 0;
  let mode: boolean | undefined;
  let run: Polygon | undefined;
  const emit = (slayMode: boolean, point: Point) => {
    if (mode !== slayMode || !run) {
      run = [{ ...point }];
      (slayMode ? slay : plain).push(run);
      mode = slayMode;
      return;
    }
    const last = run[run.length - 1];
    if (Math.hypot(last.x - point.x, last.y - point.y) > EPS) run.push({ ...point });
  };
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= EPS) continue;
    const cuts = cutsOn(cursor, cursor + len, spans);
    for (let k = 1; k < cuts.length; k++) {
      const from = cuts[k - 1], to = cuts[k];
      if (to - from <= EPS) continue;
      const slayMode = spans.some(span => from >= span.start - 1e-4 && to <= span.end + 1e-4);
      emit(slayMode, pointAt(a, b, cursor, from));
      emit(slayMode, pointAt(a, b, cursor, to));
    }
    cursor += len;
  }
  return { slay, plain };
}

/** Keep slay ink that still lies on the current shore. Interior edges are no longer a visible line. */
export function coastVisible(lines: Polygon[], coast: [Point, Point][], tolerance = 0.08): Polygon[] {
  const kept: Polygon[] = [];
  for (const line of lines) {
    let run: Polygon | undefined;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const visible = coast.some(([c, d]) => distance(mid, c, d) <= tolerance);
      if (!visible) { run = undefined; continue; }
      if (!run) { run = [{ ...a }]; kept.push(run); }
      const last = run[run.length - 1];
      if (Math.hypot(last.x - b.x, last.y - b.y) > EPS) run.push({ ...b });
    }
  }
  return kept;
}
