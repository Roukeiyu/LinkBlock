import { describe, expect, it } from 'vitest';
import { Game } from './engine';
import { advanceEnemy, createEnemy } from './enemies';
import { area, distance, inside, partitionRegion, wallEdges, type Polygon } from './geometry';
import { openingFraction, openingRectangle, OPENING_SECONDS } from './opening';
import { safeLanding } from './boss';
import { MAX_HAZARDS } from './attacks';

function seeded(seed = 13) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32; }
function openingGame(seed = 13) { return new Game(72, 48, { opening: true, random: seeded(seed) }); }
const hole: Polygon = [{ x: 5, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 16 }, { x: 5, y: 16 }];
function ringGame() {
  const game = new Game(40, 40, { opening: true, boss: null, enemies: [createEnemy('straight', { x: 30, y: 30 }, { x: 0, y: 0 })], random: seeded(), victory: { territoryPercent: 100 } });
  game.start(); game.opening!.region = hole.map(p => ({ ...p })); game.confirmOpening(); return game;
}
function place(game: Game, x: number, y: number) { game.player = { x, y }; game.anchor = { ...game.player }; }

describe('rectangle selection and deferred entry', () => {
  it('has no actors before selection, rotates at 15 Hz and commits exactly the current candidate on confirmation', () => {
    const game = openingGame(); expect(game.enemies).toHaveLength(0); expect(game.boss).toBeUndefined();
    game.start(); expect(game.phase).toBe('opening'); expect(game.opening!.candidates).toBe(1);
    const first = structuredClone(game.opening!.region); game.update(1 / 15 - 0.001);
    expect(game.opening!.region).toEqual(first); game.update(0.001); expect(game.opening!.candidates).toBe(2);
    game.update(1 - 1 / 15); expect(game.opening!.candidates).toBe(16);
    expect(game.enemies).toHaveLength(0); expect(game.boss).toBeUndefined(); expect(game.bossAttack).toBeUndefined();
    expect(game.percent).toBe(0); expect(game.elapsed).toBe(0); game.move('down', true, 10); expect(game.trail).toHaveLength(0);
    const selected = structuredClone(game.opening!.region); expect(game.confirmOpening()).toBe(true);
    expect(game.captured).toEqual([selected]); expect(game.claimed).toBeCloseTo(area(selected), 8);
    expect(game.phase).toBe('playing'); expect(game.enemies).toHaveLength(9); expect(game.boss).toMatchObject({ x: 36, y: 24 });
    expect(game.isBoundary(game.player.x, game.player.y)).toBe(true); expect(game.anchor).toEqual(game.player);
    expect(game.score).toBe(0); expect(game.bossHealth).toBe(5); expect(game.confirmOpening()).toBe(false);
    expect(game.events).toEqual(['start']);
  });
  it('auto-confirms after 5 seconds without using that interval for combat or the game timer', () => {
    const game = openingGame(); game.start(); game.update(4.999);
    expect(game.phase).toBe('opening'); expect(game.opening!.candidates).toBe(75); expect(game.enemies).toHaveLength(0);
    const last = structuredClone(game.opening!.region); game.update(0.001);
    expect(game.phase).toBe('playing'); expect(game.opening!.region).toEqual(last); expect(game.enemies).toHaveLength(9);
    expect(game.elapsed).toBe(0); expect(game.hazards).toHaveLength(0); expect(game.bossAttack!.warning).toBe(0);
    const whole = openingGame(); whole.start(); whole.update(10);
    expect(whole.opening!.candidates).toBe(75); expect(whole.elapsed).toBe(0);
  });
  it('is frame-rate independent, pauses the countdown and reproduces seeds while fresh runs advance randomness', () => {
    const a = openingGame(), b = openingGame(); a.start(); b.start(); a.update(2);
    for (let i = 0; i < 240; i++) b.update(1 / 120);
    expect(a.opening!.region).toEqual(b.opening!.region); expect(a.opening!.candidates).toBe(b.opening!.candidates);
    a.togglePause(); const pending = structuredClone(a.opening); a.update(20); expect(a.opening).toEqual(pending);
    a.togglePause(); expect(a.phase).toBe('opening'); a.update(3); expect(a.phase).toBe('playing');
    const random = seeded(), first = new Game(72, 48, { opening: true, random }), next = new Game(72, 48, { opening: true, random });
    first.start(); next.start(); expect(first.opening!.region).not.toEqual(next.opening!.region);
  });
  it('samples the full area interval with mean near 10% and much rarer large candidates', () => {
    const queue = [0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0]; expect(openingFraction(() => queue.shift() ?? 0)).toBeCloseTo(0.3, 12);
    const low = [0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]; expect(openingFraction(() => low.shift() ?? 0)).toBeCloseTo(0.001, 12);
    const random = seeded(41), values = Array.from({ length: 10000 }, () => openingFraction(random));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0.001); expect(Math.max(...values)).toBeLessThanOrEqual(0.3);
    const mean = values.reduce((a, b) => a + b) / values.length; expect(mean).toBeGreaterThan(0.095); expect(mean).toBeLessThan(0.106);
    expect(values.filter(v => v >= 0.07 && v <= 0.13).length).toBeGreaterThan(4000);
    expect(values.filter(v => v >= 0.25).length).toBeLessThan(100);
  });
  it('keeps rectangles, players and all initial actors legal over 128 seeded confirmations', () => {
    for (let seed = 0; seed < 128; seed++) {
      const game = openingGame(seed); game.start(); game.update((seed % 74) / 15); game.confirmOpening();
      const rectangle = game.captured[0]; expect(game.percent).toBeGreaterThanOrEqual(0.1 - 1e-7); expect(game.percent).toBeLessThanOrEqual(30 + 1e-7);
      expect(game.enemies).toHaveLength(9); expect(game.player.x).toBeGreaterThan(0); expect(game.player.y).toBeGreaterThan(0);
      for (const body of [...game.enemies, game.boss!]) {
        expect(inside(body, rectangle)).toBe(false); expect(inside(body, game.territories[0])).toBe(true);
        expect(Math.min(...wallEdges(game.territories[0]).map(([a, b]) => distance(body, a, b)))).toBeGreaterThanOrEqual(body.visualRadius + 0.16 - 1e-7);
      }
      for (const enemy of game.enemies) expect(Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y)).toBeGreaterThanOrEqual(enemy.visualRadius + 3.34 - 1e-7);
    }
    const maximal = [0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0];
    expect(area(openingRectangle(72, 48, () => maximal.shift() ?? 0.5)!)).toBeCloseTo(72 * 48 * 0.3);
    const small = new Game(6, 6, { opening: true, random: () => 0.5 }); small.start(); expect(small.phase).toBe('playing');
    const highQueue = [0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0];
    const high = new Game(72, 48, { opening: true, random: () => highQueue.shift() ?? 0.5 }); high.start(); high.confirmOpening();
    expect(high.percent).toBeCloseTo(30); expect(high.enemies).toHaveLength(9);
    const quick = new Game(72, 48, { opening: true, random: () => 0.5, victory: { territoryPercent: 5 } }); quick.start(); quick.confirmOpening();
    expect(quick.phase).toBe('won'); expect(quick.winReason).toBe('territory');
  });
});

