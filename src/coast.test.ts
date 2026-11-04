import { describe, expect, it } from 'vitest';
import { Game, PLAYER_SPEED, type Direction } from './engine';
import { SHORE_CONTACT_TOLERANCE, SHORE_STEP_TOLERANCE, walkCoast } from './coast';
import { area, onSegment, type Point } from './geometry';
import type { AttackHazard } from './attacks';

const directions: Direction[] = ['up', 'right', 'down', 'left'];
function fixture(turns = 0, step = 0) {
  const rotate = (p: Point) => { for (let i = 0; i < turns; i++) p = { x: 40 - p.y, y: p.x }; return p; };
  const game = new Game(40, 40, { opening: true, enemies: [], boss: null, random: () => 0.5, victory: { territoryPercent: 100 } });
  game.start();
  const shape = step ? [{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 16 }, { x: 20 + step, y: 16 }, { x: 20 + step, y: 20 }, { x: 12, y: 20 }] : [{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 12, y: 20 }];
  game.opening!.region = shape.map(rotate); game.confirmOpening();
  const place = (x: number, y: number) => { game.player = rotate({ x, y }); game.anchor = { ...game.player }; };
  const direction = (d: Direction) => directions[(directions.indexOf(d) + turns) % 4];
  const move = (d: Direction, amount: number, drawing = true) => game.move(direction(d), drawing, amount);
  place(16, 12); return { game, rotate, direction, place, move };
}

