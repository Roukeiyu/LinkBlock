import { describe, expect, it } from 'vitest';
import { Game } from './engine';
import { createEnemy } from './enemies';
import { lakeBossConfig, MAX_ENEMIES, safeLanding, type BossConfig } from './boss';
import { RadialAttack, MAX_HAZARDS, Projectile } from './attacks';
import { inside } from './geometry';

function seeded() { let seed = 13; return () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32; }
function lake() {
  const game = new Game(72, 48, { bossConfig: lakeBossConfig, victory: { territory: false }, random: seeded() });
  game.enemies.forEach((enemy, i) => { enemy.x = 8 + i * 3; enemy.y = 12 + i; enemy.vx = 0; enemy.vy = 0; });
  game.boss!.vx = 0; game.boss!.vy = 0; game.start(); return game;
}
function hit(game: Game) {
  if (game.bossJump) game.update(1);
  game.territories = [game.outline.map(p => ({ ...p }))];
  game.player = { x: 54, y: 0 }; game.anchor = { ...game.player };
  game.boss!.x = 62; game.boss!.y = 36; game.boss!.previous = { x: 62, y: 36 };
  expect(game.move('down', true, 48)).toBe(true);
}
function replenishing(targetCount = 9, interval = 1, motion: 'axes' | 'vertical' = 'axes') {
  const config: BossConfig = { phases: [{ id: '测试补怪', when: { healthAtMost: 5 }, reinforcements: { targetCount, interval, speed: 8, motion } }] };
  const game = new Game(72, 48, { enemies: [], bossConfig: config, random: seeded(), victory: { territoryPercent: 100 } });
  game.start(); game.protection = 1000; return game;
}

