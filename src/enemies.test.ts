import { describe, expect, it } from 'vitest';
import { advanceEnemy, createEnemy, ENEMY_STYLES, type EnemyKind } from './enemies';
import { Game } from './engine';
import { distance, edges, inside } from './geometry';
import { MAX_HAZARDS } from './attacks';

const kinds: EnemyKind[] = ['straight', 'orbit', 'zigzag', 'boss'];
const arena = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const walls = [edges(arena)];
function run(enemy: ReturnType<typeof createEnemy>, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 120); i++) advanceEnemy(enemy, 1 / 120, [arena], walls);
}

describe('independent enemy motion', () => {
  it('spawns three of each ordinary enemy and a slower, visibly larger boss with independent state', () => {
    const game = new Game(), fresh = new Game();
    expect(game.enemies).toHaveLength(9);
    for (const kind of kinds.slice(0, 3)) expect(game.enemies.filter(enemy => enemy.kind === kind)).toHaveLength(3);
    expect(new Set(game.enemies.map(enemy => enemy.trace)).size).toBe(9);
    expect(game.enemies[0]).not.toBe(fresh.enemies[0]);
    expect(game.boss!.visualRadius).toBe(2); expect(game.boss!.radius).toBe(1.65);
    expect(game.boss!.radius).toBeLessThan(game.boss!.visualRadius * Math.cos(Math.PI / 6));
    expect(game.boss?.kind).toBe('boss');
    const speeds = Object.fromEntries(kinds.map(kind => [kind, ENEMY_STYLES[kind].speed]));
    expect(speeds.straight).toBeGreaterThan(speeds.zigzag);
    expect(speeds.zigzag).toBeGreaterThan(speeds.orbit);
    expect(speeds.orbit).toBeGreaterThan(speeds.boss);
    expect(game.bossAttack).not.toBe(fresh.bossAttack);
    for (const body of [...game.enemies, game.boss!]) expect(inside(body, game.territories[0])).toBe(true);
  });
  it.each([[6, 6], [6, 20], [20, 6], [20, 20], [72, 48]])('safely places the full roster in a %s × %s arena', (width, height) => {
    const game = new Game(width, height), bodies = [...game.enemies, game.boss!];
    expect(game.enemies).toHaveLength(9);
    for (const body of bodies) {
      const clearance = body.kind === 'boss' ? body.visualRadius : body.radius;
      expect(Math.min(...edges(game.outline).map(([a, b]) => distance(body, a, b)))).toBeGreaterThanOrEqual(clearance);
      expect(Math.hypot(body.x - game.player.x, body.y - game.player.y)).toBeGreaterThan(body.radius + 0.34);
      for (const other of bodies.filter(other => other !== body)) {
        expect(Math.hypot(body.x - other.x, body.y - other.y)).toBeGreaterThan(body.radius + other.radius);
      }
    }
  });
  it('moves straight at constant speed, curves in an orbit and alternates zigzag legs', () => {
    const straight = createEnemy('straight', { x: 50, y: 50 });
    const initial = { vx: straight.vx, vy: straight.vy }; run(straight, 0.5);
    expect(straight.x).toBeCloseTo(50 + initial.vx * 0.5, 8);
    expect(straight.y).toBeCloseTo(50 + initial.vy * 0.5, 8);
    const orbit = createEnemy('orbit', { x: 50, y: 50 }); run(orbit, 0.5);
    expect(orbit.vx).toBeGreaterThan(1);
    expect(Math.hypot(orbit.vx, orbit.vy)).toBeCloseTo(ENEMY_STYLES.orbit.speed, 8);
    const zigzag = createEnemy('zigzag', { x: 50, y: 50 });
    const initialZig = { x: zigzag.vx, y: zigzag.vy }; run(zigzag, 0.3);
    expect(zigzag.vx).toBeCloseTo(initialZig.x, 8); expect(zigzag.vy).toBeCloseTo(initialZig.y, 8);
    run(zigzag, 0.45); expect(zigzag.vy).toBeGreaterThan(0);
    run(zigzag, 0.75); expect(zigzag.vx).toBeCloseTo(initialZig.x, 8); expect(zigzag.vy).toBeCloseTo(initialZig.y, 8);
  });
  it.each(kinds)('%s reflects at a boundary without crossing it or changing speed', kind => {
    const clearance = ENEMY_STYLES[kind].radius;
    const enemy = createEnemy(kind, { x: 100 - clearance - 0.01, y: 50 }, { x: ENEMY_STYLES[kind].speed, y: 0 });
    run(enemy, 0.2);
    expect(enemy.vx).toBeLessThan(0); expect(inside(enemy, arena)).toBe(true);
    expect(Math.min(...walls[0].map(([a, b]) => distance(enemy, a, b)))).toBeGreaterThanOrEqual(clearance - 1e-7);
    expect(Math.hypot(enemy.vx, enemy.vy)).toBeCloseTo(ENEMY_STYLES[kind].speed, 8);
  });
  it('never steers towards the player or follows a live trail', () => {
    const a = new Game(), b = new Game(); a.start(); b.start();
    b.move('down', true, 5);
    a.protection = b.protection = 100;
    for (let i = 0; i < 600; i++) { a.update(1 / 60); b.update(1 / 60, undefined, true); }
    expect(a.player).not.toEqual(b.player);
    expect(a.enemies).toEqual(b.enemies); expect(a.boss).toEqual(b.boss);
    expect(a.hazards).toEqual(b.hazards);
  });
});

