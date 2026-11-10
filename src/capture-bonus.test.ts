import { describe, expect, it } from 'vitest';
import { Game } from './engine';

function enclose(width: number, height: number, areaWidth: number, areaHeight: number, lives = 3) {
  const game = new Game(width, height, { enemies: [], boss: null, victory: { territoryPercent: 100 } });
  game.start();
  game.lives = lives;
  // Close one loop against the top edge. Its area is areaWidth × areaHeight.
  game.move('down', true, areaHeight);
  game.move('right', true, areaWidth);
  game.move('up', true, areaHeight);
  return game;
}

describe('big capture bonuses', () => {
  it('adds 50% of the capture score when one loop is over 5% and at most 10%', () => {
    const game = enclose(100, 100, 30, 20); // 600 / 10000 = 6%
    const territory = Math.round(600 * 10 + 70 * 5);
    expect(game.claimed).toBe(600);
    expect(game.lastCaptureBonus).toBe(Math.round(territory * 0.5));
    expect(game.score).toBe(territory + game.lastCaptureBonus);
    expect(game.lastCaptureHeal).toBe(false);
    expect(game.lives).toBe(3);
    expect(game.events).toContain('capture');
  });

  it('adds 100% of the capture score and restores one life when one loop is over 10%', () => {
    const game = enclose(100, 100, 40, 30, 2); // 1200 / 10000 = 12%
    const territory = Math.round(1200 * 10 + 100 * 5);
    expect(game.claimed).toBe(1200);
    expect(game.lastCaptureBonus).toBe(territory);
    expect(game.score).toBe(territory + territory);
    expect(game.lastCaptureHeal).toBe(true);
    expect(game.lives).toBe(3);
    expect(game.lives).toBeLessThanOrEqual(game.maxLives);
  });

  it('does not raise lives above the run maximum when health is already full', () => {
    const game = enclose(100, 100, 40, 30, 3);
    const territory = Math.round(1200 * 10 + 100 * 5);
    expect(game.lastCaptureBonus).toBe(territory);
    expect(game.score).toBe(territory * 2);
    expect(game.lastCaptureHeal).toBe(false);
    expect(game.lives).toBe(game.maxLives);
  });
});
