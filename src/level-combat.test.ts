import { describe, expect, it } from 'vitest';
import { Game } from './engine';
import { advanceEnemy, createEnemy } from './enemies';
import { LEVELS, gameOptionsFor } from './levels';
import { inside, wallEdges } from './geometry';
import { MAX_HAZARDS } from './attacks';

function seeded() { let seed = 37; return () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32; }
const room = [{ x: 0, y: 0 }, { x: 72, y: 0 }, { x: 72, y: 48 }, { x: 0, y: 48 }];

describe('level-specific enemy movement', () => {
  it('gives the desert and horseman a slow windup followed by a bounded charge', () => {
    for (const level of [LEVELS[1], LEVELS[4]]) {
      const enemy = createEnemy('straight', { x: 30, y: 24 }, { x: 10, y: 0 });
      const motion = level.enemyMotion!;
      advanceEnemy(enemy, 0.1, [room], [wallEdges(room)], motion);
      expect(enemy.x - 30).toBeCloseTo(0.45);
      const before = enemy.x; enemy.motionClock = motion.period * 0.7;
      advanceEnemy(enemy, 0.1, [room], [wallEdges(room)], motion);
      expect(enemy.x - before).toBeCloseTo(1.7);
      expect(enemy.vx).toBe(10);
    }
    expect(LEVELS[4].enemyMotion!.period).toBeLessThan(LEVELS[1].enemyMotion!.period);
  });
  it('turns laboratory enemies by a right angle and bends castle patrols continuously', () => {
    const corner = createEnemy('straight', { x: 30, y: 24 }, { x: 10, y: 0 });
    corner.motionClock = LEVELS[2].enemyMotion!.period - 0.05;
    advanceEnemy(corner, 0.1, [room], [wallEdges(room)], LEVELS[2].enemyMotion);
    expect(corner.vx).toBeCloseTo(0); expect(corner.vy).toBeCloseTo(10);
    const curve = createEnemy('straight', { x: 30, y: 24 }, { x: 10, y: 0 });
    advanceEnemy(curve, 0.1, [room], [wallEdges(room)], LEVELS[3].enemyMotion);
    expect(curve.vx).toBeGreaterThan(0); expect(curve.vy).toBeGreaterThan(0);
    expect(Math.hypot(curve.vx, curve.vy)).toBeCloseTo(10);
  });
  it.each(LEVELS)('$title keeps all movement inside real danger regions for a minute', level => {
    for (const kind of ['straight', 'orbit', 'zigzag'] as const) {
      const enemy = createEnemy(kind, { x: 36, y: 24 });
      for (let frame = 0; frame < 3600; frame++) {
        advanceEnemy(enemy, 1 / 60, [room], [wallEdges(room)], level.enemyMotion);
        expect(inside(enemy, room)).toBe(true);
      }
      expect(enemy.trace.length).toBeLessThanOrEqual(18);
    }
  });
});

function hitBoss(game: Game) {
  if (game.bossJump) game.update(1);
  game.protection = 0; game.hazards = []; game.enemies = [];
  game.territories = [game.outline.map(p => ({ ...p }))];
  game.player = { x: 54, y: 0 }; game.anchor = { ...game.player };
  Object.assign(game.boss!, { x: 62, y: 36, vx: 0, vy: 0, previous: { x: 62, y: 36 } });
  expect(game.move('down', true, 48)).toBe(true);
  game.protection = 1000;
}
describe('actual level battle lifecycle', () => {
  it.each(LEVELS)('$title uses its own skill, advances through real captures, pauses and resets', level => {
    const options = { ...gameOptionsFor(level), opening: false, victory: { territory: false }, random: seeded() };
    const game = new Game(72, 48, options); game.start(); game.protection = 1000;
    const name = game.bossAttack!.name;
    expect(name).toBe(['十字 / X 交替', '流沙扇射', '旋转电弧', '血翼夹击', '缺口围猎'][level.id - 1]);
    const first = game.bossAttack;
    hitBoss(game); expect(game.bossHealth).toBe(4); expect(game.bossAttack).toBe(first);
    hitBoss(game); expect(game.bossHealth).toBe(3); expect(game.bossAttack).not.toBe(first);
    if (level.id > 1) expect(game.bossAttack!.name).toBe(name);
    game.enemies = []; game.update(7);
    expect(game.enemies.length).toBe(game.reinforcementTarget);
    if (level.enemyMotion) expect(game.enemies.every(enemy => enemy.motionClock !== undefined)).toBe(true);
    game.togglePause();
    const positions = game.enemies.map(e => ({ x: e.x, y: e.y, clock: e.motionClock }));
    const warning = game.bossAttack!.warning, hazards = structuredClone(game.hazards);
    game.update(20);
    expect(game.enemies.map(e => ({ x: e.x, y: e.y, clock: e.motionClock }))).toEqual(positions);
    expect(game.bossAttack!.warning).toBe(warning);
    expect(structuredClone(game.hazards)).toEqual(hazards);
    game.togglePause(); hitBoss(game); hitBoss(game);
    expect(game.bossHealth).toBe(1); expect(game.reinforcementTarget).toBe(level.id === 1 ? 15 : 13 + level.id);
    game.update(10); expect(game.hazards.length).toBeLessThanOrEqual(MAX_HAZARDS);
    hitBoss(game); expect(game.phase).toBe('won'); expect(game.hazards).toEqual([]);
    const fresh = new Game(72, 48, { ...options, random: seeded() });
    expect(fresh.bossAttack!.name).toBe(name); expect(fresh.bossAttack!.warning).toBe(0);
    expect(fresh.reinforcementTarget).toBeUndefined(); expect(fresh.bossHealth).toBe(5);
  });
});