describe('lake boss phases and axis reinforcements', () => {
  it('changes at 3 and 1 health, retaining the same skill within a phase and allowing a fresh restart', () => {
    const game = lake(); expect(game.bossPhase).toBe('一阶段'); expect(game.bossAttack?.directions).toBe(4);
    expect(game.reinforcementTarget).toBeUndefined();
    const first = game.bossAttack; hit(game); expect(game.bossHealth).toBe(4); expect(game.bossAttack).toBe(first);
    hit(game); expect(game.bossHealth).toBe(3); expect(game.bossPhase).toBe('二阶段');
    const second = game.bossAttack as RadialAttack;
    expect(second.directions).toBe(8); expect(second.interval).toBe(5); expect(game.reinforcementTarget).toBe(9);
    hit(game); expect(game.bossHealth).toBe(2); expect(game.bossAttack).toBe(second);
    hit(game); expect(game.bossHealth).toBe(1); expect(game.bossPhase).toBe('三阶段');
    expect(game.bossAttack?.directions).toBe(8); expect((game.bossAttack as RadialAttack).interval).toBe(2.5); expect(game.reinforcementTarget).toBe(15);
    hit(game); expect(game.phase).toBe('won'); expect(game.winReason).toBe('boss');
    const count = game.enemies.length; game.update(20); expect(game.enemies).toHaveLength(count); expect(game.hazards).toHaveLength(0);
    const fresh = lake(); expect(fresh.bossHealth).toBe(5); expect(fresh.bossPhase).toBe('一阶段'); expect(fresh.enemies).toHaveLength(9);
  });
  it('periodically fills to 9, then 15 without exceeding the target or spawning in midair', () => {
    const game = lake(); hit(game); hit(game); game.enemies.splice(0, 3);
    const before = game.enemies.length; game.update(0.8); expect(game.bossJump).toBeDefined(); expect(game.enemies).toHaveLength(before);
    game.update(3.6); expect(game.bossJump).toBeUndefined(); expect(game.enemies).toHaveLength(before);
    game.update(0.6); expect(game.enemies).toHaveLength(9);
    const secondPhaseAdds = game.enemies.slice(before);
    expect(secondPhaseAdds.some(enemy => enemy.vx !== 0 && enemy.vy === 0)).toBe(true);
    expect(secondPhaseAdds.some(enemy => enemy.vx === 0 && enemy.vy !== 0)).toBe(true);
    // Remove risk from moving bodies while applying the next two enclosures.
    for (const enemy of game.enemies) { enemy.x = 8; enemy.y = 20; enemy.vx = 0; enemy.vy = 0; }
    hit(game); hit(game); game.update(5.1); expect(game.enemies).toHaveLength(15);
    expect(game.enemies.slice(9).filter(enemy => enemy.vy === 0)).toHaveLength(3);
    expect(game.enemies.slice(9).filter(enemy => enemy.vx === 0)).toHaveLength(3);
    game.enemies.push(createEnemy('orbit', { x: 10, y: 10 }));
    game.update(4); expect(game.enemies).toHaveLength(16); // A lower target never deletes existing bodies.
  });
  it('spawns safely on mixed horizontal/vertical paths and retains each axis through boundary reflection', () => {
    const game = replenishing();
    game.protection = 0; game.move('down', true, 12); game.move('left', true, 8); game.move('down', true, 10);
    expect(game.trail).toHaveLength(4); game.protection = 1000; game.update(1.01, undefined, true);
    expect(game.enemies).toHaveLength(9);
    const horizontal = game.enemies.filter(enemy => enemy.vy === 0);
    expect(horizontal).toHaveLength(5); expect(game.enemies.filter(enemy => enemy.vx === 0)).toHaveLength(4);
    for (const enemy of game.enemies) {
      expect(enemy.kind).toBe('straight'); expect(Math.hypot(enemy.vx, enemy.vy)).toBe(8);
      expect(safeLanding(enemy, game.territories, enemy, game.enemies.filter(other => other !== enemy).concat(game.boss!), game.player, game.trail)).toBe(true);
    }
    game.trail = []; const fixed = game.enemies.map(enemy => enemy.vy === 0 ? enemy.y : enemy.x);
    for (let i = 0; i < 600; i++) game.update(1 / 60);
    expect(game.enemies.map(enemy => enemy.vy === 0 ? enemy.y : enemy.x)).toEqual(fixed); expect(game.enemies).toHaveLength(9);
    expect(game.enemies.every(enemy => inside(enemy, game.territories[0]) && Math.hypot(enemy.vx, enemy.vy) === 8)).toBe(true);
  });
  it('alternates axes across single-enemy refill waves and can still configure vertical-only motion', () => {
    const game = replenishing(1); const axes: number[][] = [];
    for (let i = 0; i < 3; i++) {
      game.enemies = []; game.update(1.01); const enemy = game.enemies[0]; axes.push([Math.abs(enemy.vx), Math.abs(enemy.vy)]);
    }
    expect(axes).toEqual([[8, 0], [0, 8], [8, 0]]);
    const vertical = replenishing(3, 1, 'vertical'); vertical.update(1.01);
    expect(vertical.enemies.every(enemy => enemy.vx === 0 && Math.abs(enemy.vy) === 8)).toBe(true);
    expect(() => new Game(72, 48, { bossConfig: { phases: [{ id: 'bad', when: { healthAtMost: 3 }, reinforcements: { targetCount: 9, interval: 4, speed: 8, motion: 'diagonal' as never } }] } })).toThrow();
  });
  it('retains the alternating orientation within phase one and replaces it at phase two', () => {
    const game = lake(); const first = game.bossAttack!; game.protection = 1000; game.update(5.05);
    expect(first.angleOffset).toBe(Math.PI / 4); game.protection = 0; hit(game);
    expect(game.bossAttack).toBe(first); expect(game.bossHealth).toBe(4); expect(first.angleOffset).toBe(Math.PI / 4);
    hit(game); expect(game.bossHealth).toBe(3); expect(game.bossAttack).not.toBe(first);
    expect(game.bossAttack?.directions).toBe(8); expect(game.bossAttack?.angleOffset).toBe(0);
  });
  it('stops reinforcement and projectile activity on player defeat', () => {
    const game = replenishing(); game.protection = 0; game.lives = 1;
    game.spawnHazard(new Projectile({ ...game.player }, { x: 0, y: 0 })); game.update(0.01);
    expect(game.phase).toBe('lost'); game.update(20); expect(game.enemies).toHaveLength(0); expect(game.hazards).toHaveLength(0);
  });
  it('freezes the reinforcement timer while paused and does not refill until its next interval', () => {
    const game = replenishing(); game.update(0.5); game.togglePause(); game.update(10); expect(game.enemies).toHaveLength(0);
    game.togglePause(); game.update(0.51); expect(game.enemies).toHaveLength(9);
    game.enemies.splice(0, 3); game.update(0.5); expect(game.enemies).toHaveLength(6);
    game.update(0.5); expect(game.enemies).toHaveLength(9); game.update(10); expect(game.enemies).toHaveLength(9);
  });
  it('scores captured reinforcements like other enemies and stops spawning after territory victory', () => {
    const game = replenishing(1); game.protection = 0; game.update(1.01);
    const target = game.enemies[0]; target.x = 67; target.y = 35; target.vy = 0;
    game.player = { x: 62, y: 0 }; game.anchor = { ...game.player }; game.boss!.x = 20; game.boss!.y = 30;
    game.move('down', true, 48); expect(game.enemies).toHaveLength(0); expect(game.lastDefeats[0].points).toBe(500);
    const score = game.score; game.update(0.4); expect(game.enemies).toHaveLength(0); expect(game.score).toBe(score);
    game.update(0.6); expect(game.enemies).toHaveLength(1);
    game.player = { x: 62, y: 0 }; game.anchor = { ...game.player };
    game.move('down', true, 48); // Travel the existing boundary before a final enclosure.
    game.enemies = []; game.boss = undefined; game.player = { x: 31, y: 0 }; game.anchor = { ...game.player };
    game.move('down', true, 48); expect(game.phase).toBe('won');
    game.update(20); expect(game.enemies).toHaveLength(0); expect(game.hazards).toHaveLength(0);
  });
  it('defers crowded spawns safely and keeps searches bounded', () => {
    const game = replenishing(15); game.territories = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 48 }, { x: 0, y: 48 }]];
    const start = performance.now(); game.update(8.01);
    expect(game.enemies).toHaveLength(0); expect(performance.now() - start).toBeLessThan(1000);
    game.territories = [game.outline.map(p => ({ ...p }))]; game.update(1); expect(game.enemies).toHaveLength(15);
  });
  it('runs the final phase for two minutes with bounded enemies, projectiles and traces', () => {
    const game = new Game(72, 48, { bossConfig: { phases: [{ ...lakeBossConfig.phases![2], when: { healthAtMost: 5 } }] }, random: seeded() });
    game.start(); game.protection = 1000;
    const start = performance.now(); let peak = 0;
    for (let i = 0; i < 7200; i++) {
      game.update(1 / 60); peak = Math.max(peak, game.hazards.length);
      expect(game.enemies.length).toBeLessThanOrEqual(15); expect(game.hazards.length).toBeLessThanOrEqual(MAX_HAZARDS);
      expect([...game.enemies, game.boss!].every(enemy => enemy.trace.length <= 18)).toBe(true); game.events = [];
    }
    expect(game.enemies).toHaveLength(15); expect(peak).toBeGreaterThanOrEqual(8); expect(performance.now() - start).toBeLessThan(6000);
  });
  it.each([{ targetCount: MAX_ENEMIES + 1, interval: 1, speed: 8 }, { targetCount: 9, interval: 0, speed: 8 }, { targetCount: 9, interval: 1, speed: NaN }])('validates reinforcement configuration %o', reinforcements => {
    expect(() => new Game(72, 48, { bossConfig: { phases: [{ id: 'bad', when: { healthAtMost: 3 }, reinforcements }] } })).toThrow();
  });
});
