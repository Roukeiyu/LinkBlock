import { describe, expect, it } from 'vitest';
import { Game, PLAYER_SPEED, RETRACT_SPEED, type Direction } from './engine';
import { createEnemy } from './enemies';
import { Projectile } from './attacks';
import { area, type Point } from './geometry';

const directions: Direction[] = ['up', 'right', 'down', 'left'];
function fixture(turns = 0) {
  const rotate = (p: Point) => { for (let i = 0; i < turns; i++) p = { x: 40 - p.y, y: p.x }; return p; };
  const game = new Game(40, 40, { opening: true, enemies: [], boss: null, random: () => 0.5, victory: { territoryPercent: 100 } });
  game.start(); game.opening!.region = [{ x: 12, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 12, y: 20 }].map(rotate); game.confirmOpening();
  const place = (x: number, y: number) => { game.player = rotate({ x, y }); game.anchor = { ...game.player }; };
  const move = (direction: Direction, amount: number) => game.move(directions[(directions.indexOf(direction) + turns) % 4], true, amount);
  place(16, 12); return { game, rotate, place, move };
}

describe('interruptible retraction on the real island', () => {
  it('stops without a direction, keeps only the remaining path and closes for the correct area and score', () => {
    const { game, move } = fixture();
    move('up', 6); move('right', 8); move('down', 4);
    game.update(2 / RETRACT_SPEED);
    const tip = { ...game.player }, remaining = structuredClone(game.trail);
    expect(tip.x).toBeCloseTo(24); expect(tip.y).toBeCloseTo(8);
    game.resumeDrawing(); expect(game.retracting).toBe(false);
    game.update(0.1, undefined, true); expect(game.player).toEqual(tip); expect(game.trail).toEqual(remaining);
    expect(game.anchor).toEqual({ x: 16, y: 12 }); expect(game.claimed).toBe(64); expect(game.score).toBe(0);
    move('right', 2); move('down', 6); move('left', 6);
    expect(game.claimed).toBeCloseTo(132); expect(game.lastCapture.reduce((sum, p) => sum + area(p), 0)).toBeCloseTo(68);
    expect(game.score).toBe(830); expect(game.trail).toHaveLength(0); expect(game.isBoundary(game.player.x, game.player.y)).toBe(true);
    expect(game.events.filter(e => e === 'capture')).toHaveLength(1); expect(game.lives).toBe(3);
  });

  it('handles repeated release/press edges without a frame between them or resurrecting removed bends', () => {
    const { game, move } = fixture(); move('up', 6); move('right', 8); move('down', 4);
    game.update(5 / RETRACT_SPEED);
    expect(game.trail).toHaveLength(3); expect(game.player.x).toBeCloseTo(23); expect(game.player.y).toBeCloseTo(6);
    for (let i = 0; i < 4; i++) {
      const tip = { ...game.player }, remaining = structuredClone(game.trail);
      game.beginRetraction(); game.resumeDrawing(); game.update(0.01, undefined, true);
      expect(game.player).toEqual(tip); expect(game.trail).toEqual(remaining); expect(game.retracting).toBe(false);
      game.beginRetraction(); game.update(0.125 / RETRACT_SPEED);
    }
    game.update(0.01, undefined, true); expect(game.retracting).toBe(false);
    expect(game.player.x).toBeCloseTo(22.5); expect(game.player.y).toBeCloseTo(6);
    expect(game.trail.some(p => p.x === 24)).toBe(false);
    const tip = { ...game.player }; game.update(0.01, 'up', true);
    expect(game.player.x).toBe(tip.x); expect(game.player.y).toBeCloseTo(tip.y - PLAYER_SPEED * 0.01);
    expect(game.claimed).toBe(64); expect(game.score).toBe(0);
  });

  it('can stop just before the anchor, or fully return and start a fresh line', () => {
    const { game, move } = fixture(); move('up', 0.25);
    game.update(0.2499 / RETRACT_SPEED); game.update(0.02, undefined, true);
    expect(game.player.y).toBeCloseTo(11.9999, 8); expect(game.trail).toHaveLength(2); expect(game.retracting).toBe(false);
    game.beginRetraction(); expect(game.update(0.1)).toBe(true);
    expect(game.player).toEqual({ x: 16, y: 12 }); expect(game.trail).toHaveLength(0);
    game.resumeDrawing(); game.update(0.02, undefined, true); expect(game.player).toEqual(game.anchor);
    game.update(0.01, 'up', true); expect(game.player.y).toBeCloseTo(12 - PLAYER_SPEED * 0.01);
    expect(game.anchor).toEqual({ x: 16, y: 12 }); expect(game.claimed).toBe(64); expect(game.score).toBe(0);
  });

  it.each([0, 1, 2, 3])('resumes a dangerous frame segment and closes back on real shore, turns=%s', turns => {
    const { game, move, place, rotate } = fixture(turns);
    place(14, 12); move('up', 12); move('right', 4); move('down', 12); place(18, 0);
    const score = game.score; move('right', 4); game.update(1 / RETRACT_SPEED); game.resumeDrawing();
    const expected = rotate({ x: 21, y: 0 });
    expect(game.player.x).toBeCloseTo(expected.x); expect(game.player.y).toBeCloseTo(expected.y);
    expect(game.isBoundary(game.player.x, game.player.y)).toBe(false);
    game.update(0.02, undefined, true); expect(game.retracting).toBe(false); expect(game.score).toBe(score);
    move('down', 4); move('left', 3);
    expect(game.claimed).toBeCloseTo(124); expect(game.score - score).toBe(170);
    expect(game.trail).toHaveLength(0); expect(game.isBoundary(game.player.x, game.player.y)).toBe(true);
  });

  it('allows reverse trimming after stopping retraction and still blocks self-crossings', () => {
    const { game, move } = fixture(); move('up', 6); move('right', 8); game.update(1 / RETRACT_SPEED); game.resumeDrawing();
    move('left', 2); expect(game.player.x).toBeCloseTo(21); expect(game.player.y).toBeCloseTo(6);
    move('down', 2); move('left', 10);
    expect(game.player.x).toBeCloseTo(21); expect(game.player.y).toBeCloseTo(8); expect(game.claimed).toBe(64);
  });

  it.each(['straight', 'boss', 'projectile'] as const)('still hits a stationary resumed tip once with %s', kind => {
    const { game, move } = fixture(); move('up', 6); game.update(1 / RETRACT_SPEED); game.resumeDrawing();
    const tip = { ...game.player };
    if (kind === 'projectile') {
      game.spawnHazard(new Projectile(tip, { x: 0, y: 0 })); game.spawnHazard(new Projectile(tip, { x: 0, y: 0 }));
    } else if (kind === 'boss') game.boss = createEnemy(kind, tip, { x: 0, y: 0 });
    else game.enemies.push(createEnemy(kind, tip, { x: 0, y: 0 }));
    game.update(0.02, undefined, true);
    expect(game.lives).toBe(2); expect(game.events.filter(e => e === 'hit')).toHaveLength(1);
    expect(game.player).toEqual(game.anchor); expect(game.trail).toHaveLength(0); expect(game.retracting).toBe(false);
    game.update(0.02, undefined, true); expect(game.lives).toBe(2); expect(game.score).toBe(0); expect(game.claimed).toBe(64);
  });

  it('does not restore erased geometry or its collision when drawing resumes', () => {
    const { game, move } = fixture(); move('up', 6); move('right', 8); move('down', 4);
    game.update(5 / RETRACT_SPEED); game.resumeDrawing();
    game.enemies.push(createEnemy('straight', { x: 24, y: 10 }, { x: 0, y: 0 }));
    game.spawnHazard(new Projectile({ x: 24, y: 10 }, { x: 0, y: 0 }));
    game.update(0.02, undefined, true);
    expect(game.lives).toBe(3); expect(game.trail).toHaveLength(3); expect(game.retracting).toBe(false);
    expect(game.player.x).toBeCloseTo(23); expect(game.player.y).toBeCloseTo(6); expect(game.score).toBe(0);
  });

  it('keeps a degenerate closure recovering until a fresh press rather than the same held input', () => {
    const { game, move } = fixture();
    move('up', 0.0001); move('right', 0.0001); move('down', 0.0001);
    expect(game.claimed).toBe(64); expect(game.score).toBe(0); expect(game.retracting).toBe(true);
    game.update(0.00005 / RETRACT_SPEED, undefined, true);
    expect(game.retracting).toBe(true); expect(game.player.y).toBeCloseTo(11.99995, 8);
    const tip = { ...game.player }; game.resumeDrawing(); game.update(0.01, undefined, true);
    expect(game.player).toEqual(tip); expect(game.retracting).toBe(false);
    game.beginRetraction(); game.update(0.01); expect(game.player).toEqual(game.anchor); expect(game.trail).toHaveLength(0);
  });

  it('cannot resume movement or recover invulnerability while paused or after a loss', () => {
    const { game, move } = fixture(); move('up', 6); game.update(0.01); game.togglePause();
    const tip = { ...game.player }, trail = structuredClone(game.trail);
    game.resumeDrawing(); game.update(0.1, 'right', true);
    expect(game.player).toEqual(tip); expect(game.trail).toEqual(trail); expect(game.retracting).toBe(true);
    game.togglePause(); game.update(0.01, undefined, true); expect(game.retracting).toBe(false);
    game.phase = 'lost'; game.beginRetraction(); game.resumeDrawing(); game.update(1, 'right', true);
    expect(game.player).toEqual(tip); expect(game.protection).toBe(0);
  });
});

