import { describe, expect, it } from 'vitest';
import { Game, type GameOptions } from './engine';
import { createEnemy } from './enemies';
import { BOSS_HIT_POINTS, findLanding, jumpPose, safeLanding } from './boss';
import { Projectile } from './attacks';
import { distance, edges, inside } from './geometry';

function fixture(extra: GameOptions = {}) {
  const game = new Game(20, 20, {
    enemies: [createEnemy('straight', { x: 5, y: 6 }, { x: 0, y: 0 })],
    boss: createEnemy('boss', { x: 17, y: 16 }, { x: 0, y: 0 }), random: () => 0.5,
    victory: { territoryPercent: 100 }, ...extra,
  }); game.start(); return game;
}
function enclose(game: Game) { game.move('right', false, 4); game.move('down', true, 20); }
function repeatHit(game: Game) {
  if (game.bossJump) game.update(1);
  game.territories = [game.outline.map(p => ({ ...p }))];
  game.player = { x: 14, y: 0 }; game.anchor = { ...game.player };
  game.boss!.x = 17; game.boss!.y = 16; game.boss!.previous = { x: 17, y: 16 };
  game.move('down', true, 20);
}

describe('boss health and escape jump', () => {
  it('takes one of five health bars, claims the pocket, rewards a hit and jumps to safe danger', () => {
    const game = fixture(); enclose(game);
    expect(game.bossHealth).toBe(4); expect(game.bossMaxHealth).toBe(5);
    expect(game.boss).toBeDefined(); expect(game.lastDefeats).toHaveLength(0);
    expect(game.percent).toBeCloseTo(30); expect(game.score).toBe(1200 + 100 + BOSS_HIT_POINTS);
    expect(game.bossJump?.from).toEqual({ x: 17, y: 16 }); expect(game.bossJump?.to).not.toBeNull();
    expect(safeLanding(game.bossJump!.to!, game.territories, game.boss!, game.enemies, game.player, [])).toBe(true);
    expect(game.captured.every(region => !inside(game.bossJump!.to!, region))).toBe(true);
    game.update(0.45); expect(game.bossJump).toBeDefined(); expect(jumpPose(game.bossJump!).scale).toBeCloseTo(1.35, 2);
    game.update(0.5); expect(game.bossJump).toBeUndefined(); expect(game.bossHealth).toBe(4);
  });
  it('does not damage the boss again when its reserved landing region is captured in midair', () => {
    const game = fixture(); enclose(game);
    game.move('up', false, 20); game.move('left', false, 4); game.move('down', true, 13); game.move('left', true, 10);
    expect(game.bossHealth).toBe(4); expect(game.bossJump).toBeDefined();
    expect(game.events.filter(event => typeof event === 'object' && event.type === 'bossHit')).toHaveLength(1);
    expect(game.territories.some(region => inside(game.boss!, region))).toBe(true);
  });
  it('freezes jump and health while paused, suppresses casting in midair and resumes after landing', () => {
    let attackTime = 0;
    const game = fixture({ createBossAttack: () => ({ name: '计时', warning: 0, update(seconds) { attackTime += seconds; } }) });
    enclose(game); game.update(0.3); expect(attackTime).toBe(0);
    game.togglePause(); const jump = structuredClone(game.bossJump); game.update(5);
    expect(game.bossJump).toEqual(jump); expect(game.bossHealth).toBe(4); expect(attackTime).toBe(0);
    game.togglePause(); game.update(0.7);
    expect(game.bossJump).toBeUndefined(); expect(attackTime).toBeGreaterThan(0); expect(attackTime).toBeLessThan(0.11);
  });
  it('avoids an unfinished trail that appears under the landing point without severing it in midair', () => {
    const game = fixture(); enclose(game); const target = game.bossJump!.to!;
    game.trail = [{ x: target.x - 3, y: target.y }, { x: target.x + 3, y: target.y }];
    game.update(0.91, undefined, true);
    expect(game.lives).toBe(3); expect(game.bossHealth).toBe(4); expect(game.trail).toHaveLength(2);
    expect(game.bossJump?.to).not.toEqual(target);
    game.update(0.4, undefined, true);
    expect(game.bossJump).toBeUndefined(); expect(game.lives).toBe(3);
  });
  it('handles no valid landing by staying harmlessly airborne; area completion remains possible', () => {
    const game = new Game(20, 60, { enemies: [], boss: createEnemy('boss', { x: 16, y: 4 }, { x: 0, y: 0 }), victory: { territoryPercent: 100 }, random: () => 0.5 });
    game.territories = [[{ x: 12, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 60 }, { x: 18, y: 60 }, { x: 18, y: 8 }, { x: 12, y: 8 }]];
    game.player = { x: 18, y: 8 }; game.anchor = { ...game.player }; game.start(); game.move('right', true, 2);
    expect(game.bossHealth).toBe(4); expect(game.bossJump?.to).toBeNull(); expect(game.phase).toBe('playing');
    game.update(1); expect(game.bossJump?.to).toBeNull(); expect(game.lives).toBe(3); expect(game.hazards).toHaveLength(0);
    game.move('down', false, 26); game.move('left', true, 2);
    expect(game.phase).toBe('won'); expect(game.winReason).toBe('territory'); expect(game.bossHealth).toBe(4);
  });
  it('wins on the fifth enclosure even below the territory goal and awards the defeat once', () => {
    const game = fixture(); game.spawnHazard(new Projectile({ x: 3, y: 16 }, { x: 0, y: 0 }));
    for (let i = 0; i < 5; i++) { repeatHit(game); expect(game.bossHealth).toBe(4 - i); }
    expect(game.phase).toBe('won'); expect(game.winReason).toBe('boss'); expect(game.percent).toBeLessThan(100);
    expect(game.boss).toBeUndefined(); expect(game.bossJump).toBeUndefined(); expect(game.hazards).toHaveLength(0);
    const hits = game.events.filter(event => typeof event === 'object' && event.type === 'bossHit');
    expect(hits).toHaveLength(5);
    expect(game.events.filter(event => typeof event === 'object' && event.type === 'defeat')).toHaveLength(1);
    const score = game.score; game.update(10); expect(game.score).toBe(score);
  });
  it('continues existing bullets during a nonfatal boss jump', () => {
    const game = fixture(), shot = new Projectile({ x: 15, y: 5 }, { x: 0, y: 1 }); game.spawnHazard(shot);
    enclose(game); game.update(0.5);
    expect(game.bossHealth).toBe(4); expect(game.hazards).toContain(shot); expect(shot.position.y).toBeCloseTo(5.5);
  });
});

