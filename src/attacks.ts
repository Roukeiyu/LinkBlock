import { distance, segmentDistance, type Point, type Polygon } from './geometry';

export interface Arena { width: number; height: number }
// Hazards need not be projectiles: a melee arc, pulse or beam can implement the
// same lifetime, swept hit testing and drawing contract without changing Game.
export interface AttackHazard {
  readonly expired: boolean;
  update(seconds: number, arena: Arena): void;
  hitsPlayer(from: Point, to: Point, radius: number): boolean;
  hitsTrail(trail: Polygon, radius: number): boolean;
  onHit(): void;
  render(context: CanvasRenderingContext2D): void;
}
export interface AttackContext {
  readonly origin: Readonly<Point>;
  readonly target?: Readonly<Point>;
  readonly arena: Arena;
  spawn(hazard: AttackHazard): boolean;
  cast(): void;
}
export interface BossAttack {
  readonly name: string;
  readonly warning: number;
  readonly directions?: number;
  readonly angleOffset?: number;
  /** Exact shot bearings, shared by the warning renderer and emitter. */
  readonly warningAngles?: readonly number[];
  update(seconds: number, context: AttackContext): void;
}
export type BossAttackFactory = () => BossAttack;
export const MAX_HAZARDS = 128;

export class Projectile implements AttackHazard {
  previous: Point;
  expired = false;
  constructor(public position: Point, readonly velocity: Point, readonly radius = 0.22) {
    this.position = { ...position }; this.previous = { ...position };
  }
  update(seconds: number, arena: Arena) {
    this.previous = { ...this.position };
    this.position.x += this.velocity.x * seconds; this.position.y += this.velocity.y * seconds;
    // Territory edges are deliberately absent: a shot crosses every claimed line.
    const { x, y } = this.position, r = this.radius;
    this.expired = x < -r || y < -r || x > arena.width + r || y > arena.height + r;
  }
  hitsPlayer(from: Point, to: Point, radius: number) {
    const a = { x: this.previous.x - from.x, y: this.previous.y - from.y };
    const b = { x: this.position.x - to.x, y: this.position.y - to.y };
    return distance({ x: 0, y: 0 }, a, b) <= this.radius + radius;
  }
  hitsTrail(trail: Polygon, radius: number) {
    return trail.slice(1).some((p, i) => segmentDistance(this.previous, this.position, trail[i], p) <= this.radius + radius);
  }
  onHit() { this.expired = true; }
  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const speed = Math.hypot(this.velocity.x, this.velocity.y) || 1;
    ctx.strokeStyle = 'rgba(168, 214, 156, .55)'; ctx.lineWidth = 0.15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(this.position.x - this.velocity.x / speed * 0.8, this.position.y - this.velocity.y / speed * 0.8);
    ctx.lineTo(this.position.x, this.position.y); ctx.stroke();
    ctx.fillStyle = '#d7ffc2'; ctx.shadowColor = '#8dbe6a'; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
export class RadialAttack implements BossAttack {
  readonly name: string;
  private clock = 0;
  private volley = 0;
  private readonly offsets: readonly number[];
  constructor(readonly directions = 8, readonly interval = 5, readonly warningSeconds = 0.85, readonly speed = 13, angleOffsets: readonly number[] = [0]) {
    if (!Number.isInteger(directions) || directions < 1 || directions > MAX_HAZARDS
      || ![interval, warningSeconds, speed].every(Number.isFinite)
      || !angleOffsets.length || angleOffsets.length > MAX_HAZARDS || !angleOffsets.every(Number.isFinite)
      || interval <= 0 || warningSeconds <= 0 || warningSeconds > interval || speed <= 0) throw new Error('Invalid attack timing, count or speed');
    this.name = directions === 8 ? '八向散射' : directions === 16 ? '十六向散射' : `${directions} 向散射`;
    this.offsets = [...angleOffsets];
  }
  // The warning and emitter both read the next volley orientation.
  get angleOffset() { return this.offsets[this.volley % this.offsets.length]; }
  get warning() { return Math.max(0, (this.clock - (this.interval - this.warningSeconds)) / this.warningSeconds); }
  update(seconds: number, context: AttackContext) {
    this.clock += seconds;
    while (this.clock >= this.interval) {
      this.clock -= this.interval;
      for (let i = 0; i < this.directions; i++) {
        const angle = this.angleOffset + i * Math.PI * 2 / this.directions;
        context.spawn(new Projectile({ ...context.origin }, { x: Math.cos(angle) * this.speed, y: Math.sin(angle) * this.speed }));
      }
      this.volley++;
      context.cast();
    }
  }
}
export class EightWayAttack extends RadialAttack {
  constructor(interval = 5, warningSeconds = 0.85, speed = 13) { super(8, interval, warningSeconds, speed); }
}
export class AlternatingCrossAttack extends RadialAttack {
  readonly name = '十字 / X 交替';
  constructor(interval = 5, warningSeconds = 0.85, speed = 13) { super(4, interval, warningSeconds, speed, [0, Math.PI / 4]); }
}
