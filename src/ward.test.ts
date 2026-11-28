import { describe, expect, it } from 'vitest';
import type { Point } from './geometry';
import { avoidWard } from './ward';

const open = () => false;

describe('ward avoidance', () => {
  it('leaves a path that misses the circle unchanged', () => {
    const from = { x: 0, y: 5 }, to = { x: 4, y: 5 };
    expect(avoidWard(from, to, { x: 2, y: 0 }, 2, open)).toEqual(to);
  });
  it('does not finish inside the circle when the step would cross it', () => {
    const end = avoidWard({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, 2, open);
    expect(Math.hypot(end.x - 5, end.y - 0)).toBeGreaterThanOrEqual(2 - 1e-6);
  });
  it('steps a monster that is already inside farther from the player', () => {
    const end = avoidWard({ x: 5.4, y: 0 }, { x: 5.1, y: 0 }, { x: 5, y: 0 }, 3, open);
    expect(Math.hypot(end.x - 5, end.y)).toBeGreaterThan(0.4);
  });
  it('slides along a corridor instead of staying buried against the wall', () => {
    const player = { x: 10, y: 1 };
    const blocked = (point: Point) => point.y < 0 || point.y > 2;
    let pos = { x: 10, y: 1.15 };
    for (let i = 0; i < 30; i++) {
      const deeper = { x: pos.x + (player.x - pos.x) * 0.2, y: pos.y + (player.y - pos.y) * 0.2 };
      const step = Math.hypot(deeper.x - pos.x, deeper.y - pos.y) < 0.2
        ? { x: pos.x, y: pos.y + Math.sign(player.y - pos.y || 1) * 0.35 }
        : deeper;
      pos = avoidWard(pos, step, player, 5, blocked);
      expect(blocked(pos)).toBe(false);
    }
    expect(Math.hypot(pos.x - player.x, pos.y - player.y)).toBeGreaterThanOrEqual(5 - 0.05);
  });
  it('keeps moving inside a room that the ward completely covers', () => {
    const player = { x: 0, y: 2 };
    const blocked = (point: Point) => point.x < 1 || point.x > 3 || point.y < 1 || point.y > 3;
    let pos = { x: 1.4, y: 2 };
    let moved = false;
    for (let i = 0; i < 6; i++) {
      const next = avoidWard(pos, { x: pos.x + 0.25, y: pos.y }, player, 20, blocked);
      expect(blocked(next)).toBe(false);
      if (Math.hypot(next.x - pos.x, next.y - pos.y) > 0.05) moved = true;
      pos = next;
    }
    expect(moved).toBe(true);
  });
});
