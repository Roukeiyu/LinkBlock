import { describe, expect, it } from 'vitest';
import { Game, PLAYER_SPEED, RETRACT_SPEED } from './engine';
import { Island } from './island';
import { Projectile } from './attacks';
import { createEnemy } from './enemies';
import { distance, inside, type Point } from './geometry';
import { BOMB_RADIUS, BOMB_RADIUS_FACTOR, POWER_UP_DURATION, WARD_RADIUS, contactReach, powerUpPosition, rectangleOfArea, rollBombRadius, type PowerUpKind } from './powerups';

function game(random = () => 0.5) {
  const result = new Game(100, 100, { enemies: [], boss: null, powerUps: true, random, victory: { territoryPercent: 100 } });
  result.start(); return result;
}
function pickup(game: Game, kind: PowerUpKind) {
  game.powerUp = { ...game.player, kind };
  game.move('right', false, 0);
  expect(game.powerUp).toBeUndefined();
  expect(game.events).toContainEqual({ type: 'powerup', kind });
  if (kind === 'shield') expect(game.shielded).toBe(true);
  else expect(game.powerUpEffects[kind]).toBeCloseTo(POWER_UP_DURATION[kind] * game.modifiers.duration, 8);
}

describe('persistent power-ups', () => {
  it('starts with one randomly placed item and keeps it until collected', () => {
    const field = game(); const item = structuredClone(field.powerUp)!;
    expect(item).toBeDefined(); expect(inside(item, field.territories[0])).toBe(true);
    expect(Math.hypot(item.x - field.player.x, item.y - field.player.y)).toBeGreaterThanOrEqual(4);
    field.update(25); expect(field.powerUp).toEqual(item); expect(field.events.filter(e => typeof e === 'object' && e.type === 'powerup')).toHaveLength(0);
  });
  it.each([[0, 'slow'], [0.25, 'stop'], [0.4, 'speed'], [0.6, 'bomb'], [0.66, 'shuffle'], [0.75, 'shield'], [0.9, 'ward']] as const)('can spawn %s as a %s pickup', (random, kind) => {
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
    pickup(field, kind); field.update(5);
    checkSpawn(field.powerUp!);
  });
  it.each([0, 0.4, 1 - Number.EPSILON])('spawns the next item after five seconds for any drop roll, random=%s', random => {
    const field = game(() => random); pickup(field, 'slow');
    field.update(4.99); expect(field.powerUp).toBeUndefined();
    field.update(0.01); expect(field.powerUp).toBeDefined();
    const item = structuredClone(field.powerUp); field.update(1); expect(field.powerUp).toEqual(item);
  });
  it('only advances cooldown and active effects while the game is playing', () => {
    const field = game(); pickup(field, 'slow'); field.update(1);
    const left = field.powerUpEffects.slow; field.togglePause(); field.update(30);
    expect(field.powerUpEffects.slow).toBe(left); expect(field.powerUp).toBeUndefined();
    field.togglePause(); field.update(3.99); expect(field.powerUp).toBeUndefined();
    field.update(0.01); expect(field.powerUp).toBeDefined(); expect(field.powerUpEffects.slow).toBeCloseTo(5);
    field.update(5); expect(field.powerUpEffects.slow).toBe(0);
  });
  it('collects when the player body touches the item, including while drawing and retracting', () => {
    const swept = game(); swept.powerUp = { x: 50, y: 2.5, kind: 'speed' };
    swept.update(0.3, 'down', true);
    expect(swept.player.y).toBeGreaterThan(2.5); expect(swept.powerUp).toBeUndefined();
    expect(swept.powerUpEffects.speed).toBeGreaterThan(9); expect(swept.events).toContainEqual({ type: 'powerup', kind: 'speed' });
    const returning = game(); returning.powerUp = { x: 50, y: 4, kind: 'stop' };
    returning.move('down', true, 8); expect(returning.powerUp).toBeUndefined();
    const beside = game();
    beside.move('down', true, 8); beside.beginRetraction();
    beside.powerUp = { x: 50, y: 3, kind: 'slow' };
    beside.update(0.4);
    expect(beside.player.y).toBeLessThan(3); expect(beside.powerUp).toBeUndefined();
    expect(beside.powerUpEffects.slow).toBeGreaterThan(9);
  });
  it('does not collect an item the player only encloses, and puts that item back in open water', () => {
    const enclosed = game(); enclosed.powerUp = { x: 55, y: 5, kind: 'stop' };
    enclosed.enemies.push(createEnemy('straight', { x: 90, y: 90 }, { x: 0, y: 0 }));
    enclosed.move('down', true, 10); enclosed.move('right', true, 10); enclosed.move('up', true, 10);
    expect(enclosed.powerUpEffects.stop).toBe(0);
    expect(enclosed.events.filter(e => typeof e === 'object' && e.type === 'powerup')).toEqual([]);
    expect(enclosed.powerUp).toBeDefined();
    expect(enclosed.territories.some(region => inside(enclosed.powerUp!, region))).toBe(true);
    const missed = game(); missed.enemies.push(createEnemy('straight', { x: 90, y: 90 }, { x: 0, y: 0 }));
    missed.powerUp = { x: 80, y: 10, kind: 'slow' };
    missed.move('down', true, 10); missed.move('right', true, 10); missed.move('up', true, 10);
    expect(missed.powerUp).toEqual({ x: 80, y: 10, kind: 'slow' });
    expect(missed.powerUpEffects.slow).toBe(0);
  });
  it('uses pickup range to widen contact and still ignores a miss', () => {
    const near = game(); near.modifiers.range = 0;
    near.powerUp = { x: near.player.x + contactReach() + 0.2, y: near.player.y, kind: 'slow' };
    near.move('right', false, 0); expect(near.powerUp).toBeDefined();
    near.modifiers.range = 0.3; near.move('right', false, 0);
    expect(near.powerUp).toBeUndefined(); expect(near.powerUpEffects.slow).toBeCloseTo(10, 8);
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
  it.each([0, 0.5, 1])('rolls the bomb blast by a factor inside [1.5, 1.8], random=%s', random => {
    const radius = rollBombRadius(BOMB_RADIUS, () => random);
    const factor = BOMB_RADIUS_FACTOR.min + (BOMB_RADIUS_FACTOR.max - BOMB_RADIUS_FACTOR.min) * random;
    expect(radius).toBeCloseTo(BOMB_RADIUS * factor, 8);
    expect(radius).toBeGreaterThanOrEqual(BOMB_RADIUS * BOMB_RADIUS_FACTOR.min);
    expect(radius).toBeLessThanOrEqual(BOMB_RADIUS * BOMB_RADIUS_FACTOR.max);
  });
  it('clamps an out-of-range bomb roll to the same inclusive interval', () => {
    expect(rollBombRadius(BOMB_RADIUS, () => -2)).toBeCloseTo(BOMB_RADIUS * BOMB_RADIUS_FACTOR.min, 8);
    expect(rollBombRadius(BOMB_RADIUS, () => 4)).toBeCloseTo(BOMB_RADIUS * BOMB_RADIUS_FACTOR.max, 8);
  });
  it.each([[0, 1], [0.01, 0]])('hits only enemies inside the rolled blast, past the rim by %s', (past, damage) => {
    const rolled = BOMB_RADIUS * 1.65;
    const near = createEnemy('straight', { x: 70, y: rolled - 1 }, { x: 0, y: 0 });
    const rim = createEnemy('straight', { x: 70, y: rolled }, { x: 0, y: 0 });
    const outside = createEnemy('straight', { x: 70, y: rolled + 1 }, { x: 0, y: 0 });
    const bossDistance = rolled + past;
    const boss = createEnemy('boss', { x: 70, y: bossDistance }, { x: 0, y: 0 });
    const field = new Game(100, 100, { enemies: [near, rim, outside], boss, powerUps: true, random: () => 0.5, victory: { territoryPercent: 100 },
      createBossAttack: () => ({ name: 'idle', warning: 0, update() {} }) });
    field.start(); pickup(field, 'bomb');
    expect(field.bombRadius).toBeCloseTo(rolled, 8);
    field.update(2.99); expect(field.enemies).toHaveLength(3); expect(field.bossHealth).toBe(field.bossMaxHealth);
    field.player = { x: 60, y: 0 }; field.anchor = { ...field.player };
    field.move('right', false, 10); expect(field.player).toEqual({ x: 70, y: 0 });
    field.update(0.01); expect(field.enemies).toEqual([outside]);
    field.update(1); expect(field.bossHealth).toBe(field.bossMaxHealth - damage);
    expect(field.events.filter(e => typeof e === 'object' && e.type === 'bossHit')).toHaveLength(damage);
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
    expect(fresh.powerUpEffects).toEqual({ slow: 0, stop: 0, speed: 0, bomb: 0, shuffle: 0, shield: 0, ward: 0 });
    expect(fresh.shielded).toBe(false);
  });
  it('scales duration, respawn and movement from the badge modifiers', () => {
    const lasting = game(); lasting.modifiers.duration = 1.08; pickup(lasting, 'ward');
    expect(lasting.powerUpEffects.ward).toBeCloseTo(POWER_UP_DURATION.ward * 1.08, 8);
    const cooled = game(); cooled.modifiers.cooldown = 0.5; pickup(cooled, 'slow');
    cooled.update(2.49); expect(cooled.powerUp).toBeUndefined();
    cooled.update(0.01); expect(cooled.powerUp).toBeDefined();
    const faster = game(); faster.modifiers.speed = 1.04; pickup(faster, 'stop');
    const x = faster.player.x; faster.update(1, 'right', false);
    expect(faster.player.x - x).toBeCloseTo(PLAYER_SPEED * 1.04, 6);
  });
  it('spends a shield on one hit and leaves the next hit to the life', () => {
    const field = game(); pickup(field, 'shield');
    expect(field.powerUpEffects.shield).toBe(0);
    field.spawnHazard(new Projectile({ ...field.player }, { x: 10, y: 0 })); field.update(0.01);
    expect(field.lives).toBe(3); expect(field.hitsTaken).toBe(0); expect(field.shielded).toBe(false);
    expect(field.protection).toBeGreaterThan(1);
    field.update(0.2); expect(field.lives).toBe(3);
    field.protection = 0;
    field.spawnHazard(new Projectile({ ...field.player }, { x: 10, y: 0 })); field.update(0.01);
    expect(field.lives).toBe(2); expect(field.hitsTaken).toBe(1);
  });
  it('keeps monsters outside the ward and walks one that is already inside back out', () => {
    const incoming = createEnemy('straight', { x: 50, y: 12 }, { x: 0, y: -14 });
    const buried = createEnemy('straight', { x: 50, y: 3 }, { x: 0, y: -8 });
    const field = new Game(100, 100, { enemies: [incoming, buried], boss: null, powerUps: true, random: () => 0.5, victory: { territoryPercent: 100 } });
    field.start(); field.player = { x: 50, y: 0 }; field.anchor = { ...field.player };
    field.powerUpEffects.ward = 8;
    field.update(1);
    expect(Math.hypot(incoming.x - field.player.x, incoming.y - field.player.y)).toBeGreaterThanOrEqual(WARD_RADIUS - 0.05);
    expect(Math.hypot(buried.x - field.player.x, buried.y - field.player.y)).toBeGreaterThanOrEqual(WARD_RADIUS - 0.05);
    expect(field.powerUpEffects.ward).toBeCloseTo(7, 5);
  });
});
