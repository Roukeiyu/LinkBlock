import { describe, expect, it } from 'vitest';
import { Island, islandPolygons } from './island';
import { area, distance, inside, wallEdges, type Polygon } from './geometry';
import { Game, type Direction } from './engine';

const frame: Polygon = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
const start: Polygon = [{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 12, y: 20 }];
const randomFor = (seed: number) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32;

describe('continuous island geometry', () => {
  it('rejects an outer-frame landing and a floating loop without changing the island', () => {
    const island = new Island(frame, start), before = structuredClone(island.regions);
    expect(island.close([{ x: 16, y: 12 }, { x: 16, y: 0 }, { x: 18, y: 0 }])).toBeUndefined();
    expect(island.close([{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 5 }, { x: 2, y: 2 }])).toBeUndefined();
    expect(island.regions).toEqual(before); expect(island.coast).toHaveLength(4);
  });
  it('preserves multiple holes without adding fake walls or miscounting area', () => {
    const [region] = islandPolygons([[
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]],
      [[6, 6], [6, 9], [9, 9], [9, 6], [6, 6]],
    ]]);
    expect(area(region)).toBe(87); expect(wallEdges(region)).toHaveLength(12);
    expect(inside({ x: 3, y: 3 }, region)).toBe(false); expect(inside({ x: 8, y: 8 }, region)).toBe(false);
    expect(inside({ x: 1, y: 1 }, region)).toBe(true);
    expect(wallEdges(region).every(([a, b]) => a.x === b.x || a.y === b.y)).toBe(true);
  });
  it('keeps hundreds of successive fractional shoreline expansions continuous and area-conserving', () => {
    const direction = (x: number, y: number): Direction => x > 0 ? 'right' : x < 0 ? 'left' : y > 0 ? 'down' : 'up';
    for (let seed = 1; seed <= 20; seed++) {
      const random = randomFor(seed), game = new Game(40, 40, { opening: true, enemies: [], boss: null, random, victory: { territoryPercent: 100 } });
      game.start(); game.opening!.region = start; game.confirmOpening();
      for (let i = 0; i < 24; i++) {
        const shores = game.boundarySegments.filter(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) > 0.1);
        const [a, b] = shores[Math.floor(random() * shores.length)], length = Math.hypot(b.x - a.x, b.y - a.y);
        const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length, ox = dy, oy = -dx;
        const anchor = { x: a.x + (b.x - a.x) * 0.35, y: a.y + (b.y - a.y) * 0.35 };
        const reach = ox > 0 ? 40 - anchor.x : ox < 0 ? anchor.x : oy > 0 ? 40 - anchor.y : anchor.y;
        if (reach < 0.01) continue;
        const depth = Math.min(0.25, reach / 2), before = game.claimed;
        game.player = anchor; game.anchor = { ...anchor };
        for (const [dir, amount] of [[direction(ox, oy), depth], [direction(dx, dy), length * 0.3], [direction(-ox, -oy), depth]] as const) {
          if (game.move(dir, true, amount)) break;
        }
        expect(game.claimed, `seed=${seed}, step=${i}, edge=${JSON.stringify([a,b])}, player=${JSON.stringify(game.player)}, trail=${JSON.stringify(game.trail)}, retract=${game.retracting}`).toBeGreaterThan(before);
        expect(game.trail).toHaveLength(0); expect(game.isBoundary(game.player.x, game.player.y)).toBe(true);
        expect(game.captured.reduce((n, p) => n + area(p), 0)).toBeCloseTo(game.claimed, 7);
        expect(game.territories.reduce((n, p) => n + area(p), 0) + game.claimed).toBeCloseTo(1600, 7);
        for (const [a, b] of game.boundarySegments) {
          const length = Math.hypot(b.x - a.x, b.y - a.y); if (length < 1e-5) continue;
          const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, offset = 1e-5;
          const samples = [-1, 1].map(side => ({ x: midpoint.x + side * (b.y - a.y) / length * offset, y: midpoint.y - side * (b.x - a.x) / length * offset }));
          if (samples.some(p => game.captured.some(region => wallEdges(region).some(([c, d]) => distance(p, c, d) < 1e-7)))) continue;
          expect(samples.map(p => game.captured.some(region => inside(p, region))).filter(Boolean), `internal coast seed=${seed}, step=${i}, edge=${JSON.stringify([a,b])}`).toHaveLength(1);
        }
      }
    }
  });
});