describe('multiple danger components', () => {
  function splitFixture() {
    const game = new Game(20, 20, { enemies: [createEnemy('straight', { x: 5, y: 6 }, { x: 0, y: 0 }), createEnemy('orbit', { x: 15, y: 14 }, { x: 0, y: 0 })], boss: null });
    game.start(); return game;
  }
  it('keeps both occupied halves dangerous and captures only a later empty component', () => {
    const game = splitFixture(); expect(game.move('down', true, 20)).toBe(true);
    expect(game.territories).toHaveLength(2); expect(game.percent).toBe(0);
    expect(game.lastCapture).toHaveLength(0); expect(game.events).toContain('partition');
    game.move('up', false, 10); expect(game.move('left', true, 10)).toBe(true);
    expect(game.percent).toBeCloseTo(25); expect(game.lastCapture).toHaveLength(1);
    for (const enemy of game.enemies) expect(game.territories.filter(region => inside(enemy, region))).toHaveLength(1);
    expect(game.isBoundary(10, 10)).toBe(true);
  });
  it('includes the boss when deciding which regions are still occupied', () => {
    const game = new Game(20, 20, { enemies: [createEnemy('straight', { x: 15, y: 10 }, { x: 0, y: 0 })], boss: createEnemy('boss', { x: 5, y: 10 }, { x: 0, y: 0 }) });
    game.start(); game.move('down', true, 20);
    expect(game.percent).toBe(0); expect(game.territories).toHaveLength(2);
    expect(game.territories.some(region => inside(game.boss!, region))).toBe(true);
  });
  it('keeps every enemy inside its own component after subsequent captures', () => {
    const game = splitFixture(); game.move('down', true, 20); game.move('up', false, 10); game.move('left', true, 10);
    game.enemies[0].vx = 14; game.enemies[0].vy = 3;
    game.enemies[1].vx = -3; game.enemies[1].vy = 4;
    for (let i = 0; i < 1800; i++) {
      game.update(1 / 60);
      for (const enemy of game.enemies) {
        const region = game.territories.find(region => inside(enemy, region)); expect(region).toBeDefined();
        expect(Math.min(...edges(region!).map(([a, b]) => distance(enemy, a, b)))).toBeGreaterThanOrEqual(enemy.radius - 1e-7);
      }
    }
    expect(game.percent).toBeCloseTo(25);
  });
  it.each(kinds)('%s can sever a live line and trigger one hit', kind => {
    const game = new Game(20, 20, { enemies: [], boss: null }); game.start(); game.move('down', true, 5);
    const attacker = createEnemy(kind, { x: 10.4, y: 2 }, { x: 0, y: 0 });
    if (kind === 'boss') game.boss = attacker; else game.enemies.push(attacker);
    game.update(0.01, undefined, true);
    expect(game.lives).toBe(2); expect(game.trail).toHaveLength(0); expect(game.player).toEqual(game.anchor);
  });
});

