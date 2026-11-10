import { describe, expect, it } from 'vitest';
import { CHARACTER_COMPLETE, LINE_SPEED_BOOST, measureCompletion, weightedPercent, type CompletionMask } from './completion';
import { Game, PLAYER_SPEED } from './engine';

function halfMask(width: number, height: number, characterOnLeft: boolean): CompletionMask {
  const character = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const onLeft = x < width / 2;
    character[y * width + x] = onLeft === characterOnLeft ? 1 : 0;
  }
  return { width, height, character };
}

describe('weighted completion', () => {
  it('weights the character 60% and the empty region 40%', () => {
    expect(weightedPercent(0, 100, 0, 100)).toBe(0);
    expect(weightedPercent(100, 100, 0, 100)).toBeCloseTo(60);
    expect(weightedPercent(0, 100, 100, 100)).toBeCloseTo(40);
    expect(weightedPercent(100, 100, 100, 100)).toBeCloseTo(100);
    expect(weightedPercent(50, 100, 50, 100)).toBeCloseTo(50);
    expect(weightedPercent(95, 100, 50, 100)).toBeCloseTo(0.6 * 95 + 0.4 * 50);
  });

  it('cannot reach the 75% clear goal by capturing only empty space', () => {
    const mask = halfMask(8, 8, true);
    const board = [[{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }]];
    const emptyOnly = [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 8 }, { x: 0, y: 8 }]];
    expect(measureCompletion(mask, 8, 8, board).percent).toBeCloseTo(0);
    const reading = measureCompletion(mask, 8, 8, emptyOnly);
    expect(reading.capturedChar).toBe(0);
    expect(reading.capturedEmpty).toBe(reading.totalEmpty);
    expect(reading.percent).toBeCloseTo(40);
    expect(reading.percent).toBeLessThan(75);
    const game = new Game(8, 8, { enemies: [], boss: null });
    game.start();
    game.territories = emptyOnly;
    game.setCompletionMask(mask);
    expect(game.percent).toBeCloseTo(40);
    expect(game.phase).toBe('playing');
  });

  it('triggers character completion at 95% of the mask and only once', () => {
    const width = 20, height = 1;
    const character = new Uint8Array(width).fill(1);
    const mask = { width, height, character };
    const covering = (index: number) => [[{ x: index, y: 0 }, { x: width, y: 0 }, { x: width, y: 8 }, { x: index, y: 8 }]];
    const partial = measureCompletion(mask, width, 8, covering(18));
    expect(partial.capturedChar / partial.totalChar).toBeCloseTo(0.9);
    expect(partial.characterComplete).toBe(false);
    const done = measureCompletion(mask, width, 8, covering(19));
    expect(done.capturedChar / done.totalChar).toBeCloseTo(CHARACTER_COMPLETE);
    expect(done.characterComplete).toBe(true);

    const game = new Game(width, 8, { enemies: [], boss: null, victory: { territoryPercent: 100 } });
    game.start();
    game.territories = covering(19);
    game.setCompletionMask(mask);
    expect(game.characterComplete).toBe(true);
    expect(game.events.filter(event => event === 'characterComplete')).toHaveLength(1);
    game.recomputeCompletion();
    expect(game.events.filter(event => event === 'characterComplete')).toHaveLength(1);
  });

  it('draws the line 1.2× faster while the character stays captured, then clears the boost when claims reset', () => {
    const mask = halfMask(8, 8, true);
    const game = new Game(8, 8, { enemies: [], boss: null, victory: { territoryPercent: 100 } });
    game.start();
    game.player = { x: 6, y: 0 }; game.anchor = { ...game.player };
    game.territories = [[{ x: 4, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 4, y: 8 }]];
    game.setCompletionMask(mask);
    expect(game.characterComplete).toBe(true);
    expect(game.lineSpeed).toBeCloseTo(PLAYER_SPEED * LINE_SPEED_BOOST);
    expect(LINE_SPEED_BOOST).toBe(1.2);
    const y = game.player.y;
    game.update(0.05, 'down', true);
    expect(game.player.y - y).toBeCloseTo(PLAYER_SPEED * 1.2 * 0.05, 5);

    game.territories = [[{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }]];
    game.recomputeCompletion();
    expect(game.characterComplete).toBe(false);
    expect(game.percent).toBeCloseTo(0);
    expect(game.lineSpeed).toBe(PLAYER_SPEED);
  });
});