describe('configurable boss testing and jump geometry', () => {
  it('reserves the visible body at landing even though its hit circle fits a smaller pocket', () => {
    const boss = createEnemy('boss', { x: 10, y: 10 });
    const narrow = [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 20 }, { x: 0, y: 20 }]];
    expect(safeLanding({ x: 2, y: 10 }, narrow, boss, [], { x: 0, y: 0 }, [])).toBe(false);
    expect(findLanding(narrow, boss, [], { x: 0, y: 0 }, [], () => 0.5)).toBeNull();
    const game = new Game(), point = findLanding(game.territories, boss, game.enemies, game.player, [], () => 0.5)!;
    expect(point).not.toBeNull();
    expect(Math.min(...edges(game.outline).map(([a, b]) => distance(point, a, b)))).toBeGreaterThanOrEqual(boss.visualRadius + 0.16);
    expect(safeLanding(point, game.territories, boss, game.enemies, game.player, [{ x: point.x - 3, y: point.y + 2 }, { x: point.x + 3, y: point.y + 2 }])).toBe(false);
    expect(safeLanding(point, game.territories, boss, [createEnemy('orbit', { x: point.x + 2.8, y: point.y })], game.player, [])).toBe(false);
  });
  it('supports health and map thresholds without inventing stage effects', () => {
    const created: string[] = [];
    const attack = (name: string) => () => { created.push(name); return { name, warning: 0, update() {} }; };
    const game = fixture({ bossConfig: { phases: [
      { id: '地图阶段', when: { territoryAtLeast: 20 }, createAttack: attack('地图技能') },
      { id: '二阶段', when: { healthAtMost: 3 }, createAttack: attack('二阶段技能') },
      { id: '三阶段', when: { healthAtMost: 1, territoryAtLeast: 20 }, createAttack: attack('三阶段技能') },
    ] } });
    expect(game.bossPhase).toBe('默认'); repeatHit(game); expect(game.bossPhase).toBe('地图阶段');
    repeatHit(game); expect(game.bossPhase).toBe('二阶段');
    repeatHit(game); expect(game.bossPhase).toBe('二阶段');
    repeatHit(game); expect(game.bossPhase).toBe('三阶段'); expect(game.bossAttack!.name).toBe('三阶段技能');
    expect(created).toEqual(['地图技能', '二阶段技能', '三阶段技能']);
  });
  it('can configure one-hit health and disable the boss victory route', () => {
    const game = fixture({ bossConfig: { maxHealth: 1 }, victory: { territoryPercent: 100, defeatBoss: false } });
    enclose(game); expect(game.bossHealth).toBe(0); expect(game.boss).toBeUndefined();
    expect(game.phase).toBe('playing'); expect(game.percent).toBeCloseTo(30);
  });
  it('can test health-only victory independently of an already reached percentage target', () => {
    const game = fixture({ victory: { territoryPercent: 20, territory: false } });
    repeatHit(game); expect(game.percent).toBeGreaterThan(20); expect(game.phase).toBe('playing');
    for (let i = 0; i < 4; i++) repeatHit(game);
    expect(game.phase).toBe('won'); expect(game.winReason).toBe('boss');
    expect(() => fixture({ victory: { territory: false, defeatBoss: false } })).toThrow();
  });
  it('finds safe points across disconnected and concave danger regions', () => {
    const game = fixture();
    const regions = [[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 20 }, { x: 0, y: 20 }],
      [{ x: 4, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 12, y: 20 }, { x: 12, y: 8 }, { x: 4, y: 8 }]];
    const point = findLanding(regions, game.boss!, game.enemies, game.player, [], () => 0.5);
    expect(point).not.toBeNull(); expect(safeLanding(point!, regions, game.boss!, game.enemies, game.player, [])).toBe(true);
  });
  it('expands at the jump apex and returns to original size; reduced motion stays unscaled', () => {
    const jump = { from: { x: 2, y: 3 }, to: { x: 12, y: 13 }, elapsed: 0, duration: 1 };
    expect(jumpPose(jump).scale).toBe(1); jump.elapsed = 0.5;
    expect(jumpPose(jump).scale).toBeCloseTo(1.35); expect(jumpPose(jump).y).toBeLessThan(8);
    expect(jumpPose(jump, true).scale).toBe(1); jump.elapsed = 1;
    expect(jumpPose(jump).scale).toBeCloseTo(1); expect(jumpPose(jump).x).toBe(12);
  });
  it('rejects invalid health, timings, area goals and thresholds', () => {
    expect(() => fixture({ bossConfig: { maxHealth: 0 } })).toThrow();
    expect(() => fixture({ bossConfig: { jumpDuration: 0 } })).toThrow();
    expect(() => fixture({ victory: { territoryPercent: 101 } })).toThrow();
    expect(() => fixture({ bossConfig: { phases: [{ id: 'bad', when: { healthAtMost: 9 } }] } })).toThrow();
  });
});
