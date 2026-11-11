import { describe, expect, it } from 'vitest';
import { Game, type Direction } from './engine';
import { EPS, inside, type Point } from './geometry';
import { Projectile } from './attacks';

function interiorShores(game: Game) {
  return game.boundarySegments.filter(([a, b]) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1e-5) return false;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const nx = -dy / len, ny = dx / len;
    const sides = [1e-3, -1e-3].map(sign => ({ x: mid.x + nx * sign, y: mid.y + ny * sign }));
    const insideBoard = (p: Point) => p.x > 0 && p.y > 0 && p.x < game.width && p.y < game.height;
    const wet = (p: Point) => game.territories.some(region => inside(p, region));
    return sides.every(insideBoard) && sides.every(p => !wet(p));
  });
}

const directions: Direction[] = ['up', 'right', 'down', 'left'];
function fixture(turns = 0) {
  const rotate = (point: Point) => { for (let i = 0; i < turns; i++) point = { x: 40 - point.y, y: point.x }; return point; };
  const game = new Game(40, 40, { opening: true, enemies: [], boss: null, random: () => 0.5, victory: { territoryPercent: 100 } });
  game.start(); game.opening!.region = [{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 12, y: 20 }].map(rotate); game.confirmOpening();
  const place = (x: number, y: number) => { game.player = rotate({ x, y }); game.anchor = { ...game.player }; };
  const move = (dir: Direction, amount: number, drawing = true) => game.move(directions[(directions.indexOf(dir) + turns) % 4], drawing, amount);
  const shore = (x: number, y: number) => { const p = rotate({ x, y }); return game.isBoundary(p.x, p.y); };
  return { game, place, move, shore, rotate };
}
describe('reported internal shore and frame departure regressions', () => {
  it('does not leave a shore inside land after adjacent captures share an edge', () => {
    const game = new Game(40, 40, { opening: true, enemies: [], boss: null, victory: { territoryPercent: 100 } });
    game.start();
    game.opening!.region = [{ x: 10, y: 10 }, { x: 18, y: 10 }, { x: 18, y: 18 }, { x: 10, y: 18 }];
    game.confirmOpening();
    const place = (x: number, y: number) => { game.player = { x, y }; game.anchor = { x, y }; };
    place(14, 10); game.move('up', true, 6); game.move('right', true, 8); game.move('down', true, 6);
    place(18, 14); game.move('right', true, 6); game.move('down', true, 6); game.move('left', true, 6);
    place(14, 18); game.move('down', true, 6); game.move('left', true, 8); game.move('up', true, 6);
    expect(interiorShores(game)).toEqual([]);
  });
  it.each([0, 1, 2, 3])('merges a near-shore closure without a microscopic gap or internal line, turns=%s', turns => {
    const { game, place, move, shore } = fixture(turns);
    place(20, 14); move('right', 4); move('down', 2); move('left', 4 - EPS / 4);
    expect(game.trail).toHaveLength(0); expect(game.claimed).toBeCloseTo(72, 7);
    expect(shore(20, 15)).toBe(false); expect(shore(24, 15)).toBe(true);
    expect(game.territories).toHaveLength(1); expect(game.territories[0].rings).toHaveLength(2);
  });
  it.each([0, 1, 2, 3])('starts a live line from a true shore at the frame, closes and retracts, turns=%s', turns => {
    const { game, place, move, shore, rotate } = fixture(turns);
    place(14, 12); move('up', 12); move('right', 4); move('down', 12);
    place(18, 0); const score = game.score;
    move('right', 4); expect(game.player).toEqual(rotate({ x: 22, y: 0 })); expect(game.trail).toHaveLength(2);
    expect(shore(22, 0)).toBe(false); expect(game.claimed).toBe(112); expect(game.score).toBe(score);
    game.beginRetraction(); game.update(1); expect(game.player).toEqual(rotate({ x: 18, y: 0 })); expect(game.trail).toHaveLength(0);
    move('right', 4); move('down', 4); move('left', 4);
    expect(game.claimed).toBe(128); expect(shore(18, 2)).toBe(false); expect(shore(22, 2)).toBe(true);
    expect(game.score - score).toBe(220); expect(game.lives).toBe(3);
    place(22, 0); move('up', 100); expect(game.player).toEqual(rotate({ x: 22, y: 0 })); expect(game.trail).toHaveLength(0);
  });
  it.each([0, 1, 2, 3])('normalizes a near-shore departure to its actual edge without a grid, turns=%s', turns => {
    const { game, place, move, shore, rotate } = fixture(turns);
    place(20 + EPS / 4, 14.125); move('right', 4);
    expect(game.anchor).toEqual(rotate({ x: 20, y: 14.125 }));
    move('down', 2.25); move('left', 4);
    expect(game.claimed).toBe(73); expect(shore(20, 15)).toBe(false); expect(shore(24, 15)).toBe(true);
    expect(game.trail).toHaveLength(0); expect(game.lives).toBe(3);
  });
  it.each([0, 1, 2, 3])('keeps a line launched along the frame vulnerable and restores the true shore once on hit, turns=%s', turns => {
    const { game, place, move, rotate } = fixture(turns);
    place(14, 12); move('up', 12); move('right', 4); move('down', 12); place(18, 0);
    const score = game.score; move('right', 4);
    game.spawnHazard(new Projectile(rotate({ x: 20, y: 0 }), { x: 0, y: 0 }));
    game.spawnHazard(new Projectile(rotate({ x: 20, y: 0 }), { x: 0, y: 0 }));
    game.update(0.02, undefined, true);
    expect(game.lives).toBe(2); expect(game.player).toEqual(rotate({ x: 18, y: 0 })); expect(game.trail).toHaveLength(0);
    expect(game.claimed).toBe(112); expect(game.score).toBe(score); expect(game.lastDefeats).toHaveLength(0);
  });
});
