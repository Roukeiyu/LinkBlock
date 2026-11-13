import { describe, expect, it } from 'vitest';
import { Game, PLAYER_SPEED, RETRACT_SPEED } from './engine';
import { Projectile } from './attacks';
import { createEnemy } from './enemies';
import { inside } from './geometry';
import { POWER_UP_DURATION, powerUpPosition, type PowerUpKind } from './powerups';

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
  it.each([[0, 'slow'], [0.4, 'stop'], [0.8, 'speed']] as const)('can spawn %s as a %s pickup', (random, kind) => {
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
    const point = powerUpPosition(6, 6, [region], { x: 3, y: 0 }, [], [], () => 0.5);
    expect(point).toBeDefined(); expect(inside(point!, region)).toBe(true);
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
  it('restarts without a stale pickup or active effect', () => {
    const first = game(); pickup(first, 'speed');
    const fresh = game(); expect(fresh.powerUp).toBeDefined();
    expect(fresh.powerUpEffects).toEqual({ slow: 0, stop: 0, speed: 0 });
  });
});
