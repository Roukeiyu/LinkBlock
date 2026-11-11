import { describe, expect, it } from 'vitest';
import { Game, PLAYER_SPEED, type Direction } from './engine';
import { area, type Point } from './geometry';
import { turnAtJunction } from './coast';
import type { AttackHazard } from './attacks';

const directions: Direction[] = ['up', 'right', 'down', 'left'];
function fixture(turns = 0) {
  const rotate = (p: Point) => { for (let i = 0; i < turns; i++) p = { x: 40 - p.y, y: p.x }; return p; };
  const game = new Game(40, 40, { opening: true, enemies: [], boss: null, random: () => 0.5, victory: { territoryPercent: 100 } });
  game.start();
  game.opening!.region = [{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 12, y: 20 }].map(rotate);
  game.confirmOpening();
  const place = (x: number, y: number) => { game.player = rotate({ x, y }); game.anchor = { ...game.player }; };
  const move = (d: Direction, amount: number, drawing = true) => game.move(directions[(directions.indexOf(d) + turns) % 4], drawing, amount);
  place(20, 12); move('up', 6); move('right', 6); move('down', 6); move('left', 6);
  expect(game.trail).toHaveLength(0); expect(game.claimed).toBe(100);
  return { game, place, move, rotate };
}

describe('islands meeting at a corner', () => {
  it.each([0, 1, 2, 3])('walks through the shared junction and turns onto either shore, turns=%s', turns => {
    const { game, place, move, rotate } = fixture(turns);
    place(16, 12); move('right', 8, false);
    expect(game.player).toEqual(rotate({ x: 24, y: 12 }));
    move('left', 4, false); move('up', 4, false);
    expect(game.player).toEqual(rotate({ x: 20, y: 8 }));
    move('down', 8, false);
    expect(game.player).toEqual(rotate({ x: 20, y: 16 }));
    expect(game.trail).toHaveLength(0); expect(game.claimed).toBe(100);
  });

  it.each([0, 1, 2, 3])('closes from the upper island onto the lower island without bouncing, turns=%s', turns => {
    const { game, place, move } = fixture(turns);
    place(24, 12); move('down', 4); move('left', 4);
    expect(game.retracting).toBe(false); expect(game.trail).toHaveLength(0);
    expect(game.claimed).toBe(116); expect(game.lives).toBe(3);
    expect(game.captured.reduce((sum, p) => sum + area(p), 0)).toBeCloseTo(game.claimed, 8);
  });

  it.each([0, 1, 2, 3])('turns onto connected shore just after passing the crossing, turns=%s', turns => {
    for (const drawing of [false, true]) {
      const { game, place, move, rotate } = fixture(turns);
      place(20.1, 12); move('up', 0.5, drawing);
      const expected = rotate({ x: 20, y: 11.6 });
      expect(game.player.x).toBeCloseTo(expected.x, 8); expect(game.player.y).toBeCloseTo(expected.y, 8);
      expect(game.trail).toHaveLength(0); expect(game.claimed).toBe(100);
    }
  });

  it('keeps an intentional outward cut beside the crossing at its original position', () => {
    const { game, place, move } = fixture();
    place(19.9, 12); move('up', 0.5);
    expect(game.player).toEqual({ x: 19.9, y: 11.5 });
    expect(game.anchor).toEqual({ x: 19.9, y: 12 }); expect(game.trail).toHaveLength(2);
  });

  it.each([false, true])('closes across a chain of three corner-connected islands, reverse=%s', reverse => {
    const { game, place, move } = fixture();
    place(26, 6); move('up', 4); move('right', 4); move('down', 4); move('left', 4);
    expect(game.claimed).toBe(116);
    if (reverse) { place(20, 16); move('right', 8); move('up', 10); }
    else { place(28, 6); move('down', 10); move('left', 8); }
    expect(game.retracting).toBe(false); expect(game.trail).toHaveLength(0); expect(game.claimed).toBe(160);
    expect(game.isBoundary(26, 9)).toBe(false); expect(game.isBoundary(20, 14)).toBe(false);
    // The new perimeter remains usable for the next ordinary expansion.
    place(28, 10); move('right', 2); move('down', 2); move('left', 2);
    expect(game.claimed).toBe(164); expect(game.trail).toHaveLength(0);
    expect(game.captured.reduce((sum, p) => sum + area(p), 0)).toBeCloseTo(164, 8);
  });

  it.each([30, 60, 120])('finishes the turn across physics frames at %s Hz', hz => {
    const { game, place } = fixture(); place(20.3, 12);
    for (let i = 0; i < hz / 6; i++) game.update(1 / hz, 'up', true);
    expect(game.player.x).toBeCloseTo(20, 8);
    expect(game.player.y).toBeCloseTo(12 - PLAYER_SPEED / 6 + 0.3, 8);
    expect(game.trail).toHaveLength(0); expect(game.claimed).toBe(100); expect(game.score).toBe(480);
  });

  it('does not bridge a gap to a nearby crossing or redirect a distant turn', () => {
    expect(turnAtJunction({ x: 19.9, y: 12 }, { x: 0, y: -1 }, 1, [
      [{ x: 18, y: 12 }, { x: 19.95, y: 12 }],
      [{ x: 20, y: 12 }, { x: 22, y: 12 }],
      [{ x: 20, y: 10 }, { x: 20, y: 14 }],
    ])).toEqual([{ x: 19.9, y: 12 }]);
    const { game, place, move } = fixture(); place(21, 12); move('up', 1);
    expect(game.player).toEqual({ x: 21, y: 12 }); expect(game.trail).toHaveLength(0);
  });

  it('checks hazards along the actual correction instead of taking a diagonal shortcut', () => {
    const { game, place } = fixture(); place(20.1, 12);
    const hazard: AttackHazard = {
      expired: false, update() {}, render() {}, hitsTrail() { return false; }, onHit() {},
      hitsPlayer(from, to) { return from.y === 12 && to.y === 12 && to.x < from.x; },
    };
    game.spawnHazard(hazard); game.update(0.01, 'up');
    expect(game.lives).toBe(2); expect(game.player).toEqual(game.anchor);
    expect(game.claimed).toBe(100); expect(game.trail).toHaveLength(0);
  });
});
