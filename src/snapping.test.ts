import { describe, expect, it } from 'vitest';
import { Game, type Direction } from './engine';
import { area, onSegment, wallEdges, type Point } from './geometry';
import { DRAW_SNAP_DISTANCE, snapDrawing } from './snapping';

const directions: Direction[] = ['up', 'right', 'down', 'left'];
function fixture(turns = 0) {
  const rotate = (p: Point) => { for (let i = 0; i < turns; i++) p = { x: 40 - p.y, y: p.x }; return p; };
  const game = new Game(40, 40, { opening: true, enemies: [], boss: null, random: () => 0.5, victory: { territoryPercent: 100 } });
  game.start(); game.opening!.region = [{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 12, y: 20 }].map(rotate);
  game.confirmOpening(); game.player = rotate({ x: 16, y: 12 }); game.anchor = { ...game.player };
  const move = (dir: Direction, amount: number, drawing = true) => game.move(directions[(directions.indexOf(dir) + turns) % 4], drawing, amount);
  return { game, move, rotate };
}

describe('drawing magnetism', () => {
  for (const offset of [-0.2, 0, 0.2]) it.each([0, 1, 2, 3])(`closes onto the exact corner with lateral offset ${offset}, turns=%s`, turns => {
    const { game, move, rotate } = fixture(turns);
    move('up', 4); move('right', 4 + offset);
    expect(move('down', 3.8)).toBe(true);
    expect(game.player).toEqual(rotate({ x: 20, y: 12 }));
    expect(game.trail).toHaveLength(0); expect(game.retracting).toBe(false);
    expect(game.claimed).toBeCloseTo(64 + (4 + offset) * 4);
    expect(game.captured.reduce((sum, region) => sum + area(region), 0)).toBeCloseTo(game.claimed);
    expect(game.boundarySegments.every(([a, b]) => a.x === b.x || a.y === b.y)).toBe(true);
    expect(game.lives).toBe(3);
  });
  it.each([0, 1, 2, 3])('snaps to bare frame, keeps the line live, then retracts exactly, turns=%s', turns => {
    const { game, move, rotate } = fixture(turns);
    move('up', 11.8);
    expect(game.player).toEqual(rotate({ x: 16, y: 0 }));
    expect(game.trail).toHaveLength(2); expect(game.claimed).toBe(64); expect(game.score).toBe(0);
    expect(game.isBoundary(game.player.x, game.player.y)).toBe(false);
    move('right', 4); expect(game.player).toEqual(rotate({ x: 20, y: 0 }));
    game.beginRetraction(); game.update(1);
    expect(game.player).toEqual(rotate({ x: 16, y: 12 })); expect(game.trail).toHaveLength(0);
    expect(game.claimed).toBe(64);
  });
  it('finishes a small forward gap to an edge without requiring exact input', () => {
    const { game, move } = fixture();
    move('up', 4); move('right', 2); move('down', 3.8);
    expect(game.player).toEqual({ x: 18, y: 12 }); expect(game.claimed).toBe(72);
    expect(game.trail).toHaveLength(0);
  });
  it('leaves distant and departing lines alone, and reverse input still erases', () => {
    const { game, move } = fixture();
    move('up', 4); move('right', 4.5); move('down', 3.8);
    expect(game.player).toEqual({ x: 20.5, y: 11.8 }); expect(game.claimed).toBe(64);
    move('up', 0.1); expect(game.player.y).toBeCloseTo(11.7); expect(game.claimed).toBe(64);
    const fresh = fixture(); fresh.move('up', 0.1);
    expect(fresh.game.player).toEqual({ x: 16, y: 11.9 }); expect(fresh.game.trail).toHaveLength(2);
    const frame = fixture(); frame.move('up', 12 - DRAW_SNAP_DISTANCE - 0.01);
    expect(frame.game.player.y).toBeCloseTo(DRAW_SNAP_DISTANCE + 0.01);
  });
  it('checks the perpendicular magnetic leg for hazards before awarding capture', () => {
    const { game, move } = fixture();
    move('up', 4); move('right', 4.2);
    let hit = false;
    game.spawnHazard({ expired: false, update() {}, render() {}, hitsTrail: () => false,
      hitsPlayer: (a, b) => onSegment({ x: 20.1, y: 12 }, a, b), onHit() { hit = true; } });
    move('down', 3.8);
    expect(hit).toBe(true); expect(game.lives).toBe(2); expect(game.claimed).toBe(64);
    expect(game.score).toBe(0); expect(game.trail).toHaveLength(0);
  });
  it('does not cross an intervening shore to reach a nearby vertex', () => {
    const coast = wallEdges([{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 12, y: 20 }]);
    coast.push([{ x: 20.1, y: 11.9 }, { x: 20.1, y: 13 }]);
    const route = snapDrawing({ x: 20.2, y: 8 }, { x: 0, y: 1 }, 3.8, coast, 32);
    expect(route.points.at(-1)).not.toEqual({ x: 20, y: 12 });
  });
  it('rewinds when the magnetic correction crosses the live trail', () => {
    const { game, move } = fixture();
    move('up', 4); move('right', 4.1); move('down', 4.6);
    move('right', 2); move('up', 4); move('left', 1.9);
    expect(move('down', 3.2)).toBe(false);
    expect(game.retracting).toBe(true); expect(game.claimed).toBe(64);
    expect(game.score).toBe(0); expect(game.lives).toBe(3);
  });
});
