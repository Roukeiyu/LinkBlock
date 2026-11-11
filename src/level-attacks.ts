import { Projectile, type AttackContext, type BossAttack } from './attacks';

export type AttackPattern = 'sand' | 'storm' | 'rose' | 'hunt';
const names: Record<AttackPattern, string> = {
  sand: '流沙扇射', storm: '旋转电弧', rose: '血翼夹击', hunt: '缺口围猎',
};

/** Aim is locked at the start of each warning, never tracked during a shot. */
export class LevelAttack implements BossAttack {
  readonly name: string;
  private clock = 0;
  private volley = 0;
  private locked = false;
  private bearings: number[] = [];
  readonly interval: number;
  readonly warningSeconds: number;
  readonly speed: number;

  constructor(readonly pattern: AttackPattern, readonly stage: number) {
    if (!Number.isInteger(stage) || stage < 0 || stage > 2) throw new Error('Invalid attack stage');
    this.name = names[pattern];
    this.interval = { sand: [5.2, 4.4, 3.6], storm: [4.4, 3.7, 3.0], rose: [4.2, 3.5, 2.9], hunt: [4.0, 3.3, 2.7] }[pattern][stage];
    this.warningSeconds = pattern === 'sand' ? 1.2 : pattern === 'hunt' ? 1.1 : 1;
    this.speed = { sand: 10, storm: 12, rose: 11, hunt: 12 }[pattern] + stage;
  }
  get warning() { return this.locked ? Math.max(0, (this.clock - (this.interval - this.warningSeconds)) / this.warningSeconds) : 0; }
  get warningAngles() { return this.bearings; }
  get directions() { return this.bearings.length; }

  private lock(context: AttackContext) {
    const target = context.target ?? { x: context.arena.width / 2, y: 0 };
    const aim = Math.atan2(target.y - context.origin.y, target.x - context.origin.x);
    const fan = (center: number, count: number, spacing: number) => Array.from({ length: count }, (_, i) => center + (i - (count - 1) / 2) * spacing);
    switch (this.pattern) {
      case 'sand': this.bearings = fan(aim, 3 + this.stage * 2, Math.PI / 12); break;
      case 'storm': {
        const count = this.stage === 0 ? 4 : 6;
        this.bearings = Array.from({ length: count }, (_, i) => this.volley * Math.PI / 9 + i * Math.PI * 2 / count);
        break;
      }
      case 'rose': {
        // Two wings leave an intentional central lane. Step aside only after
        // reading the warning: chasing the player's current heading is unfair.
        const wing = fan(0.65, 2 + this.stage, 0.15);
        this.bearings = wing.flatMap(angle => [aim - angle, aim + angle]);
        break;
      }
      case 'hunt': {
        // Omit three adjacent spokes; the escape gap rotates between volleys.
        const count = 12 + this.stage * 2, gap = this.volley * Math.PI / 4;
        this.bearings = Array.from({ length: count - 3 }, (_, i) => gap + (i + 2) * Math.PI * 2 / count);
        break;
      }
    }
    this.locked = true;
  }
  update(seconds: number, context: AttackContext) {
    // Split at warning/fire boundaries so large updates cannot skip a lock or
    // silently change volley order. Game normally advances in small substeps.
    while (seconds > 0) {
      const next = this.locked ? this.interval : this.interval - this.warningSeconds;
      const step = Math.min(seconds, Math.max(0, next - this.clock));
      this.clock += step; seconds -= step;
      if (this.clock < next - 1e-9) break;
      if (!this.locked) this.lock(context);
      else {
        for (const angle of this.bearings) context.spawn(new Projectile(context.origin, {
          x: Math.cos(angle) * this.speed, y: Math.sin(angle) * this.speed,
        }));
        context.cast(); this.volley++; this.clock = 0; this.locked = false; this.bearings = [];
      }
    }
  }
}