describe('continuous collision with the whole live trail', () => {
  it('keeps a boss moving after a new boundary closes inside its visible margin but outside its hit circle', () => {
    const boss = createEnemy('boss', { x: 34.1, y: 24 }, { x: 2.3, y: 0 });
    const game = new Game(72, 48, { enemies: [], boss }); game.start(); game.move('down', true, 48);
    expect(game.bossHealth).toBe(5); expect(game.lives).toBe(3); expect(game.bossJump).toBeUndefined();
    expect(game.percent).toBe(50);
    game.update(0.5); expect(boss.x).toBeLessThan(34.1); expect(boss.vx).toBeLessThan(0);
    expect(36 - boss.x).toBeGreaterThanOrEqual(boss.radius);
  });
  it('uses the smaller boss hit circle for live and retracting trails, including a swept crossing', () => {
    for (const retracting of [false, true]) {
      const game = new Game(30, 30, { enemies: [], boss: null }); game.start(); game.move('down', true, 10);
      const boss = createEnemy('boss', { x: 16.9, y: 3 }, { x: 0, y: 0 }); game.boss = boss;
      if (retracting) game.beginRetraction();
      game.update(0.01, undefined, !retracting);
      expect(game.lives).toBe(3); // The visible hexagon overlaps, its hit circle does not.
      boss.vx = -100; game.update(0.01, undefined, !retracting);
      expect(game.lives).toBe(2); expect(game.events.filter(event => event === 'hit')).toHaveLength(1);
    }
  });
  it.each(kinds.flatMap(kind => [false, true].map(retracting => ({ kind, retracting }))))('$kind crosses an older segment while retracting=$retracting', ({ kind, retracting }) => {
    const game = new Game(100, 100, { enemies: [], boss: null }); game.start();
    game.move('down', true, 30); game.move('left', true, 20); game.move('down', true, 20);
    const body = createEnemy(kind, { x: 65, y: 15 }, { x: -250, y: 0 });
    if (kind === 'boss') game.boss = body; else game.enemies.push(body);
    if (retracting) game.beginRetraction();
    game.update(0.1, undefined, !retracting);
    expect(game.lives).toBe(2); expect(game.trail).toHaveLength(0); expect(game.retracting).toBe(false);
    expect(game.player).toEqual(game.anchor); expect(game.events.filter(e => e === 'hit')).toHaveLength(1);
    expect(game.claimed).toBe(0);
  });
});

describe('sustained simulation and bounded storage', () => {
  it('runs two simulated minutes with bounded projectiles and wakes', () => {
    const game = new Game(); game.start(); game.protection = 1000;
    const started = performance.now(); let peak = 0;
    for (let i = 0; i < 7200; i++) {
      game.update(1 / 60); peak = Math.max(peak, game.hazards.length);
      expect(game.hazards.length).toBeLessThanOrEqual(MAX_HAZARDS);
      for (const body of [...game.enemies, game.boss!]) expect(body.trace.length).toBeLessThanOrEqual(18);
      game.events.length = 0;
    }
    const duration = performance.now() - started;
    expect(game.elapsed).toBeCloseTo(120, 5); expect(peak).toBeGreaterThanOrEqual(8); expect(peak).toBeLessThanOrEqual(24);
    expect(duration).toBeLessThan(6000);
  });
});
