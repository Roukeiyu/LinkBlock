import { describe, expect, it } from 'vitest';
import { Game, PLAYER_SPEED } from './engine';
import { area, distance, edges, inside, split } from './geometry';

function fixture() {
  const game = new Game(10, 10);
  game.player = { x: 4, y: 0 }; game.anchor = { ...game.player };
  game.enemy = { x: 7.5, y: 6.5, vx: 0, vy: 0 }; game.start();
  return game;
}
describe('continuous territory rules', () => {
  it('moves by elapsed time with fractional coordinates and turns immediately', () => {
    const game = fixture();
    game.update(0.013, 'right');
    expect(game.player.x).toBeCloseTo(4 + PLAYER_SPEED * 0.013, 8);
    game.update(0.011, 'down', true);
    expect(game.player.y).toBeCloseTo(PLAYER_SPEED * 0.011, 8);
    const x = game.player.x;
    game.update(0.017, 'left', true);
    expect(game.player.x).toBeCloseTo(x - PLAYER_SPEED * 0.017, 8);
    expect(game.trail).toHaveLength(3);
  });
  it('is independent of render frame rate', () => {
    const a = fixture(), b = fixture();
    a.update(0.3, 'down', true);
    for (let i = 0; i < 36; i++) b.update(1 / 120, 'down', true);
    expect(a.player.y).toBeCloseTo(b.player.y, 8);
  });
  it('requires drawing, holds on release and blocks retracing and intersections', () => {
    const game = fixture();
    game.move('down', false, 3); expect(game.player.y).toBe(0);
    game.move('down', true, 3.2);
    game.move('up', true, 1); game.move('left', false, 1);
    expect(game.player).toEqual({ x: 4, y: 3.2 });
    game.move('right', true, 2); game.move('up', true, 1);
    game.move('left', true, 3); // crosses the first segment
    expect(game.player).toEqual({ x: 6, y: 2.2 });
    expect(game.claimed).toBe(0);
  });
  it('splits exact fractional areas and preserves the enemy side', () => {
    const game = fixture(); game.move('right', false, 0.125);
    expect(game.move('down', true, 100)).toBe(true);
    expect(game.player).toEqual({ x: 4.125, y: 10 });
    expect(game.percent).toBeCloseTo(41.25);
    expect(area(game.captured[0])).toBeCloseTo(41.25);
    expect(inside(game.enemy, game.territory)).toBe(true);
    expect(game.trail).toHaveLength(0);
    expect(game.score).toBeGreaterThan(0);
  });
  it('captures a bent cut, and connects two points on the same boundary edge', () => {
    const game = fixture();
    game.move('down', true, 3); game.move('left', true, 4);
    expect(game.claimed).toBeCloseTo(12);
    expect(inside({ x: 2, y: 1 }, game.captured[0])).toBe(true);
    const other = fixture();
    other.move('down', true, 2); other.move('left', true, 2); other.move('up', true, 2);
    expect(other.claimed).toBeCloseTo(4);
    expect(inside(other.enemy, other.territory)).toBe(true);
  });
  it('follows the exact cut, blocks filled interior and rounds capture corners', () => {
    const game = fixture(); game.move('down', true, 10);
    game.move('up', false, 6.25);
    expect(game.player).toEqual({ x: 4, y: 3.75 });
    expect(game.isBoundary(4, 3.75)).toBe(true);
    game.move('left', false, 2); game.move('left', true, 2);
    expect(game.player).toEqual({ x: 4, y: 3.75 });
    game.move('right', true, 6);
    expect(game.percent).toBeCloseTo(62.5);
    game.move('left', false, 6); game.move('up', false, 1);
    expect(game.player).toEqual({ x: 4, y: 3.75 });
    game.move('down', false, 0.35); expect(game.player.y).toBeCloseTo(4.1);
  });
  it('keeps the complete outside outline traversable', () => {
    const game = fixture(); game.move('down', true, 10);
    game.move('left', false, 4); game.move('up', false, 5.75);
    expect(game.player).toEqual({ x: 0, y: 4.25 });
    game.move('right', true, 1); expect(game.player.x).toBe(0);
    game.move('up', false, 9); game.move('right', false, 7);
    expect(game.player).toEqual({ x: 7, y: 0 });
  });
  it('stops the current gesture at a closure', () => {
    const game = fixture();
    game.move('down', true, 10); game.move('right', false, 2);
    expect(game.update(1, 'up', true)).toBe(true);
    expect(game.player).toEqual({ x: 6, y: 0 });
    expect(game.percent).toBeCloseTo(60);
  });
  it('freezes a won result and awards a life bonus', () => {
    const game = fixture(); game.enemy.x = 9;
    game.move('right', false, 3.5); game.move('down', true, 10);
    expect(game.phase).toBe('won'); expect(game.percent).toBe(75);
    expect(game.score).toBe(3800);
    const player = { ...game.player }; game.update(1, 'left', true);
    expect(game.player).toEqual(player); expect(game.events).toContain('won');
  });
});
describe('enemy and lifecycle', () => {
  it('detects a moving enemy grazing a segment, clears and respawns', () => {
    const game = fixture(); game.move('down', true, 5);
    game.enemy = { x: 5.5, y: 3.5, vx: -10, vy: 0 }; game.update(0.1);
    expect(game.lives).toBe(2); expect(game.trail).toHaveLength(0);
    expect(game.player).toEqual(game.anchor);
    game.move('down', true, 1); expect(game.trail).toHaveLength(0);
  });
  it('detects collision on the moving tip before capture and loses after three hits', () => {
    const game = fixture();
    for (let i = 0; i < 3; i++) {
      game.protection = 0; game.enemy = { x: 4, y: 1, vx: 0, vy: 0 };
      game.update(0.1, 'down', true);
    }
    expect(game.lives).toBe(0); expect(game.phase).toBe('lost'); expect(game.claimed).toBe(0);
  });
  it('pauses player, enemy and elapsed time', () => {
    const game = fixture(); game.enemy.vx = 5; game.togglePause();
    const enemy = { ...game.enemy };
    game.update(1, 'down', true);
    expect(game.elapsed).toBe(0); expect(game.enemy).toEqual(enemy); expect(game.trail).toHaveLength(0);
    game.togglePause(); game.update(0.1); expect(game.elapsed).toBeCloseTo(0.1);
    expect(game.enemy.x).not.toBe(enemy.x);
  });
  it('keeps the enemy radius inside a concave region through a long simulation', () => {
    const game = fixture(); game.move('down', true, 3); game.move('left', true, 4);
    game.enemy.vx = 7.4; game.enemy.vy = 5.2;
    let bouncedX = false, bouncedY = false;
    for (let i = 0; i < 3000; i++) {
      game.update(1 / 60);
      expect(inside(game.enemy, game.territory)).toBe(true);
      expect(Math.min(...edges(game.territory).map(([a, b]) => distance(game.enemy, a, b)))).toBeGreaterThanOrEqual(0.55 - 1e-7);
      bouncedX ||= game.enemy.vx < 0; bouncedY ||= game.enemy.vy < 0;
    }
    expect(bouncedX && bouncedY).toBe(true);
  });
  it('starts fresh without retained state', () => {
    const game = new Game(); expect(game.percent).toBe(0); expect(game.lives).toBe(3);
    expect(game.phase).toBe('ready'); expect(game.captured).toHaveLength(0);
  });
});
describe('polygon topology', () => {
  it('conserves area across a concave multibend cut in either direction', () => {
    const polygon = fixture().outline;
    const cut = [{ x: 4.27, y: 0 }, { x: 4.27, y: 2.33 }, { x: 2.61, y: 2.33 }, { x: 2.61, y: 7.19 }, { x: 10, y: 7.19 }];
    for (const path of [cut, [...cut].reverse()]) {
      const parts = split(polygon, path);
      expect(area(parts[0]) + area(parts[1])).toBeCloseTo(100, 8);
      expect(parts.filter(part => inside({ x: 8, y: 9 }, part))).toHaveLength(1);
    }
  });
});
