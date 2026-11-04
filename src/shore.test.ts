import { describe, expect, it } from 'vitest';
import { Game, type Direction } from './engine';
import type { Point, Polygon } from './geometry';

const directions: Direction[] = ['up', 'right', 'down', 'left'];
function rotated(turns: number) {
  const point = (p: Point) => {
    for (let i = 0; i < turns; i++) p = { x: 40 - p.y, y: p.x };
    return p;
  };
  const game = new Game(40, 40, { opening: true, enemies: [], boss: null, random: () => 0.5, victory: { territoryPercent: 100 } });
  game.start(); game.opening!.region = [{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 12, y: 20 }].map(point) as Polygon;
  game.confirmOpening(); game.player = point({ x: 14, y: 12 }); game.anchor = { ...game.player };
  const move = (dir: Direction, distance: number, draw = false) => game.move(directions[(directions.indexOf(dir) + turns) % 4], draw, distance);
  const at = (x: number, y: number) => expect(game.player).toEqual(point({ x, y }));
  const shore = (x: number, y: number) => { const p = point({ x, y }); return game.isBoundary(p.x, p.y); };
  return { game, point, move, at, shore };
}

describe('continuous island shore against every arena edge and corner', () => {
  it.each([0, 1, 2, 3])('walks a frame-touching island edge and keeps bare frame unsafe, quarter turns=%s', turns => {
    const { game, point, move, at, shore } = rotated(turns);
    move('up', 12, true); expect(game.claimed).toBe(64);
    move('right', 4, true); move('down', 12, true); expect(game.claimed).toBe(112);
    expect(shore(16, 0)).toBe(true); expect(shore(10, 0)).toBe(false); expect(shore(30, 0)).toBe(false);
    const score = game.score;
    move('up', 12); at(18, 0); move('left', 2); at(16, 0); move('left', 2); at(14, 0);
    move('left', 100); at(14, 0); move('up', 100, true); at(14, 0);
    move('down', 12); at(14, 12); expect(game.score).toBe(score); expect(game.trail).toHaveLength(0);
    // A later expansion removes its old internal edge, preserving the edge at the frame.
    move('up', 6); move('left', 3, true); move('down', 2, true); move('right', 3, true);
    expect(game.claimed).toBe(118); expect(shore(14, 7)).toBe(false); expect(shore(16, 0)).toBe(true);
    game.player = point({ x: 14, y: 4 }); game.anchor = { ...game.player };
    const after = game.score; move('left', 100, true); at(0, 4);
    expect(game.trail.length).toBeGreaterThan(1); expect(game.score).toBe(after); expect(shore(0, 4)).toBe(false);
    game.beginRetraction(); game.update(1); at(14, 4); expect(game.trail).toHaveLength(0);
    expect(game.claimed).toBe(118); expect(game.lives).toBe(3);
  });
  it.each([0, 1, 2, 3])('walks through a claimed arena corner without extending onto bare frame, quarter turns=%s', turns => {
    const { game, move, at, shore } = rotated(turns);
    move('up', 12, true); move('left', 14, true); move('down', 14, true);
    expect(game.claimed).toBe(64); move('right', 12, true); expect(game.claimed).toBe(256);
    const score = game.score;
    move('left', 12); at(0, 14); move('up', 14); at(0, 0);
    move('left', 100, true); move('up', 100, true); at(0, 0);
    move('right', 14); at(14, 0); move('right', 100); at(14, 0);
    move('down', 12); at(14, 12);
    expect(shore(0, 0)).toBe(true); expect(shore(20, 0)).toBe(false); expect(shore(0, 20)).toBe(false);
    expect(game.score).toBe(score); expect(game.claimed).toBe(256); expect(game.trail).toHaveLength(0);
  });
});
