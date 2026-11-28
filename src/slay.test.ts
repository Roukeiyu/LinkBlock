import { describe, expect, it } from 'vitest';
import { Projectile } from './attacks';
import { Game } from './engine';
import { DEFEAT_POINTS, createEnemy, enemyHitRadius } from './enemies';
import { distance, type Point, type Polygon } from './geometry';
import { lakeTheme } from './effects';
import { BOMB_RADIUS, BOMB_RADIUS_FACTOR } from './powerups';
import { SLAY_INK, linesLength, splitTrail } from './slay-ink';
import { LINE_HIT_PADDING, slayLength, slayReach } from './stats';

function drawnLine(rank: number, length = 8) {
  const game = new Game(40, Math.max(40, length + 8), { enemies: [], boss: null });
  game.modifiers.slay = rank;
  game.start();
  game.move('down', true, length);
  return game;
}

function cross(game: Game, enemy: ReturnType<typeof createEnemy>) {
  if (enemy.kind === 'boss') game.boss = enemy;
  else game.enemies.push(enemy);
  game.update(0.001, undefined, true);
  return enemy;
}

function touches(lines: Polygon[], point: Point, reach = 0.05) {
  return lines.some(line => line.slice(1).some((p, i) => distance(point, line[i], p) <= reach));
}

