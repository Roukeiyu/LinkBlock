import { describe, expect, it } from 'vitest';
import { EightWayAttack, RadialAttack, MAX_HAZARDS, Projectile, type AttackContext, type AttackHazard, type BossAttackFactory } from './attacks';
import { Game } from './engine';
import { createEnemy } from './enemies';
import { distance, type Point, type Polygon } from './geometry';

function fixture() {
  const game = new Game(20, 20, { enemies: [createEnemy('straight', { x: 17, y: 16 }, { x: 0, y: 0 })], boss: null });
  game.start(); return game;
}
describe('eight-way boss skill', () => {
  it.each([5, 2.5])('emits sixteen evenly spaced shots every %s seconds', interval => {
    const skill = new RadialAttack(16, interval), shots: Projectile[] = [];
    let casts = 0;
    const context: AttackContext = { origin: { x: 10, y: 10 }, arena: { width: 72, height: 48 }, spawn(hazard) { shots.push(hazard as Projectile); return true; }, cast() { casts++; } };
    skill.update(interval - 0.4, context); expect(skill.warning).toBeGreaterThan(0); expect(shots).toHaveLength(0);
    skill.update(0.41, context); expect(shots).toHaveLength(16);
    shots.forEach((shot, i) => {
      expect(shot.velocity.x).toBeCloseTo(Math.cos(i * Math.PI / 8) * 13);
      expect(shot.velocity.y).toBeCloseTo(Math.sin(i * Math.PI / 8) * 13);
      expect(shot.radius).toBe(0.22);
    });
    skill.update(interval * 2, context); expect(casts).toBe(3); expect(shots).toHaveLength(48);
    expect(() => new RadialAttack(0)).toThrow(); expect(() => new RadialAttack(16, Infinity)).toThrow();
  });
  it('telegraphs, emits exactly eight evenly spaced shots and repeats independently of frame rate', () => {
    const skill = new EightWayAttack(2, 0.5, 11), shots: Projectile[] = [];
    let casts = 0;
    const context: AttackContext = { origin: { x: 10, y: 10 }, arena: { width: 20, height: 20 }, spawn(hazard) { shots.push(hazard as Projectile); return true; }, cast() { casts++; } };
    skill.update(1.4, context); expect(shots).toHaveLength(0); expect(skill.warning).toBe(0);
    skill.update(0.2, context); expect(skill.warning).toBeCloseTo(0.2);
    skill.update(0.41, context); expect(shots).toHaveLength(8); expect(casts).toBe(1); expect(skill.warning).toBe(0);
    for (let i = 0; i < shots.length; i++) {
      expect(shots[i].position).toEqual({ x: 10, y: 10 });
      expect(shots[i].velocity.x).toBeCloseTo(Math.cos(i * Math.PI / 4) * 11, 8);
      expect(shots[i].velocity.y).toBeCloseTo(Math.sin(i * Math.PI / 4) * 11, 8);
      expect(Math.hypot(shots[i].velocity.x, shots[i].velocity.y)).toBeCloseTo(11, 8);
    }
    for (let i = 0; i < 240; i++) skill.update(1 / 120, context);
    expect(casts).toBe(2); expect(shots).toHaveLength(16);
  });
  it('freezes attack timing and hazards while paused and creates fresh state on restart', () => {
    const game = new Game(); game.start(); game.update(4.5);
    expect(game.bossAttack!.warning).toBeGreaterThan(0);
    game.togglePause(); const boss = structuredClone(game.boss), warning = game.bossAttack!.warning;
    game.update(3); expect(game.boss).toEqual(boss); expect(game.bossAttack!.warning).toBe(warning); expect(game.hazards).toHaveLength(0);
    game.togglePause(); game.update(0.6); expect(game.hazards).toHaveLength(8);
    game.togglePause(); const shots = structuredClone(game.hazards as Projectile[]); game.update(1);
    expect(game.hazards.map(h => (h as Projectile).position)).toEqual(shots.map(h => h.position));
    const fresh = new Game(); expect(fresh.hazards).toHaveLength(0); expect(fresh.bossAttack!.warning).toBe(0);
  });
});
describe('projectiles and collision', () => {
  it('flies through claimed territory, then is removed outside the arena', () => {
    const game = fixture(); game.move('down', true, 20); expect(game.percent).toBe(50);
    const shot = new Projectile({ x: 15, y: 5 }, { x: -15, y: 0 }); game.spawnHazard(shot);
    game.update(0.75); expect(shot.position.x).toBeCloseTo(3.75, 7);
    expect(game.hazards).toContain(shot); expect(shot.velocity.x).toBe(-15);
    game.update(1); expect(game.hazards).toHaveLength(0); expect(game.percent).toBe(50);
  });
  it('uses swept collision for a fast shot hitting the player at the outer boundary', () => {
    const game = fixture(); game.spawnHazard(new Projectile({ x: 10, y: 3 }, { x: 0, y: -1000 }));
    game.update(0.01);
    expect(game.lives).toBe(2); expect(game.hazards).toHaveLength(0); expect(game.player).toEqual(game.anchor);
  });
  it('detects moving-player crossings and thin live segments between endpoints', () => {
    const shot = new Projectile({ x: 0, y: 5 }, { x: 100, y: 0 }); shot.update(0.1, { width: 20, height: 20 });
    expect(shot.hitsPlayer({ x: 5, y: 0 }, { x: 5, y: 10 }, 0.34)).toBe(true);
    expect(shot.hitsTrail([{ x: 5, y: 2 }, { x: 5, y: 8 }], 0.12)).toBe(true);
    expect(shot.hitsTrail([{ x: 5, y: 7 }, { x: 5, y: 8 }], 0.12)).toBe(false);
  });
  it.each([false, true])('severs a live trail while retracting=%s', retracting => {
    const game = fixture(); game.move('down', true, 5);
    if (retracting) game.beginRetraction();
    game.spawnHazard(new Projectile({ x: 11, y: 1 }, { x: -20, y: 0 })); game.update(0.05, undefined, !retracting);
    expect(game.lives).toBe(2); expect(game.trail).toHaveLength(0); expect(game.retracting).toBe(false);
  });
  it('applies one hit for simultaneous shots and protects the respawn', () => {
    const game = fixture();
    for (let i = 0; i < 8; i++) game.spawnHazard(new Projectile({ ...game.player }, { x: 0, y: 0 }));
    game.update(0.01); expect(game.lives).toBe(2); expect(game.hazards).toHaveLength(0);
    game.spawnHazard(new Projectile({ ...game.player }, { x: 0, y: 0 })); game.update(0.1);
    expect(game.lives).toBe(2);
  });
  it('consumes simultaneous projectile hits even when an enemy hits the line at the same instant', () => {
    const game = fixture(); game.move('down', true, 5);
    game.enemies.push(createEnemy('straight', { x: 10, y: 2 }, { x: 0, y: 0 }));
    for (let i = 0; i < 8; i++) game.spawnHazard(new Projectile({ x: 10, y: 2 }, { x: 0, y: 0 }));
    game.update(0.1, undefined, true);
    expect(game.lives).toBe(2); expect(game.hazards).toHaveLength(0);
    expect(game.events.filter(event => event === 'hit')).toHaveLength(1);
  });
  it.each(Array.from({ length: 16 }, (_, i) => i))('detects a shot from direction %s crossing an old segment during retraction', direction => {
    const game = new Game(100, 100, { enemies: [], boss: null }); game.start();
    game.move('down', true, 30); game.move('left', true, 20); game.move('down', true, 20);
    const angle = direction * Math.PI / 8, dx = Math.cos(angle), dy = Math.sin(angle);
    game.spawnHazard(new Projectile({ x: 50 - dx * 5, y: 15 - dy * 5 }, { x: dx * 1000, y: dy * 1000 }));
    game.beginRetraction(); game.update(0.02);
    expect(game.lives).toBe(2); expect(game.trail).toHaveLength(0); expect(game.player).toEqual(game.anchor);
  });
  it('clears hazards on victory and freezes the result', () => {
    const game = fixture(); game.move('right', false, 5);
    game.spawnHazard(new Projectile({ x: 18, y: 1 }, { x: 1, y: 0 }));
    game.move('down', true, 20);
    expect(game.phase).toBe('won'); expect(game.hazards).toHaveLength(0);
    const elapsed = game.elapsed; game.update(10); expect(game.elapsed).toBe(elapsed);
  });
  it('bounds active hazards, frees expired slots and clears all attacks on loss', () => {
    const game = fixture();
    for (let i = 0; i < MAX_HAZARDS; i++) expect(game.spawnHazard(new Projectile({ x: -5, y: -5 }, { x: 0, y: 0 }))).toBe(true);
    expect(game.spawnHazard(new Projectile({ x: 10, y: 10 }, { x: 1, y: 0 }))).toBe(false);
    game.update(0.01); expect(game.hazards).toHaveLength(0);
    for (let i = 0; i < 3; i++) {
      game.protection = 0; game.spawnHazard(new Projectile({ ...game.player }, { x: 0, y: 0 })); game.update(0.01);
    }
    expect(game.phase).toBe('lost'); expect(game.hazards).toHaveLength(0);
  });
});

