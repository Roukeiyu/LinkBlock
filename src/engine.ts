import { area, distance, edges, EPS, inside, onSegment, rayDistance, same, simplify, split, type Point, type Polygon } from './geometry';
import { advanceEnemy, createEnemy, defaultEnemies, type Enemy } from './enemies';
import { EightWayAttack, MAX_HAZARDS, type AttackHazard, type BossAttack, type BossAttackFactory } from './attacks';
export type { Point } from './geometry';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export type GameEvent = 'start' | 'capture' | 'hit' | 'won' | 'lost' | 'partition' | 'bossAttack';
export interface GameOptions { enemies?: Enemy[]; boss?: Enemy | null; createBossAttack?: BossAttackFactory }
const vectors: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
export const PLAYER_SPEED = 22.222222;
export const RETRACT_SPEED = PLAYER_SPEED * 3;
const PLAYER_RADIUS = 0.34;

export class Game {
  readonly target = 75;
  readonly outline: Polygon;
  territories: Polygon[];
  private cutRegion = -1;
  lastCapture: Polygon[] = [];
  captured: Polygon[] = [];
  player: Point;
  anchor: Point;
  enemies: Enemy[];
  boss: Enemy | undefined;
  bossAttack: BossAttack | undefined;
  hazards: AttackHazard[] = [];
  trail: Polygon = [];
  retracting = false;
  phase: Phase = 'ready';
  lives = 3;
  score = 0;
  elapsed = 0;
  protection = 0;
  events: GameEvent[] = [];

  constructor(readonly width = 72, readonly height = 48, options: GameOptions = {}) {
    if (width < 6 || height < 6) throw new Error('Board must be at least 6 × 6');
    this.outline = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    this.territories = [this.outline.map(p => ({ ...p }))];
    this.player = { x: width / 2, y: 0 };
    this.anchor = { ...this.player };
    this.enemies = options.enemies ?? defaultEnemies(width, height);
    this.boss = options.boss === null ? undefined : options.boss ?? createEnemy('boss', { x: Math.min(width - 1.2, width * 0.84), y: Math.min(height - 1.2, height * 0.76) });
    this.bossAttack = this.boss ? (options.createBossAttack ?? (() => new EightWayAttack()))() : undefined;
  }
  get claimed() { return this.width * this.height - this.territories.reduce((sum, polygon) => sum + area(polygon), 0); }
  get percent() { return this.claimed / (this.width * this.height) * 100; }
  isBoundary(x: number, y: number) {
    return [...edges(this.outline), ...this.territories.flatMap(edges)].some(([a, b]) => onSegment({ x, y }, a, b));
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
      const segments = [...edges(this.outline), ...this.territories.flatMap(edges)];
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
      if (!drawing || this.protection > 0) return false;
      this.cutRegion = this.territories.findIndex(region => inside({ x: p.x + v.x * 1e-5, y: p.y + v.y * 1e-5 }, region));
      if (this.cutRegion < 0) return false;
      this.anchor = { ...p };
      this.trail = [{ ...p }];
    }
    const last = this.trail.at(-1)!;
    const previous = same(last, p) && this.trail.length > 1 ? this.trail.at(-2)! : last;
    // Reversing would retrace the live line.
    if ((p.x - previous.x) * v.x + (p.y - previous.y) * v.y < -EPS) return false;
    let wall = Infinity;
    for (const [a, b] of edges(this.territories[this.cutRegion])) wall = Math.min(wall, rayDistance(p, v, a, b));
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
    if (this.collidesWithTrail() || this.hazardsHit(p, next)) { this.hit(); return false; }
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
    this.trail = []; this.cutRegion = -1; this.retracting = false; this.player = { ...this.anchor };
    return true;
  }
  private capture() {
    const parts = split(this.territories[this.cutRegion], this.trail);
    const bodies = this.boss ? [...this.enemies, this.boss] : this.enemies;
    const remaining = parts.filter(part => bodies.some(body => inside(body, part)));
    this.lastCapture = parts.filter(part => !remaining.includes(part));
    const length = this.trail.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - this.trail[i].x, p.y - this.trail[i].y), 0);
    this.territories.splice(this.cutRegion, 1, ...remaining);
    this.cutRegion = -1;
    this.captured.push(...this.lastCapture);
    this.trail = [];
    this.anchor = { ...this.player };
    const claimed = this.lastCapture.reduce((sum, region) => sum + area(region), 0);
    this.score += Math.round(claimed * 10 + length * 5);
    this.events.push(claimed > EPS ? 'capture' : 'partition');
    if (this.percent >= this.target - EPS) { this.phase = 'won'; this.score += this.lives * 1000; this.events.push('won'); this.hazards = []; }
  }
  private collidesWithTrail() {
    const bodies = this.boss ? [...this.enemies, this.boss] : this.enemies;
    return !this.protection && bodies.some(body => this.trail.slice(1).some((p, i) => distance(body, this.trail[i], p) <= body.radius + 0.12));
  }
  private hit() {
    this.trail = []; this.cutRegion = -1; this.retracting = false; this.player = { ...this.anchor }; this.lives--; this.protection = 1.5;
    this.events.push('hit');
    if (!this.lives) { this.phase = 'lost'; this.events.push('lost'); this.hazards = []; }
  }
  spawnHazard(hazard: AttackHazard) {
    if (this.hazards.length >= MAX_HAZARDS || hazard.expired) return false;
    this.hazards.push(hazard); return true;
  }
  private hazardsHit(from: Point, to: Point) {
    if (this.protection > 0) return false;
    const hits = this.hazards.filter(hazard => hazard.hitsPlayer(from, to, PLAYER_RADIUS) || hazard.hitsTrail(this.trail, 0.12));
    for (const hazard of hits) hazard.onHit();
    return hits.length > 0;
  }
  update(seconds: number, direction?: Direction, drawing = false) {
    if (this.phase !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return false;
    if (!drawing) this.beginRetraction();
    const bodies = this.boss ? [...this.enemies, this.boss] : this.enemies;
    const maxSpeed = Math.max(RETRACT_SPEED, ...bodies.map(body => Math.hypot(body.vx, body.vy)));
    const steps = Math.max(1, Math.ceil(seconds * maxSpeed / 0.12));
    const dt = seconds / steps;
    let gestureEnded = false;
    let walls = this.territories.map(edges);
    for (let i = 0; i < steps && this.phase === 'playing'; i++) {
      this.elapsed += dt; this.protection = Math.max(0, this.protection - dt);
      for (const body of bodies) advanceEnemy(body, dt, this.territories, walls);
      if (this.boss && this.bossAttack) this.bossAttack.update(dt, {
        origin: this.boss, arena: this, spawn: hazard => this.spawnHazard(hazard), cast: () => this.events.push('bossAttack'),
      });
      for (const hazard of this.hazards) hazard.update(dt, this);
      const lives = this.lives, playerBefore = { ...this.player };
      if (this.collidesWithTrail() || this.hazardsHit(playerBefore, playerBefore)) this.hit();
      if (lives !== this.lives) gestureEnded = true;
      if (!gestureEnded) {
        if (this.retracting) gestureEnded = this.retract(RETRACT_SPEED * dt);
        else if (direction) gestureEnded = this.move(direction, drawing, PLAYER_SPEED * dt);
        if (this.hazardsHit(playerBefore, this.player)) this.hit();
        if (lives !== this.lives) gestureEnded = true;
        if (gestureEnded) walls = this.territories.map(edges);
      }
      this.hazards = this.hazards.filter(hazard => !hazard.expired);
    }
    return gestureEnded;
  }
}