describe('镇杀 line kills', () => {
  it('keeps a core contact as a life loss until the first rank', () => {
    const game = drawnLine(0);
    const enemy = cross(game, createEnemy('straight', { x: 20.56, y: 4 }, { x: 0, y: 0 }));
    expect(game.lives).toBe(2);
    expect(game.enemies).toEqual([enemy]);
    expect(game.score).toBe(0);
    expect(game.events.some(event => typeof event === 'object' && event.type === 'slay')).toBe(false);
  });

  it.each(['straight', 'orbit', 'zigzag'] as const)('rank 1 slays a %s enemy on the old punishing contact and keeps the line', kind => {
    const game = drawnLine(1);
    const enemy = createEnemy(kind, { x: 20.56, y: 4 }, { x: 0, y: 0 });
    cross(game, enemy);
    expect(game.lives).toBe(3);
    expect(game.enemies).toHaveLength(0);
    expect(game.trail.length).toBeGreaterThan(1);
    expect(game.score).toBe(DEFEAT_POINTS[kind]);
    expect(game.events).toContainEqual({ type: 'slay', enemies: [{ kind, x: enemy.x, y: enemy.y, points: DEFEAT_POINTS[kind] }] });
  });

  it('keeps the rank-1 kill width at every rank', () => {
    const core = enemyHitRadius(createEnemy('straight', { x: 0, y: 0 }));
    expect(slayReach(1, core)).toBeCloseTo(core + LINE_HIT_PADDING, 8);
    expect(slayReach(10, core)).toBeCloseTo(slayReach(1, core), 8);

    const narrow = drawnLine(1);
    cross(narrow, createEnemy('straight', { x: 21.2, y: 4 }, { x: 0, y: 0 }));
    expect(narrow.lives).toBe(3);
    expect(narrow.enemies).toHaveLength(1);
    expect(narrow.score).toBe(0);

    const wide = drawnLine(10);
    cross(wide, createEnemy('zigzag', { x: 21.2, y: 4 }, { x: 0, y: 0 }));
    expect(wide.lives).toBe(3);
    expect(wide.enemies).toHaveLength(1);
    expect(wide.score).toBe(0);
    expect(wide.trail.length).toBeGreaterThan(1);

    const onTheLine = drawnLine(10);
    cross(onTheLine, createEnemy('orbit', { x: 20.56, y: 4 }, { x: 0, y: 0 }));
    expect(onTheLine.enemies).toHaveLength(0);
    expect(onTheLine.lives).toBe(3);

    const beyond = drawnLine(10);
    cross(beyond, createEnemy('orbit', { x: 22.2, y: 4 }, { x: 0, y: 0 }));
    expect(beyond.enemies).toHaveLength(1);
    expect(beyond.lives).toBe(3);
    expect(beyond.score).toBe(0);
  });

  it('gives rank 1 a short burst, rank 4 a much longer one, and rank 10 a longer one still', () => {
    const rank1 = drawnLine(1, 60);
    expect(linesLength(rank1.strokeInk().slay)).toBeCloseTo(slayLength(1), 4);
    expect(linesLength(rank1.strokeInk().plain)).toBeCloseTo(60 - slayLength(1), 4);
    cross(rank1, createEnemy('straight', { x: 20.45, y: 10 }, { x: 0, y: 0 }));
    expect(rank1.enemies).toHaveLength(0);
    expect(rank1.lives).toBe(3);
    const pastRank1 = createEnemy('straight', { x: 20.45, y: 40 }, { x: 0, y: 0 });
    cross(rank1, pastRank1);
    expect(rank1.enemies).toEqual([pastRank1]);
    expect(rank1.lives).toBe(2);

    const rank4 = drawnLine(4, 100);
    expect(linesLength(rank4.strokeInk().slay)).toBeCloseTo(slayLength(4), 4);
    cross(rank4, createEnemy('straight', { x: 20.45, y: 40 }, { x: 0, y: 0 }));
    expect(rank4.enemies).toHaveLength(0);
    expect(rank4.lives).toBe(3);
    const pastRank4 = createEnemy('zigzag', { x: 20.45, y: 90 }, { x: 0, y: 0 });
    cross(rank4, pastRank4);
    expect(rank4.enemies).toEqual([pastRank4]);
    expect(rank4.lives).toBe(2);

    const rank10 = drawnLine(10, 200);
    expect(linesLength(rank10.strokeInk().slay)).toBeCloseTo(slayLength(10), 4);
    cross(rank10, createEnemy('orbit', { x: 20.45, y: 100 }, { x: 0, y: 0 }));
    expect(rank10.enemies).toHaveLength(0);
    expect(rank10.lives).toBe(3);
    const pastRank10 = createEnemy('straight', { x: 20.45, y: 190 }, { x: 0, y: 0 });
    cross(rank10, pastRank10);
    expect(rank10.enemies).toEqual([pastRank10]);
    expect(rank10.lives).toBe(2);
    expect(slayLength(4)).toBeGreaterThan(slayLength(1) * 3);
    expect(slayLength(10)).toBeGreaterThan(slayLength(4) * 2);
  });

  it('spends one pool across strokes and does not refill it when the line comes back or a life is lost', () => {
    const game = drawnLine(1, slayLength(1));
    expect(game.slayRemaining).toBeCloseTo(0, 5);
    game.update(1);
    expect(game.trail.length).toBeLessThan(2);
    expect(game.coastSlay()).toEqual([]);
    expect(game.slayRemaining).toBeCloseTo(0, 5);
    game.move('down', true, 8);
    const enemy = cross(game, createEnemy('straight', { x: 20.45, y: 4 }, { x: 0, y: 0 }));
    expect(game.lives).toBe(2);
    expect(game.enemies).toEqual([enemy]);
    expect(game.slayRemaining).toBeCloseTo(0, 5);

    const retry = new Game(40, 40, { enemies: [], boss: null });
    retry.modifiers.slay = 1;
    retry.start();
    expect(retry.slayRemaining).toBe(slayLength(1));
    retry.move('down', true, 8);
    cross(retry, createEnemy('straight', { x: 20.45, y: 4 }, { x: 0, y: 0 }));
    expect(retry.enemies).toHaveLength(0);
    expect(retry.lives).toBe(3);
  });

  it('shares a short rank-1 pool across several strokes, then the rest of the line is ordinary ink', () => {
    const game = new Game(40, 40, { enemies: [], boss: null });
    game.modifiers.slay = 1;
    game.start();
    game.move('down', true, 8);
    cross(game, createEnemy('straight', { x: 20.45, y: 4 }, { x: 0, y: 0 }));
    expect(game.enemies).toHaveLength(0);
    expect(game.lives).toBe(3);
    game.update(1);
    expect(game.slayRemaining).toBeCloseTo(slayLength(1) - 8, 4);
    game.move('down', true, 8);
    cross(game, createEnemy('orbit', { x: 20.45, y: 4 }, { x: 0, y: 0 }));
    expect(game.enemies).toHaveLength(0);
    expect(game.slayRemaining).toBeCloseTo(slayLength(1) - 16, 4);
    game.update(1);
    game.move('down', true, 8);
    const enemy = cross(game, createEnemy('zigzag', { x: 20.45, y: 4 }, { x: 0, y: 0 }));
    expect(game.enemies).toEqual([enemy]);
    expect(game.lives).toBe(2);
    expect(game.slayRemaining).toBeCloseTo(0, 5);
  });

  it('does not treat ink drawn after a retract as slay once the budget is already spent', () => {
    const game = drawnLine(1, slayLength(1));
    expect(game.move('up', true, 8)).toBe(false);
    expect(linesLength(game.strokeInk().slay)).toBeCloseTo(slayLength(1) - 8, 3);
    expect(game.slayRemaining).toBeCloseTo(0, 5);
    game.move('down', true, 8);
    expect(linesLength(game.strokeInk().slay)).toBeCloseTo(slayLength(1) - 8, 3);
    expect(linesLength(game.strokeInk().plain)).toBeCloseTo(8, 3);
    const enemy = cross(game, createEnemy('straight', { x: 20.45, y: 14 }, { x: 0, y: 0 }));
    expect(game.enemies).toEqual([enemy]);
    expect(game.lives).toBe(2);
  });

  it('does not refund slay length when a projectile takes a life and the stroke stays', () => {
    const game = drawnLine(4, 20);
    const remaining = game.slayRemaining;
    expect(remaining).toBeCloseTo(slayLength(4) - 20, 4);
    game.spawnHazard(new Projectile({ x: 20, y: 8 }, { x: 0, y: 0 }));
    game.update(0.01, undefined, true);
    expect(game.lives).toBe(2);
    expect(game.trail.length).toBeGreaterThan(1);
    expect(game.slayRemaining).toBeCloseTo(remaining, 5);
  });

  it('adds the extra length immediately when the rank goes up mid-attempt', () => {
    const game = drawnLine(1, 10);
    expect(game.slayRemaining).toBeCloseTo(slayLength(1) - 10, 4);
    game.modifiers.slay = 4;
    expect(game.slayRemaining).toBeCloseTo(slayLength(4) - 10, 4);
    game.move('down', true, 20);
    expect(linesLength(game.strokeInk().slay)).toBeCloseTo(30, 4);
    expect(game.strokeInk().plain).toEqual([]);
  });

  it('keeps the cinnabar prefix on a closed shore and leaves the ordinary suffix as shore', () => {
    const game = new Game(40, 40, { enemies: [], boss: null });
    game.modifiers.slay = 1;
    game.start();
    expect(game.move('down', true, 16)).toBe(false);
    expect(game.move('right', true, 10)).toBe(false);
    expect(linesLength(game.strokeInk().slay)).toBeCloseTo(slayLength(1), 4);
    expect(linesLength(game.strokeInk().plain)).toBeCloseTo(8, 4);
    expect(game.move('up', true, 16)).toBe(true);
    const shore = game.coastSlay();
    expect(linesLength(shore)).toBeCloseTo(slayLength(1), 3);
    expect(touches(shore, { x: 20, y: 8 })).toBe(true);
    expect(touches(shore, { x: 28, y: 16 })).toBe(false);
    expect(touches(shore, { x: 30, y: 8 })).toBe(false);
    expect(game.trail).toEqual([]);
  });

  it('splits a stroke into cinnabar and ordinary ink at the budget, including mid-segment', () => {
    const split = splitTrail(
      [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }],
      [{ start: 0, end: 12 }],
    );
    expect(linesLength(split.slay)).toBeCloseTo(12, 6);
    expect(linesLength(split.plain)).toBeCloseTo(8, 6);
    expect(split.slay).toEqual([[{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 2, y: 10 }]]);
    expect(split.plain).toEqual([[{ x: 2, y: 10 }, { x: 10, y: 10 }]]);
    expect(SLAY_INK).not.toBe(lakeTheme.trail);
    const red = Number.parseInt(SLAY_INK.slice(1, 3), 16);
    const green = Number.parseInt(SLAY_INK.slice(3, 5), 16);
    const blue = Number.parseInt(SLAY_INK.slice(5, 7), 16);
    expect(red).toBeGreaterThan(200);
    expect(red).toBeGreaterThan(green + 80);
    expect(red).toBeGreaterThan(blue + 80);
  });

  it('does not slay or chip a boss touched by the slay portion of the line', () => {
    const touching = drawnLine(10);
    const boss = cross(touching, createEnemy('boss', { x: 21.4, y: 4 }, { x: 0, y: 0 }));
    expect(touching.lives).toBe(2);
    expect(touching.boss).toBe(boss);
    expect(touching.bossHealth).toBe(touching.bossMaxHealth);
    expect(touching.events.some(event => typeof event === 'object' && event.type === 'slay')).toBe(false);

    const wide = drawnLine(10);
    const missed = cross(wide, createEnemy('boss', { x: 21.65, y: 4 }, { x: 0, y: 0 }));
    expect(wide.lives).toBe(3);
    expect(wide.boss).toBe(missed);
    expect(wide.bossHealth).toBe(wide.bossMaxHealth);
    expect(wide.score).toBe(0);
  });

  it('still encloses a regular enemy the line does not cross', () => {
    const target = createEnemy('orbit', { x: 17, y: 5 }, { x: 0, y: 0 });
    const survivor = createEnemy('straight', { x: 17, y: 16 }, { x: 0, y: 0 });
    const game = new Game(20, 20, { enemies: [target, survivor], boss: null });
    game.modifiers.slay = 10;
    game.start();
    game.move('down', true, 20);
    expect(game.enemies).toEqual([target, survivor]);
    expect(game.events.some(event => typeof event === 'object' && event.type === 'slay')).toBe(false);
    game.move('up', false, 12);
    expect(game.move('right', true, 10)).toBe(true);
    expect(game.enemies).toEqual([survivor]);
    expect(game.lastDefeats).toEqual([{ kind: 'orbit', x: 17, y: 5, points: DEFEAT_POINTS.orbit }]);
    expect(game.events.some(event => typeof event === 'object' && event.type === 'defeat')).toBe(true);
  });

  it('still lets a bomb remove regular enemies and only chip the boss', () => {
    const minion = createEnemy('straight', { x: 30, y: 8 }, { x: 0, y: 0 });
    const boss = createEnemy('boss', { x: 30, y: 10 }, { x: 0, y: 0 });
    const game = new Game(40, 40, {
      enemies: [minion], boss, powerUps: true, random: () => 0,
      victory: { territoryPercent: 100, defeatBoss: false },
      createBossAttack: () => ({ name: 'idle', warning: 0, update() {} }),
    });
    game.modifiers.slay = 10;
    game.start();
    game.powerUp = { ...game.player, kind: 'bomb' };
    game.move('right', false, 0);
    expect(game.bombRadius).toBeCloseTo(BOMB_RADIUS * BOMB_RADIUS_FACTOR.min, 8);
    game.player = { x: 30, y: 0 };
    game.anchor = { ...game.player };
    game.update(3);
    expect(game.enemies).toHaveLength(0);
    expect(game.boss).toBeDefined();
    expect(game.bossHealth).toBe(game.bossMaxHealth - 1);
    expect(game.events.some(event => typeof event === 'object' && event.type === 'defeat')).toBe(true);
    expect(game.events.some(event => typeof event === 'object' && event.type === 'slay')).toBe(false);
  });

  it('still loses a life to a projectile on the line', () => {
    const game = drawnLine(10);
    game.spawnHazard(new Projectile({ x: 20, y: 4 }, { x: 0, y: 0 }));
    game.update(0.01, undefined, true);
    expect(game.lives).toBe(2);
    expect(game.events).toContain('hit');
  });
});
