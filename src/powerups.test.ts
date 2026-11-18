import { describe, expect, it } from 'vitest';
import { Game, PLAYER_SPEED, RETRACT_SPEED } from './engine';
import { Island } from './island';
import { Projectile } from './attacks';
import { createEnemy } from './enemies';
import { distance, inside, type Point } from './geometry';
import { BOMB_RADIUS, POWER_UP_DURATION, powerUpPosition, rectangleOfArea, type PowerUpKind } from './powerups';

function game(random = () => 0.5) {
  const result = new Game(100, 100, { enemies: [], boss: null, powerUps: true, random, victory: { territoryPercent: 100 } });
  result.start(); return result;
}
function pickup(game: Game, kind: PowerUpKind) {
  // Exercise a real completed capture while leaving an occupied outside area.
  if (!game.enemies.length && !game.boss) game.enemies.push(createEnemy('straight', { x: 90, y: 90 }, { x: 0, y: 0 }));
  game.powerUp = { x: game.player.x + 5, y: game.player.y + 5, kind };
  game.move('down', true, 10); game.move('right', true, 10); game.move('up', true, 10);
  expect(game.powerUp).toBeUndefined();
  expect(game.events).toContainEqual({ type: 'powerup', kind });
  expect(game.powerUpEffects[kind]).toBeCloseTo(POWER_UP_DURATION[kind], 8);
}

