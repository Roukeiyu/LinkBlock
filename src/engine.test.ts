import { describe, expect, it } from 'vitest';
import { EMPTY, Game, SAFE, TRAIL, type Direction } from './engine';

function fixture() {
  const game = new Game(10, 10);
  game.player = { x: 4, y: 0 };
  game.anchor = { ...game.player };
  game.enemy = { x: 7.5, y: 6.5, vx: 0, vy: 0 };
  game.start();
  return game;
}
function moves(game: Game, direction: Direction, count: number, drawing = true) {
  for (let i = 0; i < count; i++) game.move(direction, drawing);
}

describe('territory rules', () => {
  it('requires drawing to leave the safe border and prevents self-intersection', () => {
    const game = fixture();
    game.move('down', false);
    expect(game.player).toEqual({ x: 4, y: 0 });
    moves(game, 'down', 3);
    expect(game.trail).toHaveLength(3);
    expect(game.cell(4, 3)).toBe(TRAIL);
    game.move('up', true);
    expect(game.player).toEqual({ x: 4, y: 3 });
    game.move('right', false);
    expect(game.player).toEqual({ x: 4, y: 3 });
    expect(game.claimed).toBe(0);
  });

  it('captures the component without the enemy and scores the enclosed area', () => {
    const game = fixture();
    moves(game, 'down', 9);
    expect(game.trail).toHaveLength(0);
    expect(game.cell(2, 6)).toBe(SAFE);
    expect(game.cell(7, 6)).toBe(EMPTY);
    expect(game.claimed).toBe(32);
    expect(game.percent).toBe(50);
    expect(game.score).toBe(360);
    expect(game.phase).toBe('playing');
  });

  it('does not fill a region still connected to the enemy around a bent line', () => {
    const game = fixture();
    moves(game, 'down', 3);
    moves(game, 'left', 4);
    expect(game.cell(2, 1)).toBe(SAFE);
    expect(game.cell(2, 5)).toBe(EMPTY);
    expect(game.cell(6, 1)).toBe(EMPTY);
    expect(game.claimed).toBe(12);
  });

  it('wins at 75%, adds the life bonus and freezes the result', () => {
    const game = fixture();
    moves(game, 'down', 9);
    moves(game, 'right', 2, false);
    moves(game, 'up', 9);
    expect(game.percent).toBe(75);
    expect(game.phase).toBe('won');
    expect(game.score).toBe(3560);
    const player = { ...game.player }, enemy = { ...game.enemy };
    game.move('left', true); game.update(1);
    expect(game.player).toEqual(player);
    expect(game.enemy).toEqual(enemy);
    expect(game.events).toContain('won');
  });
});

describe('enemy, damage and lifecycle', () => {
  it('detects an enemy crossing the live line, clears it and respawns safely', () => {
    const game = fixture();
    moves(game, 'down', 5);
    game.enemy = { x: 5.5, y: 3.5, vx: -10, vy: 0 };
    game.update(0.1);
    expect(game.lives).toBe(2);
    expect(game.player).toEqual({ x: 4, y: 0 });
    expect(game.trail).toHaveLength(0);
    expect(game.cell(4, 3)).toBe(EMPTY);
    expect(game.phase).toBe('playing');
    expect(game.events).toContain('hit');
    game.move('down', true);
    expect(game.trail).toHaveLength(0);
  });

  it('detects a direct player collision before a cut can finish', () => {
    const game = fixture();
    game.enemy = { x: 4.5, y: 1.5, vx: 0, vy: 0 };
    game.move('down', true);
    expect(game.lives).toBe(2);
    expect(game.claimed).toBe(0);
    expect(game.trail).toHaveLength(0);
  });

  it('ends the run after three hits', () => {
    const game = fixture();
    for (let i = 0; i < 3; i++) {
      game.protection = 0;
      game.enemy = { x: 4.5, y: 1.5, vx: 0, vy: 0 };
      game.move('down', true);
    }
    expect(game.lives).toBe(0);
    expect(game.phase).toBe('lost');
    expect(game.events).toContain('lost');
  });

  it('pauses movement, the enemy and elapsed time, then resumes', () => {
    const game = fixture();
    game.enemy.vx = 5;
    game.togglePause();
    const enemy = { ...game.enemy };
    game.update(1); game.move('down', true);
    expect(game.elapsed).toBe(0);
    expect(game.enemy).toEqual(enemy);
    expect(game.trail).toHaveLength(0);
    game.togglePause(); game.update(0.1);
    expect(game.elapsed).toBeCloseTo(0.1);
    expect(game.enemy.x).not.toBe(enemy.x);
  });

  it('keeps the enemy inside danger cells after a capture over a long simulation', () => {
    const game = fixture();
    moves(game, 'down', 9);
    game.enemy.vx = 7.4; game.enemy.vy = 5.2;
    let bouncedX = false, bouncedY = false;
    for (let i = 0; i < 3000; i++) {
      game.update(1 / 60);
      expect(game.cell(Math.floor(game.enemy.x), Math.floor(game.enemy.y))).toBe(EMPTY);
      bouncedX ||= game.enemy.vx < 0;
      bouncedY ||= game.enemy.vy < 0;
    }
    expect(bouncedX && bouncedY).toBe(true);
  });

  it('constructs a fresh run without retained territory, score or lives', () => {
    const previous = fixture();
    moves(previous, 'down', 9);
    const fresh = new Game();
    expect(fresh.percent).toBe(0);
    expect(fresh.score).toBe(0);
    expect(fresh.lives).toBe(3);
    expect(fresh.phase).toBe('ready');
  });
});