// A contact pulse has no velocity and never instantiates Projectile. It proves
// that a later theme can replace the skill without adding type switches to Game.
class ContactPulse implements AttackHazard {
  expired = false;
  age = 0;
  constructor(readonly origin: Point) {}
  update(seconds: number) { this.age += seconds; if (this.age >= 0.2) this.expired = true; }
  hitsPlayer(from: Point, to: Point, radius: number) { return distance(this.origin, from, to) <= 3 + radius; }
  hitsTrail(trail: Polygon, radius: number) { return trail.slice(1).some((p, i) => distance(this.origin, trail[i], p) <= 3 + radius); }
  onHit() { this.expired = true; }
  render() {}
}
describe('replaceable attack behavior', () => {
  it('accepts a non-projectile contact skill with independent lifecycle and damage', () => {
    let instances = 0;
    const factory: BossAttackFactory = () => {
      instances++; let cast = false;
      return { name: '近身冲击', warning: 0, update(_seconds, context) {
        if (!cast) { cast = true; context.spawn(new ContactPulse({ ...context.origin })); context.cast(); }
      } };
    };
    const options = () => ({ enemies: [], boss: createEnemy('boss', { x: 10, y: 2 }, { x: 0, y: 0 }), createBossAttack: factory });
    const game = new Game(20, 20, options()), other = new Game(20, 20, options());
    expect(instances).toBe(2); game.start(); game.update(0.01);
    expect(game.lives).toBe(2); expect(game.events).toContain('bossAttack');
    expect(game.bossAttack!.name).toBe('近身冲击'); expect(other.hazards).toHaveLength(0);
    game.update(0.01); expect(game.hazards).toHaveLength(0);
  });
});