describe('persistent power-ups', () => {
  it('starts with one randomly placed item and keeps it until collected', () => {
    const field = game(); const item = structuredClone(field.powerUp)!;
    expect(item).toBeDefined(); expect(inside(item, field.territories[0])).toBe(true);
    expect(Math.hypot(item.x - field.player.x, item.y - field.player.y)).toBeGreaterThanOrEqual(4);
    field.update(25); expect(field.powerUp).toEqual(item); expect(field.events.filter(e => typeof e === 'object' && e.type === 'powerup')).toHaveLength(0);
  });
  it.each([[0, 'slow'], [0.4, 'stop'], [0.5, 'speed'], [0.85, 'bomb'], [0.95, 'shuffle']] as const)('can spawn %s as a %s pickup', (random, kind) => {
    expect(game(() => random).powerUp?.kind).toBe(kind);
  });
  it('falls back to a water interior when no safely separated position exists', () => {
    const enemy = createEnemy('straight', { x: 3, y: 3 }, { x: 0, y: 0 }); enemy.visualRadius = 100;
    const field = new Game(6, 6, { enemies: [enemy], boss: null, powerUps: true, random: () => 0.5 });
    field.start(); expect(field.powerUp).toBeDefined();
    expect(inside(field.powerUp!, field.territories[0])).toBe(true);
    expect(field.isBoundary(field.powerUp!.x, field.powerUp!.y)).toBe(false);
  });
  it('finds interior water even in a narrow strip against the arena frame', () => {
    const region = [{ x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 6 }, { x: 0, y: 6 }];
    const point = powerUpPosition(6, 6, [region], [[region[1], region[2]]], { x: 3, y: 0 }, [], [], () => 0.5);
    expect(point).toBeDefined(); expect(inside(point!, region)).toBe(true);
  });
  it('keeps random and crowded fallback spawns near the actual edges of a concave island', () => {
    const frame = [{ x: 0, y: 0 }, { x: 72, y: 0 }, { x: 72, y: 48 }, { x: 0, y: 48 }];
    const land = [{ x: 3, y: 3 }, { x: 65, y: 3 }, { x: 65, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 43 }, { x: 3, y: 43 }];
    const island = new Island(frame, land), player = land[0];
    const enemy = createEnemy('straight', { x: 30, y: 30 }, { x: 0, y: 0 });
    let seed = 41;
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i <= 80; i++) {
      if (i === 80) enemy.visualRadius = 100;
      const point = powerUpPosition(72, 48, island.regions, island.coast, player, [enemy], [], random)!;
      expect(island.regions.some(room => inside(point, room))).toBe(true);
      expect(Math.min(...island.coast.map(([a, b]) => distance(point, a, b)))).toBeLessThanOrEqual(12);
    }
  });
  it.each(['slow', 'shuffle'] as const)('uses the live shore for opening and cooldown spawns after collecting %s', kind => {
    const field = new Game(100, 100, { opening: true, enemies: [], boss: null, powerUps: true, random: () => 0.5 });
    field.start();
    field.opening!.region = [{ x: 4, y: 4 }, { x: 24, y: 4 }, { x: 24, y: 24 }, { x: 4, y: 24 }];
    field.confirmOpening();
    const checkSpawn = (point: Point) => {
      expect(field.territories.some(room => inside(point, room))).toBe(true);
      expect(Math.min(...field.boundarySegments.map(([a, b]) => distance(point, a, b)))).toBeLessThanOrEqual(25);
    };
    checkSpawn(field.powerUp!);
    pickup(field, kind); field.update(15);
    checkSpawn(field.powerUp!);
  });
  it.each([0, 0.4, 1 - Number.EPSILON])('spawns the next item after a random 10–20 second cooldown, random=%s', random => {
    const field = game(() => random); pickup(field, 'slow');
    const wait = 10 + random * 9.9;
    field.update(wait - 0.01); expect(field.powerUp).toBeUndefined();
    field.update(0.02); expect(field.powerUp).toBeDefined();
    const item = structuredClone(field.powerUp); field.update(1); expect(field.powerUp).toEqual(item);
  });
  it('only advances cooldown and active effects while the game is playing', () => {
    const field = game(); pickup(field, 'slow'); field.update(1);
    const left = field.powerUpEffects.slow; field.togglePause(); field.update(30);
    expect(field.powerUpEffects.slow).toBe(left); expect(field.powerUp).toBeUndefined();
    field.togglePause(); field.update(9.01); expect(field.powerUpEffects.slow).toBe(0); expect(field.powerUp).toBeUndefined();
  });
  it('does not collect when the player or line passes over the item, including while retracting', () => {
    const swept = game(); swept.powerUp = { x: 50, y: 2.5, kind: 'speed' };
    swept.update(0.3, 'down', true);
    expect(swept.player.y).toBeGreaterThan(2.5); expect(swept.powerUp).toEqual({ x: 50, y: 2.5, kind: 'speed' });
    expect(swept.powerUpEffects.speed).toBe(0); expect(swept.events).not.toContainEqual({ type: 'powerup', kind: 'speed' });
    swept.beginRetraction(); swept.update(0.5);
    expect(swept.powerUp).toEqual({ x: 50, y: 2.5, kind: 'speed' }); expect(swept.powerUpEffects.speed).toBe(0);
  });
  it('collects only after a completed capture encloses the item', () => {
    const enclosed = game(); enclosed.powerUp = { x: 60, y: 10, kind: 'stop' };
    enclosed.enemies.push(createEnemy('straight', { x: 90, y: 90 }, { x: 0, y: 0 }));
    enclosed.move('down', true, 20); enclosed.move('right', true, 20);
    expect(enclosed.powerUp).toBeDefined(); expect(enclosed.powerUpEffects.stop).toBe(0);
    enclosed.move('up', true, 20);
    expect(enclosed.powerUp).toBeUndefined(); expect(enclosed.powerUpEffects.stop).toBe(3);
    expect(enclosed.events.filter(e => typeof e === 'object' && e.type === 'powerup')).toEqual([{ type: 'powerup', kind: 'stop' }]);
  });
  it('keeps an item outside the claimed area and does not acquire an item touched by the closing line', () => {
    for (const position of [{ x: 80, y: 10 }, { x: 50, y: 5 }]) {
      const field = game(); field.enemies.push(createEnemy('straight', { x: 90, y: 90 }, { x: 0, y: 0 }));
      field.powerUp = { ...position, kind: 'slow' };
      field.move('down', true, 10); field.move('right', true, 10); field.move('up', true, 10);
      expect(field.powerUp).toBeDefined(); expect(field.powerUpEffects.slow).toBe(0);
      expect(field.events).not.toContainEqual({ type: 'powerup', kind: 'slow' });
      expect(field.territories.some(region => inside(field.powerUp!, region))).toBe(true);
      expect(Math.hypot(field.powerUp!.x - position.x, field.powerUp!.y - position.y)).toBeLessThan(0.001);
    }
  });
  it('slows enemy movement by 30% for 10 seconds but leaves bullets and attack timing alone', () => {
    const enemy = createEnemy('straight', { x: 70, y: 60 }, { x: 10, y: 0 });
    let attackTime = 0;
    const boss = createEnemy('boss', { x: 30, y: 60 }, { x: 2, y: 0 });
    const field = new Game(100, 100, { enemies: [enemy], boss, powerUps: true, random: () => 0.5,
      createBossAttack: () => ({ name: 'test', warning: 0, update(dt) { attackTime += dt; } }), victory: { territoryPercent: 100 } });
    field.start(); const shot = new Projectile({ x: 10, y: 40 }, { x: 10, y: 0 }); field.spawnHazard(shot);
    pickup(field, 'slow'); const from = { enemy: enemy.x, boss: boss.x, shot: shot.position.x, attack: attackTime };
    field.update(1);
    expect(enemy.x - from.enemy).toBeCloseTo(7, 7); expect(boss.x - from.boss).toBeCloseTo(1.4, 7);
    expect(shot.position.x - from.shot).toBeCloseTo(10, 7); expect(attackTime - from.attack).toBeCloseTo(1, 7);
    field.update(9); expect(field.powerUpEffects.slow).toBe(0);
  });
  it('stops enemies, Boss, firing and bullets for 3 seconds and resumes without changing velocities', () => {
    const enemy = createEnemy('straight', { x: 70, y: 60 }, { x: 10, y: 0 });
    const boss = createEnemy('boss', { x: 30, y: 60 }, { x: 2, y: 0 }); let attackTime = 0;
    const field = new Game(100, 100, { enemies: [enemy], boss, powerUps: true, random: () => 0.5,
      createBossAttack: () => ({ name: 'test', warning: 0, update(dt) { attackTime += dt; } }), victory: { territoryPercent: 100 } });
    field.start(); const shot = new Projectile({ x: 10, y: 40 }, { x: 10, y: 0 }); field.spawnHazard(shot);
    pickup(field, 'stop'); const from = { enemy: enemy.x, boss: boss.x, shot: shot.position.x, attack: attackTime };
    field.update(2.5);
    expect(enemy.x).toBe(from.enemy); expect(boss.x).toBe(from.boss); expect(shot.position.x).toBe(from.shot); expect(attackTime).toBe(from.attack);
    expect(enemy.vx).toBe(10); expect(boss.vx).toBe(2); expect(shot.velocity.x).toBe(10);
    field.togglePause(); field.update(10); expect(field.powerUpEffects.stop).toBeCloseTo(0.5, 7);
    field.togglePause(); field.update(1);
    expect(enemy.x - from.enemy).toBeCloseTo(5, 6); expect(boss.x - from.boss).toBeCloseTo(1, 6);
    expect(shot.position.x - from.shot).toBeCloseTo(5, 6); expect(attackTime - from.attack).toBeCloseTo(0.5, 6);
    expect(field.powerUpEffects.stop).toBe(0);
  });
  it('freezes a Boss jump and keeps frozen bullets dangerous at their current position', () => {
    const boss = createEnemy('boss', { x: 70, y: 60 }, { x: 0, y: 0 });
    const field = new Game(100, 100, { enemies: [], boss, powerUps: true, random: () => 0.5 }); field.start();
    pickup(field, 'stop'); field.bossJump = { from: { x: 70, y: 60 }, to: { x: 80, y: 60 }, elapsed: 0.2, duration: 0.9 };
    field.update(0.5); expect(field.bossJump.elapsed).toBe(0.2);
    field.spawnHazard(new Projectile({ ...field.player }, { x: 10, y: 0 })); field.update(0.01);
    expect(field.lives).toBe(2); expect(field.bossJump!.elapsed).toBe(0.2);
  });
  it('boosts player movement and retraction by 50% for 10 seconds', () => {
    const field = game(); pickup(field, 'speed');
    const x = field.player.x; field.update(1, 'right', false);
    expect(field.player.x - x).toBeCloseTo(PLAYER_SPEED * 1.5, 7);
    const retraction = game(); pickup(retraction, 'speed');
    retraction.player = { x: 40, y: 0 }; retraction.anchor = { ...retraction.player }; retraction.move('down', true, 20);
    const from = { ...retraction.player }; retraction.beginRetraction(); retraction.update(0.1);
    expect(from.y - retraction.player.y).toBeCloseTo(RETRACT_SPEED * 1.5 * 0.1, 7);
    field.update(9); expect(field.powerUpEffects.speed).toBe(0); expect(field.lineSpeed).toBe(PLAYER_SPEED);
  });
  it('resolves overlapping slow and stop by pausing first, then applying slow to the remaining time', () => {
    const field = game(), enemy = createEnemy('straight', { x: 70, y: 60 }, { x: 10, y: 0 }); field.enemies.push(enemy);
    field.powerUpEffects.stop = 0.25; field.powerUpEffects.slow = 0.75;
    const from = enemy.x; field.update(1);
    expect(enemy.x - from).toBeCloseTo(10 * (0.5 * 0.7 + 0.25), 6);
    expect(field.powerUpEffects.stop).toBe(0); expect(field.powerUpEffects.slow).toBe(0);
  });
  it('damages everyone outside the bomb circle once the countdown ends', () => {
    const near = createEnemy('straight', { x: 12, y: 10 }, { x: 0, y: 0 });
    const far = createEnemy('orbit', { x: 70, y: 40 }, { x: 0, y: 0 });
    const boss = createEnemy('boss', { x: 60, y: 30 }, { x: 0, y: 0 });
    const field = new Game(72, 48, { enemies: [near, far], boss, powerUps: true, random: () => 0.5, victory: { territoryPercent: 100 },
      createBossAttack: () => ({ name: 'idle', warning: 0, update() {} }) });
    field.start(); field.player = { x: 10, y: 10 }; field.powerUpEffects.bomb = 3;
    field.update(2.9); expect(field.enemies).toHaveLength(2); expect(field.bossHealth).toBe(field.bossMaxHealth);
    field.update(0.2);
    expect(field.enemies.map(enemy => enemy.kind)).toEqual(['straight']);
    expect(Math.hypot(near.x - field.player.x, near.y - field.player.y)).toBeLessThanOrEqual(BOMB_RADIUS);
    expect(field.bossHealth).toBe(field.bossMaxHealth - 1);
    expect(field.events).toContainEqual(expect.objectContaining({ type: 'bossHit' }));
  });
  it('relays the claimed land into an equal-area rectangle', () => {
    const field = new Game(72, 48, { opening: true, enemies: [], boss: null, powerUps: true, random: () => 0.2, victory: { territoryPercent: 100 } });
    field.start(); expect(field.confirmOpening()).toBe(true);
    const before = field.claimed;
    let reshapes = 0;
    const original = Island.prototype.reshape;
    Island.prototype.reshape = function (polygon) { reshapes++; return original.call(this, polygon); };
    try {
      field.powerUpEffects.shuffle = 3;
      field.update(0.05);
      expect(reshapes).toBe(1);
      const formed = field.claimedRings();
      field.update(0.05);
      expect(reshapes).toBe(1);
      expect(field.claimedRings()).toEqual(formed);
      field.update(3);
    } finally {
      Island.prototype.reshape = original;
    }
    expect(field.claimed).toBeCloseTo(before, 6);
    expect(field.powerUpEffects.shuffle).toBe(0);
    const rings = field.claimedRings();
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
    const xs = new Set(rings[0].map(point => Math.round(point.x * 1000)));
    const ys = new Set(rings[0].map(point => Math.round(point.y * 1000)));
    expect(xs.size).toBe(2); expect(ys.size).toBe(2);
    const target = rectangleOfArea(72, 48, before, { x: 36, y: 24 });
    expect(target.w * target.h).toBeCloseTo(before, 6);
  });
  it.each([
    ['left', 0, 0.5, 'down', 'right'],
    ['right', 1, 0.5, 'down', 'left'],
    ['up', 0.5, 0, 'right', 'down'],
    ['down', 0.5, 1, 'right', 'up'],
  ] as const)('can close a new pocket on the %s side immediately after collecting shuffle', (out, x, y, along, back) => {
    const field = new Game(100, 100, { opening: true, enemies: [], boss: null, powerUps: true, random: () => 0.5 });
    field.start();
    field.opening!.region = [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 }];
    field.confirmOpening();
    pickup(field, 'shuffle');

    const before = field.claimed;
    const rect = rectangleOfArea(100, 100, before, { x: 50, y: 50 });
    field.player = { x: rect.x + x * rect.w, y: rect.y + y * rect.h };
    field.move(out, true, 3);
    field.move(along, true, 4);
    field.move(back, true, 3);
    expect(field.retracting).toBe(false);
    expect(field.trail).toHaveLength(0);
    expect(field.claimed).toBeCloseTo(before + 12, 7);

    field.update(POWER_UP_DURATION.shuffle);
    expect(field.claimed).toBeCloseTo(before + 12, 7);
    field.move(along, false, 2);
    field.move(out, true, 3);
    field.move(along, true, 4);
    field.move(back, true, 3);
    expect(field.claimed).toBeCloseTo(before + 24, 7);
  });
  it('restarts without a stale pickup or active effect', () => {
    const first = game(); pickup(first, 'speed');
    const fresh = game(); expect(fresh.powerUp).toBeDefined();
    expect(fresh.powerUpEffects).toEqual({ slow: 0, stop: 0, speed: 0, bomb: 0, shuffle: 0 });
  });
});