describe('continuous coast feel and invisible steps', () => {
  it.each([0, 1, 2, 3])('continues in the held direction after a tangent closure, turns=%s', turns => {
    const { game, move, rotate, direction } = fixture(turns);
    move('up', 6); move('right', 4);
    expect(game.update(0.5, direction('down'), true)).toBe(false);
    const expected = rotate({ x: 20, y: 6 + PLAYER_SPEED * 0.5 });
    expect(game.player.x).toBeCloseTo(expected.x, 5); expect(game.player.y).toBeCloseTo(expected.y, 5);
    expect(game.claimed).toBeCloseTo(88); expect(game.score).toBe(320); expect(game.trail).toHaveLength(0);
    expect(game.isBoundary(game.player.x, game.player.y)).toBe(true); expect(game.events.filter(e => e === 'capture')).toHaveLength(1);
  });

  it.each([0, 1, 2, 3])('continues along real frame shore after closure without claiming bare frame, turns=%s', turns => {
    const { game, move, place, rotate, direction } = fixture(turns);
    place(14, 12); move('up', 12); move('right', 4); move('down', 12);
    place(14, 6); move('left', 4); move('up', 6); const score = game.score;
    expect(game.update(0.25, direction('right'), true)).toBe(false);
    const expected = rotate({ x: 10 + PLAYER_SPEED * 0.25, y: 0 });
    expect(game.player.x).toBeCloseTo(expected.x, 5); expect(game.player.y).toBeCloseTo(expected.y, 5);
    expect(game.claimed).toBeCloseTo(136); expect(game.score - score).toBe(310);
    game.update(1, direction('right'), false);
    expect(game.player).toEqual(rotate({ x: 18, y: 0 })); expect(game.trail).toHaveLength(0);
    const bare = rotate({ x: 22, y: 0 }); expect(game.isBoundary(bare.x, bare.y)).toBe(false);
  });

  it.each([0, 1, 2, 3])('walks a subpixel connected step without changing area or rounding movement, turns=%s', turns => {
    const { game, move, place, rotate } = fixture(turns, 0.03); place(20, 14);
    const before = structuredClone(game.territories), claimed = game.claimed;
    move('down', 5, false); const expected = rotate({ x: 20.03, y: 18.97 });
    expect(game.player.x).toBeCloseTo(expected.x, 8); expect(game.player.y).toBeCloseTo(expected.y, 8);
    expect(game.territories).toEqual(before); expect(game.claimed).toBe(claimed); expect(game.score).toBe(0);
    expect(game.isBoundary(game.player.x, game.player.y)).toBe(true);
    const beforeSmallMove = { ...game.player }; move('down', 0.00137, false);
    expect(Math.hypot(game.player.x - beforeSmallMove.x, game.player.y - beforeSmallMove.y)).toBeCloseTo(0.00137, 10);
  });

  it('consumes the actual detour distance, including a step split across many frames', () => {
    const a = fixture(0, 0.03), b = fixture(0, 0.03); a.place(20, 15.99); b.place(20, 15.99);
    const start = { ...a.game.player }, route = walkCoast(start, { x: 0, y: 1 }, 1, a.game.boundarySegments);
    for (let i = 1; i < route.length; i++) {
      const middle = { x: (route[i - 1].x + route[i].x) / 2, y: (route[i - 1].y + route[i].y) / 2 };
      expect(a.game.boundarySegments.some(edge => onSegment(middle, ...edge))).toBe(true);
    }
    expect(route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.y - route[i].y), 0)).toBeCloseTo(1, 9);
    a.move('down', 1, false); for (let i = 0; i < 200; i++) b.move('down', 0.005, false);
    expect(a.game.player.x).toBeCloseTo(b.game.player.x, 8); expect(a.game.player.y).toBeCloseTo(b.game.player.y, 8);
  });

  it('preserves a visible step and genuine corner, and never bridges disconnected edges', () => {
    const { game, place, move } = fixture(0, SHORE_STEP_TOLERANCE + 0.001); place(20, 14); move('down', 8, false);
    expect(game.player).toEqual({ x: 20, y: 16 }); move('right', SHORE_STEP_TOLERANCE + 0.001, false); move('down', 8, false);
    expect(game.player.x).toBeCloseTo(20.041); expect(game.player.y).toBe(20); move('down', 3, false); expect(game.player.y).toBe(20);
    expect(walkCoast({ x: 0.5, y: 0 }, { x: 1, y: 0 }, 2, [[{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 1.02, y: 0 }, { x: 2, y: 0 }]])).toEqual([{ x: 0.5, y: 0 }, { x: 1, y: 0 }]);
  });

  it('does not divert an intentional outward cut near the endpoint of a short shore', () => {
    const { game, place, move } = fixture();
    place(19.975, 12); move('up', 0.25);
    expect(game.player).toEqual({ x: 19.975, y: 11.75 }); expect(game.trail).toHaveLength(2); expect(game.anchor).toEqual({ x: 19.975, y: 12 });
  });

  it('canonicalizes only numerical contact noise while retaining strict closure geometry', () => {
    const { game, place, move } = fixture(0, 0.03); const claimed = game.claimed;
    place(20 + SHORE_CONTACT_TOLERANCE / 4, 14.12345); move('down', 0.5, false);
    expect(game.player.x).toBe(20); expect(game.player.y).toBeCloseTo(14.62345, 9); expect(game.claimed).toBe(claimed);
    place(20 + SHORE_CONTACT_TOLERANCE / 4, 12 + SHORE_CONTACT_TOLERANCE / 4); move('down', 0.5, false);
    expect(game.player).toEqual({ x: 20, y: 12.5 });
    place(20 + 0.001, 14); move('down', 0.5, false); expect(game.player).toEqual({ x: 20.001, y: 14 });
    expect(game.captured.reduce((sum, p) => sum + area(p), 0)).toBeCloseTo(claimed, 8);
  });

  it('sweeps every real micro-step segment for extensible hazards instead of a diagonal shortcut', () => {
    const { game, place } = fixture(0, 0.03); place(20, 15.99);
    let hit = false;
    const hazard: AttackHazard = {
      expired: false, update() {}, render() {}, hitsTrail() { return false; }, onHit() { hit = true; },
      hitsPlayer(from, to) { return from.y === 16 && to.y === 16 && to.x > from.x; },
    };
    game.spawnHazard(hazard); game.update(0.01, 'down');
    expect(hit).toBe(true); expect(game.lives).toBe(2); expect(game.events.filter(e => e === 'hit')).toHaveLength(1);
    expect(game.player).toEqual(game.anchor); expect(game.trail).toHaveLength(0);
  });
});
