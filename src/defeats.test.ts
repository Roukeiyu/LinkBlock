import { describe, expect, it } from 'vitest';
import { Game } from './engine';
import { createEnemy, DEFEAT_POINTS } from './enemies';
import { Projectile } from './attacks';
import { inside } from './geometry';

const stationary = (kind: Parameters<typeof createEnemy>[0], x: number, y: number) => createEnemy(kind, { x, y }, { x: 0, y: 0 });
function pocketFixture() {
  const target = stationary('orbit', 17, 5), survivor = stationary('straight', 17, 16);
  const game = new Game(20, 20, { enemies: [target, survivor], boss: null }); game.start();
  return { game, target, survivor };
}

describe('enclosed enemy defeats', () => {
  it('captures an enemy pocket closed by an existing edge, a new line and the outer frame', () => {
    const { game, target, survivor } = pocketFixture();
    game.move('down', true, 20); expect(game.percent).toBe(50); expect(game.lastDefeats).toHaveLength(0);
    game.move('up', false, 12); const score = game.score;
    expect(game.move('right', true, 10)).toBe(true);
    expect(game.percent).toBeCloseTo(70); expect(game.enemies).toEqual([survivor]);
    expect(game.lastDefeats).toEqual([{ kind: 'orbit', x: 17, y: 5, points: DEFEAT_POINTS.orbit }]);
    expect(game.score - score).toBe(80 * 10 + 10 * 5 + DEFEAT_POINTS.orbit);
    expect(inside(target, game.captured.at(-1)!)).toBe(true);
    expect(game.territories.some(region => inside(survivor, region))).toBe(true);
    const event = game.events.find(event => typeof event === 'object' && event.type === 'defeat');
    target.x = 100;
    expect(event).toEqual({ type: 'defeat', enemies: [{ kind: 'orbit', x: 17, y: 5, points: 500 }] });
  });
  it('does not defeat a nearby enemy before the line closes or when the player retracts', () => {
    const { game, target } = pocketFixture();
    game.move('down', true, 8); game.move('right', true, 5);
    expect(game.enemies).toContain(target); expect(game.lastDefeats).toHaveLength(0); expect(game.score).toBe(0);
    game.beginRetraction(); game.update(1);
    expect(game.enemies).toContain(target); expect(game.lastDefeats).toHaveLength(0); expect(game.score).toBe(0);
    expect(game.player).toEqual(game.anchor);
  });
  it('keeps a populated equal-area split until a later cut defines the smaller pocket', () => {
    const left = stationary('straight', 5, 5), right = stationary('orbit', 15, 15);
    const game = new Game(20, 20, { enemies: [left, right], boss: null }); game.start(); game.move('down', true, 20);
    expect(game.territories).toHaveLength(2); expect(game.lastDefeats).toHaveLength(0);
    expect(game.enemies).toEqual([left, right]); expect(game.percent).toBe(0);
    game.move('up', false, 13); game.move('left', true, 10);
    expect(game.lastDefeats.map(enemy => enemy.kind)).toEqual(['straight']);
    expect(game.enemies).toEqual([right]); expect(game.percent).toBeCloseTo(50);
  });
  it('removes all enclosed bodies, preserves the other side and leaves disconnected regions alone', () => {
    const outside = stationary('orbit', 5, 10), survivor = stationary('straight', 15, 10);
    const a = stationary('orbit', 27, 5), b = stationary('zigzag', 27, 15), boss = stationary('boss', 27, 10);
    const game = new Game(30, 20, { enemies: [outside, survivor, a, b], boss, bossConfig: { maxHealth: 1 }, victory: { defeatBoss: false } });
    const untouched = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
    game.territories = [untouched, [{ x: 10, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 10, y: 20 }]];
    game.start(); game.move('right', false, 9); game.move('down', true, 20);
    expect(game.enemies).toEqual([outside, survivor]); expect(game.boss).toBeUndefined(); expect(game.bossAttack).toBeUndefined();
    expect(game.lastDefeats.map(enemy => enemy.kind)).toEqual(['orbit', 'zigzag', 'boss']);
    expect(game.score).toBe(120 * 10 + 20 * 5 + 500 + 500 + 2000 + 250);
    expect(game.territories).toContain(untouched); expect(game.percent).toBeCloseTo(20);
    game.update(0.1);
    for (const enemy of game.enemies) expect(game.territories.filter(region => inside(enemy, region))).toHaveLength(1);
  });
  it('stops a defeated boss from casting while existing bullets continue through captured territory', () => {
    const game = new Game(20, 20, { enemies: [stationary('straight', 5, 6)], boss: stationary('boss', 17, 16), bossConfig: { maxHealth: 1 }, victory: { defeatBoss: false } }); game.start();
    game.move('right', false, 4);
    const shot = new Projectile({ x: 15, y: 5 }, { x: 0, y: 1 }); game.spawnHazard(shot);
    game.move('down', true, 20);
    expect(game.boss).toBeUndefined(); expect(game.bossAttack).toBeUndefined(); expect(game.lastDefeats[0].points).toBe(2000);
    expect(game.percent).toBeCloseTo(30); expect(game.hazards).toContain(shot);
    game.events.length = 0; game.update(6);
    expect(game.hazards).toEqual([shot]); expect(shot.position.y).toBeCloseTo(11);
    expect(game.events).not.toContain('bossAttack');
  });
  it('awards the last defeat once, reveals the empty remainder and wins', () => {
    const game = new Game(20, 20, { enemies: [stationary('straight', 17, 16)], boss: null }); game.start();
    game.move('right', false, 4); game.move('down', true, 20);
    expect(game.enemies).toHaveLength(0); expect(game.territories).toHaveLength(0);
    expect(game.phase).toBe('won'); expect(game.percent).toBe(100);
    expect(game.score).toBe(400 * 10 + 20 * 5 + 500 + 3000);
    const score = game.score; game.move('up', true, 20); game.update(1);
    expect(game.score).toBe(score); expect(game.events.filter(event => typeof event === 'object')).toHaveLength(1);
  });
  it('still wins at the area target when untrapped enemies survive', () => {
    const enemy = stationary('straight', 18, 18);
    const game = new Game(20, 20, { enemies: [enemy], boss: null }); game.start();
    game.move('down', true, 20); game.move('up', false, 10); game.move('right', true, 10);
    expect(game.phase).toBe('won'); expect(game.percent).toBe(75); expect(game.enemies).toEqual([enemy]);
    expect(game.lastDefeats).toHaveLength(0); expect(game.score).toBe(6150);
  });
  it('resolves body contact with the closing line before capture, scoring or defeat', () => {
    const enemy = stationary('straight', 14.5, 8);
    const game = new Game(20, 20, { enemies: [enemy], boss: null }); game.start();
    game.move('right', false, 4); game.move('down', true, 20);
    expect(game.lives).toBe(2); expect(game.enemies).toEqual([enemy]);
    expect(game.score).toBe(0); expect(game.percent).toBe(0); expect(game.lastDefeats).toHaveLength(0);
  });
  it('resolves a bullet hitting an unfinished enclosure before any defeat can be awarded', () => {
    const { game, target } = pocketFixture(); game.move('down', true, 8);
    game.spawnHazard(new Projectile({ x: 10, y: 4 }, { x: 0, y: 0 })); game.update(0.01, undefined, true);
    expect(game.lives).toBe(2); expect(game.enemies).toContain(target);
    expect(game.lastDefeats).toHaveLength(0); expect(game.score).toBe(0); expect(game.percent).toBe(0);
  });
});
