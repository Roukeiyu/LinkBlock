import { area, distance, edges, EPS, inside, onSegment, rayDistance, same, simplify, split, type Point, type Polygon } from './geometry';
export type { Point } from './geometry';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export type GameEvent = 'start' | 'capture' | 'hit' | 'won' | 'lost';
export interface Enemy extends Point { vx: number; vy: number }
const vectors: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
export const PLAYER_SPEED = 22.222222;
export const RETRACT_SPEED = PLAYER_SPEED * 3;
const ENEMY_RADIUS = 0.55;

export class Game {
  readonly target = 75;
  readonly outline: Polygon;
  territory: Polygon;
  captured: Polygon[] = [];
  player: Point;
  anchor: Point;
  enemy: Enemy;
  trail: Polygon = [];
  retracting = false;
  phase: Phase = 'ready';
  lives = 3;
  score = 0;
  elapsed = 0;
  protection = 0;
  events: GameEvent[] = [];

  constructor(readonly width = 72, readonly height = 48) {
    if (width < 6 || height < 6) throw new Error('Board must be at least 6 × 6');
    this.outline = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    this.territory = this.outline.map(p => ({ ...p }));
    this.player = { x: width / 2, y: 0 };
    this.anchor = { ...this.player };
    this.enemy = { x: width * 0.68, y: height * 0.57, vx: 7.4, vy: 5.2 };
  }
  get claimed() { return this.width * this.height - area(this.territory); }
  get percent() { return this.claimed / (this.width * this.height) * 100; }
  isBoundary(x: number, y: number) {
    return [...edges(this.outline), ...edges(this.territory)].some(([a, b]) => onSegment({ x, y }, a, b));
  }
  start() { if (this.phase === 'ready') { this.phase = 'playing'; this.events.push('start'); } }
  togglePause() {
    if (this.phase === 'playing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'playing';
  }
  // Distance is continuous world-space distance, never a cell count.
  move(direction: Direction, drawing: boolean, amount: number) {
    if (this.phase !== 'playing' || this.retracting || !Number.isFinite(amount) || amount <= EPS) return false;
    const v = vectors[direction], p = this.player;
    if (this.trail.length && !drawing) return false;
    if (!this.trail.length) {
      // Merge touching collinear edges so a capture junction never causes a hitch.
      let reach = 0;
      const segments = [...edges(this.outline), ...edges(this.territory)];
      for (let pass = 0; pass <= segments.length; pass++) {
        const before = reach;
        for (const [a, b] of segments) {
          const axis = v.x ? 'x' : 'y', cross = v.x ? 'y' : 'x', sign = v.x || v.y;
          if (Math.abs(a[cross] - p[cross]) > EPS || Math.abs(b[cross] - p[cross]) > EPS) continue;
          const ds = [sign * (a[axis] - p[axis]), sign * (b[axis] - p[axis])].sort((x, y) => x - y);
          if (ds[0] <= reach + EPS && ds[1] > reach) reach = ds[1];
        }
        if (reach === before) break;
      }
      if (reach > EPS) {
        const travel = Math.min(amount, reach);
        this.player = { x: p.x + v.x * travel, y: p.y + v.y * travel };
        return false;
      }
      if (!drawing || this.protection > 0 || !inside({ x: p.x + v.x * 1e-5, y: p.y + v.y * 1e-5 }, this.territory)) return false;
      this.anchor = { ...p };
      this.trail = [{ ...p }];
    }
    const last = this.trail.at(-1)!;
    const previous = same(last, p) && this.trail.length > 1 ? this.trail.at(-2)! : last;
    // Reversing would retrace the live line.
    if ((p.x - previous.x) * v.x + (p.y - previous.y) * v.y < -EPS) return false;
    let wall = Infinity;
    for (const [a, b] of edges(this.territory)) wall = Math.min(wall, rayDistance(p, v, a, b));
    const travel = Math.min(amount, wall);
    // A live line may neither cross nor touch itself, including at a corner.
    for (let i = 0; i < this.trail.length - 1; i++) {
      const a = this.trail[i], b = this.trail[i + 1];
      if (onSegment(p, a, b)) continue;
      if (rayDistance(p, v, a, b) <= travel + EPS) return false;
    }
    if (travel <= EPS) return false;
    const next = { x: p.x + v.x * travel, y: p.y + v.y * travel };
    this.trail = simplify([...this.trail, next]);
    this.player = next;
    if (this.collidesWithTrail()) { this.hit(); return false; }
    if (wall <= amount + EPS) { this.capture(); return true; }
    return false;
  }
  beginRetraction() {
    if (this.phase === 'playing' && this.trail.length > 1) this.retracting = true;
  }
  private retract(amount: number) {
    // Consume distance from the tip backwards, preserving every original corner.
    while (this.trail.length > 1 && amount > EPS) {
      const tip = this.trail.at(-1)!, previous = this.trail.at(-2)!;
      const length = Math.hypot(tip.x - previous.x, tip.y - previous.y);
      if (amount >= length - EPS) {
        amount = Math.max(0, amount - length);
        this.trail.pop(); this.player = { ...previous };
      } else {
        this.player = { x: tip.x + (previous.x - tip.x) * amount / length, y: tip.y + (previous.y - tip.y) * amount / length };
        this.trail[this.trail.length - 1] = { ...this.player };
        amount = 0;
      }
    }
    if (this.trail.length > 1) return false;
    this.trail = []; this.retracting = false; this.player = { ...this.anchor };
    return true;
  }
  private capture() {
    const parts = split(this.territory, this.trail);
    const keep = inside(this.enemy, parts[0]) ? 0 : 1;
    const claimed = parts[1 - keep];
    const length = this.trail.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - this.trail[i].x, p.y - this.trail[i].y), 0);
    this.territory = parts[keep];
    this.captured.push(claimed);
    this.trail = [];
    this.anchor = { ...this.player };
    this.score += Math.round(area(claimed) * 10 + length * 5);
    this.events.push('capture');
    if (this.percent >= this.target - EPS) { this.phase = 'won'; this.score += this.lives * 1000; this.events.push('won'); }
  }
  private collidesWithTrail() {
    return !this.protection && this.trail.slice(1).some((p, i) => distance(this.enemy, this.trail[i], p) <= ENEMY_RADIUS + 0.12);
  }
  private hit() {
    this.trail = []; this.retracting = false; this.player = { ...this.anchor }; this.lives--; this.protection = 1.5;
    this.events.push('hit');
    if (!this.lives) { this.phase = 'lost'; this.events.push('lost'); }
  }
  update(seconds: number, direction?: Direction, drawing = false) {
    if (this.phase !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return false;
    if (!drawing) this.beginRetraction();
    const steps = Math.max(1, Math.ceil(seconds * Math.max(RETRACT_SPEED, Math.abs(this.enemy.vx), Math.abs(this.enemy.vy)) / 0.12));
    const dt = seconds / steps;
    let gestureEnded = false;
    for (let i = 0; i < steps && this.phase === 'playing'; i++) {
      this.elapsed += dt; this.protection = Math.max(0, this.protection - dt);
      const blocked = (p: Point) => !inside(p, this.territory) || edges(this.territory).some(([a, b]) => distance(p, a, b) < ENEMY_RADIUS);
      const enemy = this.enemy;
      const nx = { x: enemy.x + enemy.vx * dt, y: enemy.y };
      if (blocked(nx)) enemy.vx *= -1; else enemy.x = nx.x;
      const ny = { x: enemy.x, y: enemy.y + enemy.vy * dt };
      if (blocked(ny)) enemy.vy *= -1; else enemy.y = ny.y;
      const lives = this.lives;
      if (this.collidesWithTrail()) this.hit();
      if (lives !== this.lives) gestureEnded = true;
      if (!gestureEnded) {
        if (this.retracting) gestureEnded = this.retract(RETRACT_SPEED * dt);
        else if (direction) gestureEnded = this.move(direction, drawing, PLAYER_SPEED * dt);
        if (lives !== this.lives) gestureEnded = true;
      }
    }
    return gestureEnded;
  }
}