describe('continuous territory around the starting hole', () => {
  it('has exact area and no invisible bridge wall for walking, enemies or safe landings', () => {
    const game = ringGame(); expect(game.claimed).toBe(56); expect(area(game.territories[0])).toBe(1544);
    expect(game.isBoundary(2, 8)).toBe(false); expect(inside({ x: 2, y: 8 }, game.territories[0])).toBe(true);
    expect(game.isBoundary(5, 12)).toBe(true); expect(inside({ x: 8, y: 12 }, game.territories[0])).toBe(false);
    const enemy = createEnemy('straight', { x: 2.5, y: 7 }, { x: 0, y: 4 });
    for (let i = 0; i < 120; i++) advanceEnemy(enemy, 1 / 120, game.territories, game.territories.map(wallEdges));
    expect(enemy.y).toBeCloseTo(11); expect(enemy.vy).toBe(4);
    expect(safeLanding({ x: 2.5, y: 8 }, game.territories, createEnemy('boss', { x: 2.5, y: 8 }), [], { x: 30, y: 30 }, [])).toBe(true);
  });
  it('claims an inner-to-inner pocket without counting the initial rectangle twice', () => {
    const game = ringGame(); place(game, 8, 8); game.move('up', true, 4); game.move('right', true, 3); game.move('down', true, 4);
    expect(game.claimed).toBe(68); expect(game.lastCapture.map(area)).toEqual([12]); expect(game.territories[0].hole).toBeDefined();
    expect(inside({ x: 9, y: 6 }, game.territories[0])).toBe(false); expect(inside({ x: 9, y: 2 }, game.territories[0])).toBe(true);
  });
  it.each([
    { start: { x: 5, y: 12 }, dir: 'left' as const, length: 5 },
    { start: { x: 12, y: 12 }, dir: 'right' as const, length: 28 },
    { start: { x: 8, y: 8 }, dir: 'up' as const, length: 8 },
    { start: { x: 8, y: 16 }, dir: 'down' as const, length: 24 },
  ])('connects inner and outer loops through $dir without falsely claiming area', ({ start, dir, length }) => {
    const game = ringGame(); place(game, start.x, start.y);
    expect(game.move(dir, true, length)).toBe(true); expect(game.claimed).toBe(56); expect(game.lastCapture).toEqual([]);
    expect(game.territories).toHaveLength(1); expect(game.territories[0].hole).toBeUndefined();
    expect(area(game.territories[0])).toBe(1544); expect(game.events).toContain('partition');
    expect(inside({ x: 8, y: 12 }, game.territories[0])).toBe(false);
  });
  it('draws, retracts and captures from either bank of a completed bridge', () => {
    for (const dir of ['up', 'down'] as const) {
      const game = ringGame(); place(game, 5, 12); game.move('left', true, 5); game.move('right', false, 2.5);
      game.move(dir, true, 3); game.update(1); expect(game.player).toEqual({ x: 2.5, y: 12 }); expect(game.claimed).toBe(56);
      game.move(dir, true, 40); expect(game.claimed).toBe(dir === 'up' ? 86 : 126);
      expect(game.lives).toBe(3); expect(game.trail).toHaveLength(0);
    }
  });
  it('can capture a whole outer pocket containing the original hole without rewarding its area twice', () => {
    const game = ringGame(); game.enemies.push(createEnemy('orbit', { x: 3, y: 30 }, { x: 0, y: 0 })); place(game, 15, 0);
    game.move('down', true, 40); expect(game.claimed).toBe(600); expect(game.lastCapture.map(area)).toEqual([544]);
    expect(game.lastDefeats).toHaveLength(1); expect(game.enemies).toHaveLength(1); expect(game.isBoundary(5, 12)).toBe(false);
  });
  it('handles a concave expanded hole and a later real bridge without leaving the old virtual seam', () => {
    const game = ringGame(); place(game, 5, 10);
    game.move('left', true, 2); game.move('down', true, 10); game.move('right', true, 5); game.move('up', true, 4);
    expect(game.claimed).toBe(88); expect(game.isBoundary(6, 16)).toBe(false); expect(game.isBoundary(3, 15)).toBe(true);
    expect(game.isBoundary(1, 10)).toBe(false); place(game, 3, 15); game.move('left', true, 3);
    game.move('right', false, 1.5); game.move('up', true, 15); expect(game.claimed).toBe(110.5);
  });
  it('damages and relocates a boss enclosed next to the starting hole', () => {
    const game = new Game(40, 40, { opening: true, boss: createEnemy('boss', { x: 20, y: 20 }, { x: 0, y: 0 }), enemies: [createEnemy('orbit', { x: 3, y: 30 }, { x: 0, y: 0 })], random: seeded(), victory: { territoryPercent: 100 } });
    game.start(); game.opening!.region = hole; game.confirmOpening(); place(game, 12, 12);
    game.move('right', true, 18); game.move('down', true, 16); game.move('left', true, 18); game.move('up', true, 12);
    expect(game.claimed).toBe(344); expect(game.bossHealth).toBe(4); expect(game.bossJump?.to).not.toBeNull();
    game.update(1); expect(game.bossJump).toBeUndefined();
    expect(safeLanding(game.boss!, game.territories, game.boss!, game.enemies, game.player, [])).toBe(true); expect(game.lives).toBe(3);
  });
  it('preserves exact coverage when cutting either bank of a slit in all four bridge directions', () => {
    for (const [start, dir, length] of [[{ x: 5, y: 12 }, 'left', 5], [{ x: 12, y: 12 }, 'right', 28], [{ x: 8, y: 8 }, 'up', 8], [{ x: 8, y: 16 }, 'down', 24]] as const) {
      const game = ringGame(); place(game, start.x, start.y); game.move(dir, true, length);
      const region = game.territories[0], mid = { x: (start.x + game.player.x) / 2, y: (start.y + game.player.y) / 2 };
      const ends = dir === 'left' || dir === 'right' ? [{ x: mid.x, y: 0 }, { x: mid.x, y: 40 }] : [{ x: 0, y: mid.y }, { x: 40, y: mid.y }];
      for (const end of ends) {
        const parts = partitionRegion(region, [mid, end]); expect(parts).toHaveLength(2);
        expect(parts.reduce((sum, p) => sum + area(p), 0)).toBeCloseTo(area(region), 8);
        for (let x = 1.1; x < 40; x += 2) for (let y = 1.3; y < 40; y += 2) {
          const p = { x, y }; if (parts.some(part => wallEdges(part).some(([a, b]) => distance(p, a, b) < 1e-7))) continue;
          expect(parts.filter(part => inside(p, part)).length).toBe(Number(inside(p, region)));
        }
      }
    }
  });
  it('sustains final-stage motion around the real hole for two minutes with bounded storage', () => {
    const game = new Game(72, 48, { opening: true, random: seeded(), bossConfig: { phases: [{ id: '压力测试', when: { healthAtMost: 5 }, reinforcements: { targetCount: 15, interval: 4, speed: 8 } }] } });
    game.start(); game.confirmOpening(); game.protection = 1000; const start = performance.now();
    for (let i = 0; i < 7200; i++) {
      game.update(1 / 60); expect(game.enemies.length).toBeLessThanOrEqual(15); expect(game.hazards.length).toBeLessThanOrEqual(MAX_HAZARDS);
      if (i % 60 === 0) for (const body of [...game.enemies, game.boss!]) {
        expect(inside(body, game.territories[0])).toBe(true); expect(inside(body, game.captured[0])).toBe(false);
        expect(body.trace.length).toBeLessThanOrEqual(18);
      }
      game.events = [];
    }
    expect(game.enemies).toHaveLength(15); expect(performance.now() - start).toBeLessThan(6000);
  });
});