describe('directional trail backtracking while drawing is held', () => {
  function bent() {
    const scene = fixture(); scene.move('up', 6); scene.move('right', 8); scene.move('down', 4); return scene;
  }
  it('trims the tip at walking speed and stops at every old bend and the original shore', () => {
    const { game, move } = bent(); move('up', 1);
    expect(game.player).toEqual({ x: 24, y: 9 }); expect(game.retracting).toBe(false);
    expect(game.update(0.05, 'up', true)).toBe(false);
    expect(game.player.y).toBeCloseTo(9 - PLAYER_SPEED * 0.05, 8); expect(game.trail.at(-1)).toEqual(game.player);
    expect(game.update(1, 'up', true)).toBe(true); expect(game.player).toEqual({ x: 24, y: 6 }); expect(game.trail).toHaveLength(3);
    expect(game.update(1, 'left', true)).toBe(true); expect(game.player).toEqual({ x: 16, y: 6 }); expect(game.trail).toHaveLength(2);
    expect(game.update(1, 'down', true)).toBe(true); expect(game.player).toEqual({ x: 16, y: 12 }); expect(game.trail).toHaveLength(0);
    expect(game.retracting).toBe(false); expect(game.claimed).toBe(64); expect(game.score).toBe(0);
    expect(game.events.filter(e => e === 'capture' || e === 'partition')).toHaveLength(0);
    game.update(0.02, undefined, true); expect(game.player).toEqual(game.anchor);
    move('up', 0.25); expect(game.player).toEqual({ x: 16, y: 11.75 }); expect(game.trail).toHaveLength(2);
  });

  it('can immediately redraw an erased direction, change course and close only the remaining path', () => {
    const { game, move } = fixture(); move('up', 6); move('down', 2);
    expect(game.player).toEqual({ x: 16, y: 8 }); move('up', 1); expect(game.player).toEqual({ x: 16, y: 7 });
    move('right', 2); move('down', 5);
    expect(game.claimed).toBe(74); expect(game.score).toBe(160); expect(game.trail).toHaveLength(0);
    expect(game.lastCapture.reduce((sum, p) => sum + area(p), 0)).toBe(10); expect(game.events.filter(e => e === 'capture')).toHaveLength(1);
  });

  it('switches between manual reverse, fast release and a fresh press without restoring erased pieces', () => {
    const { game, move } = bent(); move('up', 1); game.beginRetraction(); game.update(0.01);
    const tip = { ...game.player }; expect(tip.y).toBeCloseTo(9 - RETRACT_SPEED * 0.01); expect(game.retracting).toBe(true);
    game.resumeDrawing(); game.update(0.02, undefined, true); expect(game.player).toEqual(tip); expect(game.retracting).toBe(false);
    move('right', 2); move('left', 1); expect(game.player.x).toBe(25); expect(game.player.y).toBe(tip.y);
    game.beginRetraction(); game.update(1); expect(game.player).toEqual(game.anchor); expect(game.trail).toHaveLength(0);
    expect(game.claimed).toBe(64); expect(game.score).toBe(0);
  });

  it.each([0, 1, 2, 3])('erases a frame-launched line without making bare frame safe, turns=%s', turns => {
    const { game, place, move, rotate } = fixture(turns);
    place(14, 12); move('up', 12); move('right', 4); move('down', 12); place(18, 0);
    const score = game.score; move('right', 4); move('left', 1.5); const expected = rotate({ x: 20.5, y: 0 });
    expect(game.player.x).toBeCloseTo(expected.x, 8); expect(game.player.y).toBeCloseTo(expected.y, 8);
    expect(game.isBoundary(game.player.x, game.player.y)).toBe(false); expect(game.trail).toHaveLength(2);
    move('left', 100); expect(game.player).toEqual(rotate({ x: 18, y: 0 })); expect(game.trail).toHaveLength(0);
    expect(game.claimed).toBe(112); expect(game.score).toBe(score);
  });

  it('still rejects crossings of un-erased older segments', () => {
    const { game, move } = bent(); move('up', 1); const tip = { ...game.player };
    move('left', 10); expect(game.player).toEqual(tip); expect(game.claimed).toBe(64); expect(game.score).toBe(0);
  });

  it.each(['straight', 'boss', 'projectile'] as const)('keeps the remaining path vulnerable to %s and deducts one life', kind => {
    const { game, move } = fixture(); move('up', 6);
    const point = { x: 16, y: 9 };
    if (kind === 'projectile') { game.spawnHazard(new Projectile(point, { x: 0, y: 0 })); game.spawnHazard(new Projectile(point, { x: 0, y: 0 })); }
    else if (kind === 'boss') game.boss = createEnemy(kind, point, { x: 0, y: 0 });
    else game.enemies.push(createEnemy(kind, point, { x: 0, y: 0 }));
    game.update(0.05, 'down', true);
    expect(game.lives).toBe(2); expect(game.events.filter(e => e === 'hit')).toHaveLength(1);
    expect(game.player).toEqual(game.anchor); expect(game.trail).toHaveLength(0); expect(game.score).toBe(0); expect(game.claimed).toBe(64);
  });

  it('does not collide with erased geometry, including a fast shot through an erased segment', () => {
    const { game, move } = fixture(); move('up', 6); move('down', 2);
    game.enemies.push(createEnemy('straight', { x: 16, y: 6.5 }, { x: 0, y: 0 }));
    game.spawnHazard(new Projectile({ x: 13, y: 7 }, { x: 1000, y: 0 }));
    game.update(0.006, 'down', true);
    expect(game.lives).toBe(3); expect(game.player.y).toBeCloseTo(8 + PLAYER_SPEED * 0.006, 8);
    expect(game.trail).toHaveLength(2); expect(game.retracting).toBe(false); expect(game.events).not.toContain('hit');
  });
});
