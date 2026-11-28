import { describe, expect, it } from 'vitest';
import { Projectile } from './attacks';
import { Game } from './engine';
import { DEFEAT_POINTS, createEnemy } from './enemies';
import { BOMB_RADIUS, BOMB_RADIUS_FACTOR } from './powerups';

function drawnLine(rank: number) {
  const game = new Game(40, 40, { enemies: [], boss: null });
  game.modifiers.slay = rank;
  game.start();
  game.move('down', true, 8);
  return game;
}

function cross(game: Game, enemy: ReturnType<typeof createEnemy>) {
  if (enemy.kind === 'boss') game.boss = enemy;
  else game.enemies.push(enemy);
  game.update(0.001, undefined, true);
  return enemy;
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

  it('widens the kill at rank 10 and still misses beyond that width', () => {
    const narrow = drawnLine(1);
    cross(narrow, createEnemy('straight', { x: 21.2, y: 4 }, { x: 0, y: 0 }));
    expect(narrow.lives).toBe(3);
    expect(narrow.enemies).toHaveLength(1);
    expect(narrow.score).toBe(0);

    const wide = drawnLine(10);
    cross(wide, createEnemy('zigzag', { x: 21.2, y: 4 }, { x: 0, y: 0 }));
    expect(wide.lives).toBe(3);
    expect(wide.enemies).toHaveLength(0);
    expect(wide.score).toBe(DEFEAT_POINTS.zigzag);
    expect(wide.trail.length).toBeGreaterThan(1);

    const beyond = drawnLine(10);
    cross(beyond, createEnemy('orbit', { x: 22.2, y: 4 }, { x: 0, y: 0 }));
    expect(beyond.enemies).toHaveLength(1);
    expect(beyond.lives).toBe(3);
    expect(beyond.score).toBe(0);
  });

  it('does not slay or chip a boss, including one inside the wide rank-10 corridor', () => {
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
