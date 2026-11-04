import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

type Probe = { player: { x: number; y: number }; positions: { x: number; y: number; time: number }[]; white: number; particles: number; flash: string; boundary: { x: number; y: number }[]; trail: { x: number; y: number }[]; shots: { x: number; y: number }[]; enemyColors: string[]; enemyBodies: { x: number; y: number; color: string; angle: number }[]; bossRadius: number; warningFrame: string; warningShots: number; defeatFrame: string; awards: { text: string; color: string }[]; jumpScales: number[]; jumpShadows: number };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { probe: Probe }).probe);
async function hold(page: Page, key: string, duration: number) {
  await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key);
}
async function firstCut(page: Page) {
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await probe(page)).player.y, { timeout: 6000, intervals: [16] }).toBe(48);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('Space');
}
async function encloseRoster(page: Page) {
  // A slightly off-centre cut claims the populated smaller side, including Boss.
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 30 && (await probe(page)).player.x < 40; i++) await page.clock.runFor(16);
  await page.keyboard.up('ArrowRight'); expect((await probe(page)).player.x).toBeGreaterThanOrEqual(40);
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown');
  for (let i = 0; i < 60 && (await probe(page)).player.y < 48; i++) await page.clock.runFor(100);
  expect((await probe(page)).player.y).toBe(48);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('Space'); await page.clock.runFor(250);
}
test.beforeEach(async ({ page }, info) => {
  const randomOpening = info.title.includes('random opening');
  if (randomOpening && info.title.includes('phone')) await page.setViewportSize({ width: 390, height: 844 });
  const phasePreview = /configured phase ([23])/.exec(info.title)?.[1];
  const controlled = randomOpening || info.title.includes('boss damage jump') || info.title.includes('enclosing a normal') || Boolean(phasePreview);
  if (!randomOpening) {
    // Fixed scene fixtures keep input/capture/effect regressions independent of
    // random hazards. Dedicated opening tests below use the unchanged real app.
    await page.route('**/src/engine.ts', async route => {
      const response = await route.fetch();
      let body = (await response.text())
        .replace('options.opening ?? false', 'false').replace('if (this.options.opening)', 'if (false)')
        .replace('defaultBoss(this.width, this.height)', "createEnemy('boss', { x: this.width * 0.84, y: this.height * 0.76 })")
        .replace('defaultEnemies(this.width, this.height, this.boss, this.random,', 'fixtureEnemies(this.width, this.height, this.boss, this.random,');
      body += "\nfunction fixtureEnemies(width, height) { return ['straight', 'orbit', 'zigzag'].flatMap((kind, row) => [0.58, 0.73, 0.88].map(x => createEnemy(kind, { x: width*x, y: height*[0.25,0.51,0.76][row] }))); }";
      if (phasePreview) body = body.replace(/this\.bossHealth = this\.bossMaxHealth/g, `this.bossHealth = ${phasePreview === '2' ? 3 : 1}`);
      await route.fulfill({ response, body });
    });
  }
  if (controlled) await page.clock.install({ time: new Date('2026-11-03T00:00:00Z') });
  // Observe the real canvas drawing commands without adding debug APIs to the app.
  await page.addInitScript(() => {
    const state = { player: { x: 0, y: 0 }, positions: [] as { x: number; y: number; time: number }[], white: 0, particles: 0, flash: '', boundary: [] as { x: number; y: number }[], trail: [] as { x: number; y: number }[], shots: [] as { x: number; y: number }[], enemyColors: [] as string[], enemyBodies: [] as { x: number; y: number; color: string; angle: number }[], bossRadius: 0, warningFrame: '', warningShots: -1, defeatFrame: '', awards: [] as { text: string; color: string }[], jumpScales: [] as number[], jumpShadows: 0 };
    (window as unknown as { probe: typeof state }).probe = state;
    const paths = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }[]>();
    const translations = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }>();
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'clearRect', 'translate'] as const) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function(this: CanvasRenderingContext2D, ...args: number[]) {
        if (method === 'clearRect' && this.canvas.id === 'board') { state.trail = []; state.shots = []; state.enemyColors = []; state.enemyBodies = []; state.jumpScales = []; state.jumpShadows = 0; }
        if (method === 'translate') translations.set(this, { x: args[0], y: args[1] });
        if (method === 'beginPath') paths.set(this, []);
        if (method === 'moveTo' || method === 'lineTo') paths.get(this)?.push({ x: args[0], y: args[1] });
        if (method === 'stroke' && this.strokeStyle === '#ffcf75') state.trail = [...(paths.get(this) ?? [])];
        if (method === 'stroke' && this.strokeStyle === '#79edc9') state.boundary = [...(paths.get(this) ?? [])];
        if (method === 'stroke' && this.strokeStyle === '#ffa56e' && paths.get(this)?.length === 6) state.bossRadius = Math.max(...paths.get(this)!.map(p => Math.hypot(p.x, p.y)));
        return Reflect.apply(original, this, args);
      } as never;
    }
    let warningScheduled = false;
    const scale = CanvasRenderingContext2D.prototype.scale;
    CanvasRenderingContext2D.prototype.scale = function(x, y) {
      if (x > 1 && x < 1.4 && x === y) state.jumpScales.push(x);
      return scale.call(this, x, y);
    };
    const ellipse = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function(...args: Parameters<typeof ellipse>) {
      if (args[2] === 2.28 && args[3] === 0.82 && this.fillStyle === '#000000') state.jumpShadows++;
      return ellipse.apply(this, args);
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(...args: Parameters<typeof fillText>) {
      if (/^\+\d+$/.test(args[0])) {
        state.awards.push({ text: args[0], color: String(this.fillStyle) });
        if (!state.defeatFrame && this.globalAlpha < 0.85 && this.globalAlpha > 0.6) queueMicrotask(() => { state.defeatFrame = this.canvas.toDataURL(); });
      }
      return fillText.apply(this, args);
    };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function(...args: Parameters<typeof arc>) {
      if (args[2] === 3.06 && this.strokeStyle === '#ffe0c6' && args[4] - args[3] >= Math.PI && !warningScheduled) {
        warningScheduled = true;
        queueMicrotask(() => { state.warningFrame = this.canvas.toDataURL(); state.warningShots = state.shots.length; });
      }
      if (args[2] === 0.22) state.shots.push({ x: args[0], y: args[1] });
      if (args[2] === 0.14) { state.player = { x: args[0], y: args[1] }; state.positions.push({ ...state.player, time: performance.now() }); }
      return arc.apply(this, args);
    };
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function(...args: unknown[]) {
      if (['#ff727d', '#bda4ff', '#72cfff', '#ffa56e'].includes(String(this.fillStyle))) {
        const color = String(this.fillStyle), p = translations.get(this), transform = this.getTransform();
        state.enemyColors.push(color);
        if (p) state.enemyBodies.push({ ...p, color, angle: Math.atan2(transform.b, transform.a) });
      }
      if (this.fillStyle === '#ffffff') {
        state.white++;
        if (state.white === 1) queueMicrotask(() => { state.flash = this.canvas.toDataURL(); });
      }
      if (this.fillStyle === '#d9fff1') state.particles++;
      return Reflect.apply(fill, this, args);
    };
  });
  await page.goto('/');
  // Always pause in the future: slow module loading must not rewind the clock
  // behind the app's initial performance.now() and drop simulated frames.
  if (controlled) await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.getByRole('button', { name: '开始探索' }).click();
});

for (const viewport of ['desktop', 'phone']) test(`random opening has varied safe spawns, a centered boss and fresh restart/reload on ${viewport}`, async ({ page }) => {
  const choose = async (single = false) => {
    await page.clock.runFor(16); await expect(page.locator('#opening-hint')).toBeVisible();
    expect((await probe(page)).enemyBodies).toHaveLength(0); expect((await probe(page)).shots).toHaveLength(0);
    const initial = (await probe(page)).trail; expect(initial).toHaveLength(4);
    let rectangle = initial;
    for (let i = 0; i < 20 && JSON.stringify(rectangle) === JSON.stringify(initial); i++) {
      await page.clock.runFor(50); rectangle = (await probe(page)).trail;
    }
    expect(rectangle).not.toEqual(initial);
    if (viewport === 'phone') {
      if (single) { await page.locator('#control-mode').click(); await page.locator('#control-mode').click(); }
      const button = page.locator(single ? '#joystick' : '#touch-draw');
      await expect(button).toHaveAttribute('aria-label', '确认起点');
      const box = (await button.boundingBox())!, session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
    } else await page.keyboard.press('Space');
    await expect(page.locator('#opening-hint')).toBeHidden(); await expect(page.locator('#state-label')).toHaveText('探索中');
    const percent = Math.abs((rectangle[1].x - rectangle[0].x) * (rectangle[3].y - rectangle[0].y)) / (72 * 48) * 100;
    expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(percent, 7);
    const player = (await probe(page)).player;
    expect(player.x).toBeGreaterThan(0); expect(player.y).toBeGreaterThan(0);
    const onEdge = rectangle.some((a, i) => {
      const b = rectangle[(i + 1) % 4];
      return Math.min(a.x, b.x) - 1e-7 <= player.x && player.x <= Math.max(a.x, b.x) + 1e-7
        && Math.min(a.y, b.y) - 1e-7 <= player.y && player.y <= Math.max(a.y, b.y) + 1e-7;
    }); expect(onEdge).toBe(true); expect((await probe(page)).trail).toHaveLength(0);
    return rectangle;
  };
  const verify = async () => {
    const state = await probe(page), bodies = state.enemyBodies;
    expect(bodies).toHaveLength(10);
    const boss = bodies.find(body => body.color === '#ffa56e')!;
    expect({ x: boss.x, y: boss.y }).toEqual({ x: 36, y: 24 });
    const radii: Record<string, number> = { '#ff727d': 0.85, '#bda4ff': 0.67, '#72cfff': 0.78, '#ffa56e': 2 };
    for (const color of ['#ff727d', '#bda4ff', '#72cfff']) expect(bodies.filter(body => body.color === color)).toHaveLength(3);
    for (const body of bodies.filter(body => body !== boss)) {
      const r = radii[body.color];
      expect(Math.min(body.x, 72 - body.x, body.y, 48 - body.y)).toBeGreaterThanOrEqual(r + 0.16 - 1e-7);
      expect(Math.hypot(body.x - state.player.x, body.y - state.player.y)).toBeGreaterThanOrEqual(r + 3.34 - 1e-7);
      for (const other of bodies.filter(other => other !== body)) expect(Math.hypot(body.x - other.x, body.y - other.y)).toBeGreaterThanOrEqual(r + radii[other.color] + 0.25 - 1e-7);
    }
    const arrows = bodies.filter(body => body.color === '#ff727d');
    for (let i = 0; i < arrows.length; i++) for (let j = i + 1; j < arrows.length; j++) {
      expect(Math.acos(Math.cos(arrows[i].angle - arrows[j].angle))).toBeGreaterThanOrEqual(Math.PI / 3 - 1e-7);
    }
    return bodies.filter(body => body !== boss).map(body => [body.x, body.y, body.angle]);
  };
  const startingRectangle = await choose();
  const first = await verify();
  await page.screenshot({ path: `test-results/random-opening-${viewport}.png`, fullPage: true });
  const anchor = (await probe(page)).player, progress = await page.locator('#percent').textContent();
  const outward = Math.abs(anchor.y - startingRectangle[0].y) < 1e-7 ? 'ArrowUp' : Math.abs(anchor.y - startingRectangle[3].y) < 1e-7 ? 'ArrowDown' : Math.abs(anchor.x - startingRectangle[0].x) < 1e-7 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down('Space'); await page.keyboard.down(outward); await page.clock.runFor(40); await page.keyboard.up(outward);
  expect((await probe(page)).trail.length).toBeGreaterThan(1); expect((await probe(page)).player).not.toEqual(anchor);
  await page.keyboard.up('Space'); await page.clock.runFor(100);
  expect((await probe(page)).player).toEqual(anchor); expect((await probe(page)).trail).toHaveLength(0);
  await expect(page.locator('#percent')).toHaveText(progress!); await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.keyboard.press('KeyR'); await choose(viewport === 'phone');
  const restart = await verify(); expect(restart).not.toEqual(first);
  await expect(page.locator('#score')).toHaveText('000000'); await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', '5');
  await page.goto('/'); await page.clock.runFor(16); expect((await probe(page)).enemyBodies).toHaveLength(0);
  await page.getByRole('button', { name: '开始探索' }).click(); await choose();
  const reloaded = await verify(); expect(reloaded).not.toEqual(restart); expect(reloaded).not.toEqual(first);
});

test('random opening selection pauses, stays empty and auto-confirms the final rectangle at five seconds', async ({ page }) => {
  await page.locator('#sound').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('#state-label')).toHaveText('选择起点');
  await page.locator('#board').focus();
  await page.clock.runFor(1000); expect((await probe(page)).enemyBodies).toHaveLength(0);
  await page.keyboard.press('KeyP'); await page.clock.runFor(10000); await expect(page.locator('#state-label')).toHaveText('已暂停');
  expect((await probe(page)).enemyBodies).toHaveLength(0); await page.getByRole('button', { name: '继续探索' }).click();
  await page.clock.runFor(3950); await expect(page.locator('#state-label')).toHaveText('选择起点');
  const rectangle = (await probe(page)).trail;
  await page.screenshot({ path: 'test-results/opening-selection.png', fullPage: true });
  expect((await probe(page)).enemyBodies).toHaveLength(0); await page.clock.runFor(80);
  await expect(page.locator('#state-label')).toHaveText('探索中'); expect((await probe(page)).enemyBodies).toHaveLength(10);
  const percent = Math.abs((rectangle[1].x - rectangle[0].x) * (rectangle[3].y - rectangle[0].y)) / (72 * 48) * 100;
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(percent, 7);
  await expect(page.locator('#elapsed')).toHaveText('00:00'); expect((await probe(page)).shots).toHaveLength(0);
});

test('continuous movement stays on the drawn edge and turns between arbitrary coordinates', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await hold(page, 'ArrowRight', 137);
  const start = (await probe(page)).player;
  expect(start.x).toBeGreaterThan(36); expect(start.y).toBe(0);
  await page.keyboard.down('Space'); await hold(page, 'ArrowDown', 173);
  const turn = (await probe(page)).player;
  expect(turn.x).toBeCloseTo(start.x, 7); expect(turn.y).toBeGreaterThan(0);
  await hold(page, 'ArrowLeft', 143);
  const end = (await probe(page)).player;
  expect(end.x).toBeLessThan(turn.x); expect(end.y).toBeCloseTo(turn.y, 7);
  const samples = (await probe(page)).positions.filter(p => p.y > 0 && p.x === start.x);
  expect(new Set(samples.map(p => p.y)).size).toBeGreaterThan(5);
  expect(samples.some(p => Math.abs(p.y - Math.round(p.y)) > 0.05)).toBe(true);
  await page.waitForTimeout(100); expect((await probe(page)).player).toEqual(end);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await probe(page)).player).toEqual(start);
  expect((await probe(page)).trail).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('Space release retracts a bent trail, ignores new input until the anchor and allows a fresh cut', async ({ page }) => {
  await page.keyboard.down('Space');
  await hold(page, 'ArrowDown', 450); await hold(page, 'ArrowLeft', 350); await hold(page, 'ArrowDown', 350);
  const before = await probe(page), start = before.trail[0];
  expect(before.trail).toHaveLength(4);
  const releasedAt = await page.evaluate(() => performance.now());
  await page.keyboard.up('Space'); await page.keyboard.down('Space'); await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(60);
  const during = await probe(page);
  expect(during.player.x).toBeCloseTo(before.player.x, 7);
  expect(during.player.y).toBeLessThan(before.player.y);
  expect(during.trail.at(-1)).toEqual(during.player);
  await page.locator('#board').screenshot({ path: 'test-results/retracting-trail.png' });
  await expect.poll(async () => (await probe(page)).player, { intervals: [16] }).toEqual(start);
  const returned = await probe(page);
  expect(returned.trail).toHaveLength(0);
  // Every sampled point lies on the original polyline; the tip never takes a shortcut.
  const samples = returned.positions.filter(p => p.time > releasedAt);
  expect(samples.some(p => Math.abs(p.x - before.player.x) < 1e-7 && p.y < before.player.y - 0.2)).toBe(true);
  expect(samples.some(p => p.x > before.player.x + 0.2 && p.x < start.x - 0.2)).toBe(true);
  for (const p of samples) {
    const onFirst = Math.abs(p.x - start.x) < 1e-7 && p.y >= 0 && p.y <= before.trail[1].y;
    const onSecond = Math.abs(p.y - before.trail[1].y) < 1e-7 && p.x >= before.player.x && p.x <= start.x;
    const onThird = Math.abs(p.x - before.player.x) < 1e-7 && p.y >= before.trail[1].y && p.y <= before.player.y;
    expect(onFirst || onSecond || onThird).toBe(true);
  }
  await page.waitForTimeout(100); expect((await probe(page)).player).toEqual(start);
  await expect(page.locator('#percent')).toHaveText('0.0%'); await expect(page.locator('#score')).toHaveText('000000');
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space');
  await page.keyboard.down('Space'); await hold(page, 'ArrowDown', 100);
  expect((await probe(page)).player.y).toBeGreaterThan(0); await page.keyboard.up('Space');
});

async function touchController(page: Page) {
  const direction = await page.getByRole('button', { name: '向下' }).boundingBox();
  const draw = await page.locator('#touch-draw').boundingBox();
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const points = [direction!, draw!].map((box, i) => ({ id: i + 1, x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 4, radiusY: 4, force: 1 }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  return session;
}

for (const swapped of [false, true]) {
  test(`a held mobile direction slides through all buttons and stops outside, swapped=${swapped}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    if (swapped) await page.locator('#control-mode').click();
    const center = async (selector: string) => {
      const box = await page.locator(selector).boundingBox();
      return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    };
    const draw = await center('#touch-draw');
    const session = await touchController(page);
    const moveTo = async (position: { x: number; y: number }) => session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ id: 1, ...position, radiusX: 4, radiusY: 4, force: 1 }, { id: 2, ...draw, radiusX: 4, radiusY: 4, force: 1 }],
    });
    await page.waitForTimeout(300); const down = (await probe(page)).player;
    expect(down.y).toBeGreaterThan(0);
    for (const direction of ['right', 'up', 'left'] as const) {
      await moveTo(await center(`[data-dir="${direction}"]`));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const before = (await probe(page)).player; await page.waitForTimeout(100);
      await expect(page.locator(`[data-dir="${direction}"]`)).toHaveClass(/is-held/);
      await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true');
      const after = (await probe(page)).player;
      if (direction === 'right') { expect(after.x).toBeGreaterThan(before.x); expect(after.y).toBeCloseTo(before.y, 7); }
      if (direction === 'up') { expect(after.y).toBeLessThan(before.y); expect(after.x).toBeCloseTo(before.x, 7); }
      if (direction === 'left') { expect(after.x).toBeLessThan(before.x); expect(after.y).toBeCloseTo(before.y, 7); }
    }
    // Pointer capture remains on the pad, but coordinates over the board stop it.
    await moveTo(await center('#board')); await page.waitForTimeout(40);
    const stopped = (await probe(page)).player; await page.waitForTimeout(100);
    expect((await probe(page)).player).toEqual(stopped);
    await expect(page.locator('.dpad .is-held')).toHaveCount(0);
    await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true');
    await moveTo(await center('[data-dir="down"]')); await page.waitForTimeout(60);
    expect((await probe(page)).player.y).toBeGreaterThan(stopped.y);
    await page.screenshot({ path: `test-results/dpad-slide${swapped ? '-swapped' : ''}.png`, fullPage: true });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
    await expect(page.locator('.dpad .is-held')).toHaveCount(0);
    await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'false');
    await session.detach(); expect(errors).toEqual([]);
  });
}

for (const swapped of [false, true]) {
  test(`expanded circular d-pad sectors accept touches beyond the visible buttons, swapped=${swapped}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); if (swapped) await page.locator('#control-mode').click();
    const pad = await page.locator('.dpad').boundingBox(), draw = await page.locator('#touch-draw').boundingBox();
    const cx = pad!.x + pad!.width / 2, cy = pad!.y + pad!.height / 2;
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const points = (dx: number, dy: number) => [{ id: 1, x: cx + dx, y: cy + dy, radiusX: 4, radiusY: 4, force: 1 }, { id: 2, x: draw!.x + draw!.width / 2, y: draw!.y + draw!.height / 2, radiusX: 4, radiusY: 4, force: 1 }];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(80, 0) });
    await expect(page.locator('[data-dir="right"]')).toHaveClass(/is-held/); await page.waitForTimeout(100);
    expect((await probe(page)).player.x).toBeGreaterThan(36);
    for (const step of [{ dir: 'down', dx: 15, dy: 80, ms: 250 }, { dir: 'left', dx: -72, dy: 30, ms: 80 }, { dir: 'up', dx: -15, dy: -80, ms: 100 }]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(step.dx, step.dy) });
      await expect(page.locator(`[data-dir="${step.dir}"]`)).toHaveClass(/is-held/);
      await page.waitForTimeout(step.ms);
    }
    const anchor = (await probe(page)).trail[0]; expect(anchor).toBeDefined();
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(2, 2) });
    await page.waitForTimeout(40); const stopped = (await probe(page)).player;
    await page.waitForTimeout(80); expect((await probe(page)).player).toEqual(stopped);
    await expect(page.locator('.dpad .is-held')).toHaveCount(0);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(120, 0) });
    await page.waitForTimeout(80); expect((await probe(page)).player).toEqual(stopped);
    await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await probe(page)).player).toEqual(anchor);
    await session.detach();
  });
}

async function singleHand(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#control-mode').click(); await page.locator('#control-mode').click();
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'one-hand');
  await expect(page.locator('.dpad-side')).toBeHidden(); await expect(page.locator('.draw-side')).toBeHidden();
  await expect(page.locator('#joystick')).toBeVisible();
}
async function touchJoystick(page: Page) {
  const box = await page.locator('#joystick').boundingBox(), x = box!.x + box!.width / 2, y = box!.y + box!.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const point = (dx = 0, dy = 0) => ({ id: 1, x: x + dx, y: y + dy, radiusX: 4, radiusY: 4, force: 1 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point()] });
  return { session, move: (dx: number, dy: number) => session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(dx, dy)] }) };
}

test('one-handed joystick draws while held, turns continuously, clamps the knob and retracts on release', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await singleHand(page);
  const { session, move } = await touchJoystick(page);
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(100); expect((await probe(page)).player).toEqual({ x: 36, y: 0 });
  await move(0, 45); await page.waitForTimeout(300); const down = (await probe(page)).player;
  expect(down.y).toBeGreaterThan(0); expect((await probe(page)).trail.length).toBeGreaterThan(1);
  await move(120, 10); await page.waitForTimeout(120); const right = (await probe(page)).player;
  expect(right.x).toBeGreaterThan(down.x);
  const knob = await page.locator('#joystick').evaluate(element => Number.parseFloat((element as HTMLElement).style.getPropertyValue('--stick-x')));
  expect(knob).toBeGreaterThan(0); expect(knob).toBeLessThan(60);
  await move(0, -45); await page.waitForTimeout(100); const up = (await probe(page)).player; expect(up.y).toBeLessThan(right.y);
  await move(2, 2); await page.waitForTimeout(40); const stopped = (await probe(page)).player;
  await page.waitForTimeout(100); expect((await probe(page)).player).toEqual(stopped);
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  await move(-45, 0); await page.waitForTimeout(70); expect((await probe(page)).player.x).toBeLessThan(stopped.x);
  await page.screenshot({ path: 'test-results/single-hand-joystick.png', fullPage: true });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false'); expect((await probe(page)).trail).toHaveLength(0);
  expect(await page.locator('#joystick').evaluate(element => (element as HTMLElement).style.getPropertyValue('--stick-x'))).toBe('');
  await session.detach(); expect(errors).toEqual([]);
});

test('mode switching, touch cancellation and wide layout discard active joystick input', async ({ page }) => {
  await singleHand(page); const first = await touchJoystick(page);
  await first.move(0, 45); await page.waitForTimeout(200); expect((await probe(page)).player.y).toBeGreaterThan(0);
  await page.locator('#control-mode').click();
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'two-left'); await expect(page.locator('#joystick')).toBeHidden();
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await first.move(45, 0); await page.waitForTimeout(100); expect((await probe(page)).player).toEqual({ x: 36, y: 0 });
  await first.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await first.session.detach();
  await singleHand(page); const cancelled = await touchJoystick(page); await cancelled.move(0, 45); await page.waitForTimeout(200);
  await cancelled.session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false'); await cancelled.session.detach();
  const wide = await touchJoystick(page); await wide.move(0, 45); await page.waitForTimeout(200);
  await page.setViewportSize({ width: 1000, height: 800 }); await expect(page.locator('.touch-controls')).toBeHidden();
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await wide.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wide.session.detach();
  await page.setViewportSize({ width: 320, height: 568 }); await expect(page.locator('#joystick')).toBeVisible();
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/single-hand-small.png', fullPage: true });
});

test('single-hand control retains a keyboard equivalent and clears on restart', async ({ page }) => {
  await singleHand(page); await page.locator('#joystick').focus();
  await page.keyboard.down('Space'); await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  await hold(page, 'ArrowDown', 200); expect((await probe(page)).player.y).toBeGreaterThan(0);
  await page.keyboard.up('Space'); await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#joystick').focus(); await page.keyboard.down('Space'); await hold(page, 'ArrowDown', 120);
  await page.keyboard.press('Tab'); await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.up('Space'); await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  const finger = await touchJoystick(page); await finger.move(0, 45); await page.waitForTimeout(200);
  await page.keyboard.press('KeyR'); await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'one-hand');
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false');
  await finger.move(45, 0); await page.waitForTimeout(100); expect((await probe(page)).player).toEqual({ x: 36, y: 0 });
  await finger.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await finger.session.detach();
});

test('long press cannot select game text or open menus, while controls remain focusable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const box = await page.locator('#percent').boundingBox();
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, radiusX: 4, radiusY: 4, force: 1 }] });
  await page.waitForTimeout(700); await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  const behavior = await page.evaluate(() => {
    const cancelled = (selector: string, type: string) => !document.querySelector(selector)!.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    return {
      menu: ['#board', '[data-dir="down"]', '#touch-draw'].map(selector => cancelled(selector, 'contextmenu')),
      selection: cancelled('#percent', 'selectstart'),
      outsideMenu: cancelled('h1', 'contextmenu'), outsideSelection: cancelled('h1', 'selectstart'),
      userSelect: ['#board', '#percent', '[data-dir="down"]', '#touch-draw'].map(selector => getComputedStyle(document.querySelector(selector)!).userSelect),
    };
  });
  expect(behavior.menu).toEqual([true, true, true]); expect(behavior.selection).toBe(true);
  expect(behavior.outsideMenu).toBe(false); expect(behavior.outsideSelection).toBe(false);
  expect(behavior.userSelect).toEqual(['none', 'none', 'none', 'none']);
  await page.getByRole('button', { name: '向下' }).focus(); await expect(page.getByRole('button', { name: '向下' })).toBeFocused();
  await session.detach();
});

test('mobile held draw and direction support simultaneous touches, release and cancellation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await touchController(page);
  await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(350); expect((await probe(page)).player.y).toBeGreaterThan(0);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'false');
  expect((await probe(page)).trail).toHaveLength(0);
  await session.detach();
  const cancelled = await touchController(page); await page.waitForTimeout(250);
  await cancelled.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'false'); await cancelled.detach();
});

test('enclosing a normal enemy removes its body, awards points and plays matching fireworks', async ({ page }) => {
  await encloseRoster(page);
  await expect(page.locator('[data-kind="zigzag"]')).toHaveClass(/defeated/, { timeout: 4000 });
  await expect(page.locator('#toast')).toContainText('+4500');
  await expect.poll(async () => (await probe(page)).awards.some(award => award.text === '+500' && award.color === '#72cfff')).toBe(true);
  expect((await probe(page)).enemyColors).not.toContain('#72cfff');
  await expect.poll(async () => (await probe(page)).defeatFrame.length).toBeGreaterThan(0);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/enemy-defeat.png', Buffer.from((await probe(page)).defeatFrame.split(',')[1], 'base64'));
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeGreaterThan(40);
});

test('boss damage jump shows four health bars, landing shadow and scaling before returning to normal', async ({ page }) => {
  await encloseRoster(page);
  await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', '4');
  await expect(page.locator('#boss-hearts .filled')).toHaveCount(4);
  await expect(page.locator('#boss-status')).toHaveText('跃迁中');
  expect((await probe(page)).jumpShadows).toBeGreaterThan(0);
  expect((await probe(page)).jumpScales.some(scale => scale > 1.1)).toBe(true);
  await page.locator('#board').screenshot({ path: 'test-results/boss-jump.png' });
  await page.screenshot({ path: 'test-results/boss-health-desktop.png', fullPage: true });
  await page.keyboard.press('KeyP'); const paused = await probe(page); await page.clock.runFor(500);
  expect((await probe(page)).jumpScales).toEqual(paused.jumpScales);
  await page.getByRole('button', { name: '继续探索' }).click(); await page.clock.runFor(1200);
  await expect(page.locator('#boss-status')).not.toHaveText('跃迁中');
  await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', '4');
  expect((await probe(page)).jumpScales).toHaveLength(0);
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
});

test('closure flashes only the captured region white, dissolves and keeps player centered on its edge', async ({ page }) => {
  await firstCut(page);
  await expect.poll(async () => (await probe(page)).white).toBeGreaterThan(0);
  const flash = (await probe(page)).flash;
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/capture-white.png', Buffer.from(flash.split(',')[1], 'base64'));
  const flashPixels = await page.evaluate(async data => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 864; canvas.height = 576;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const at = (x: number) => [...ctx.getImageData(x, 150, 1, 1).data].slice(0, 3);
    return { captured: at(394), danger: at(470) };
  }, flash);
  expect(Math.min(...flashPixels.captured)).toBeGreaterThan(230);
  expect(flashPixels.danger).toEqual([14, 32, 43]);
  await expect.poll(async () => (await probe(page)).particles).toBeGreaterThan(0);
  await expect(page.locator('#percent')).toHaveText('50.0%');
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.locator('#board').screenshot({ path: 'test-results/capture-dissolve.png' });
  const before = (await probe(page)).player;
  await hold(page, 'ArrowLeft', 120);
  expect((await probe(page)).player).toEqual(before);
  await page.keyboard.down('Space'); await hold(page, 'ArrowLeft', 120); await page.keyboard.up('Space');
  expect((await probe(page)).player).toEqual(before); expect((await probe(page)).trail).toHaveLength(0);
  await hold(page, 'ArrowUp', 280);
  const edge = (await probe(page)).player;
  expect(edge.x).toBe(36); expect(edge.y).toBeLessThan(before.y);
  await hold(page, 'ArrowLeft', 100);
  expect((await probe(page)).player).toEqual(edge);
  await page.keyboard.down('Space'); await hold(page, 'ArrowLeft', 100); await page.keyboard.up('Space');
  expect((await probe(page)).player).toEqual(edge);
  // A pixel on the line above the player is mint; equal distances on each side
  // lie in the revealed landscape and dark field respectively.
  const pixels = await page.locator('#board').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    return { line: at(432, 480), danger: at(470, 480), revealed: at(394, 480) };
  });
  expect(pixels.line[1]).toBeGreaterThan(pixels.danger[1] + 80);
  expect(pixels.danger).toEqual([14, 32, 43]);
  expect(pixels.revealed).not.toEqual(pixels.danger);
  await page.waitForTimeout(1300); const settled = await probe(page);
  await page.waitForTimeout(120); const later = await probe(page);
  expect(later.particles).toBe(settled.particles); expect(later.white).toBe(settled.white);
  const edges = await page.locator('#board').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!, s = Math.min((canvas.width - 24) / 72, (canvas.height - 24) / 48);
    const at = (x: number, y: number) => [...ctx.getImageData(Math.round((canvas.width - 72 * s) / 2 + x * s), Math.round((canvas.height - 48 * s) / 2 + y * s), 1, 1).data].slice(0, 3);
    return { removed: [at(10, 0), at(0, 24), at(10, 48)], retained: [at(60, 0), at(72, 24), at(60, 48), at(36, 12)] };
  });
  for (const pixel of edges.removed) expect(pixel[1]).toBeLessThan(150);
  for (const pixel of edges.retained) expect(pixel[1]).toBeGreaterThan(180);
  await page.locator('#board').screenshot({ path: 'test-results/obsolete-edges-removed.png' });
  await page.locator('#board').screenshot({ path: 'test-results/continuous-edge.png' });
});

test('pause, sound, restart and background pause', async ({ page }) => {
  await firstCut(page);
  await page.keyboard.press('KeyP'); await expect(page.getByRole('heading', { name: '风景会等你。' })).toBeVisible();
  const time = await page.locator('#elapsed').textContent(), position = (await probe(page)).player;
  await page.waitForTimeout(1100);
  await expect(page.locator('#elapsed')).toHaveText(time!); expect((await probe(page)).player).toEqual(position);
  await page.getByRole('button', { name: '继续探索' }).click();
  await page.getByRole('button', { name: '音效关闭' }).click();
  await expect(page.getByRole('button', { name: '音效开启' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyR'); await expect(page.locator('#percent')).toHaveText('0.0%');
  await expect(page.locator('#score')).toHaveText('000000');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#state-label')).toHaveText('已暂停');
});

test('nine ordinary enemies and a larger boss, warning and eight-way shots survive pause and reset on restart', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.enemy-entry')).toHaveCount(4);
  await expect.poll(async () => new Set((await probe(page)).enemyColors).size).toBe(4);
  const checkRoster = async () => {
    const colors = (await probe(page)).enemyColors;
    expect((await probe(page)).bossRadius).toBeCloseTo(2);
    for (const color of ['#ff727d', '#bda4ff', '#72cfff']) expect(colors.filter(c => c === color)).toHaveLength(3);
    expect(colors.filter(c => c === '#ffa56e')).toHaveLength(1);
    for (const kind of ['straight', 'orbit', 'zigzag']) await expect(page.locator(`[data-kind="${kind}"] em`)).toContainText('×3');
  };
  await checkRoster();
  await firstCut(page);
  await expect.poll(async () => page.locator('#boss-status').textContent(), { timeout: 6000, intervals: [50] }).toBe('即将释放');
  await expect.poll(async () => (await probe(page)).warningFrame.length, { timeout: 2000, intervals: [50] }).toBeGreaterThan(0);
  const warned = await probe(page); expect(warned.warningShots).toBe(0);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/boss-warning.png', Buffer.from(warned.warningFrame.split(',')[1], 'base64'));
  await expect.poll(async () => (await probe(page)).shots.length, { intervals: [16], timeout: 2000 }).toBe(8);
  const shots = (await probe(page)).shots;
  const center = shots.reduce((sum, p) => ({ x: sum.x + p.x / 8, y: sum.y + p.y / 8 }), { x: 0, y: 0 });
  const headings = shots.map(p => Math.atan2(p.y - center.y, p.x - center.x));
  for (let i = 1; i < headings.length; i++) {
    const delta = (headings[i] - headings[i - 1] + Math.PI * 2) % (Math.PI * 2);
    expect(delta).toBeCloseTo(Math.PI / 4, 4);
  }
  await page.locator('#board').screenshot({ path: 'test-results/eight-way-shots.png' });
  await page.screenshot({ path: 'test-results/enemies-desktop.png', fullPage: true });
  await page.keyboard.press('KeyP'); await expect(page.locator('#state-label')).toHaveText('已暂停');
  const paused = (await probe(page)).shots; await page.waitForTimeout(200);
  expect((await probe(page)).shots).toEqual(paused);
  await page.getByRole('button', { name: '继续探索' }).click();
  await expect.poll(async () => (await probe(page)).shots).not.toEqual(paused);
  await page.keyboard.press('KeyR'); await expect(page.locator('#percent')).toHaveText('0.0%');
  await expect.poll(async () => (await probe(page)).shots.length).toBe(0);
  await expect.poll(async () => new Set((await probe(page)).enemyColors).size).toBe(4);
  await checkRoster();
  expect(errors).toEqual([]);
});

for (const phase of [2, 3]) test(`configured phase ${phase} renders sixteen shots and the correct reinforcement target`, async ({ page }) => {
  await expect(page.locator('#boss-phase')).toContainText(phase === 2 ? '二阶段' : '三阶段');
  await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', phase === 2 ? '3' : '1');
  for (let i = 0; i < 100 && (await probe(page)).shots.length !== 16; i++) await page.clock.runFor(100);
  const shots = (await probe(page)).shots;
  expect(shots).toHaveLength(16);
  const elapsed = Number((await page.locator('#elapsed').textContent())!.split(':')[1]);
  if (phase === 2) expect(elapsed).toBeGreaterThanOrEqual(4); else expect(elapsed).toBeLessThanOrEqual(3);
  const center = shots.reduce((sum, p) => ({ x: sum.x + p.x / 16, y: sum.y + p.y / 16 }), { x: 0, y: 0 });
  const angles = shots.map(p => Math.atan2(p.y - center.y, p.x - center.x));
  for (let i = 1; i < angles.length; i++) expect((angles[i] - angles[i - 1] + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo(Math.PI / 8, 4);
  await page.locator('#board').screenshot({ path: `test-results/phase-${phase}-shots.png` });
  for (let i = 0; i < 60 && (await probe(page)).enemyColors.length !== (phase === 2 ? 10 : 16); i++) await page.clock.runFor(100);
  expect((await probe(page)).enemyColors).toHaveLength(phase === 2 ? 10 : 16);
  await expect(page.locator('#boss-phase')).toContainText(phase === 2 ? '9/9' : '15/15');
  await page.screenshot({ path: `test-results/phase-${phase}-roster.png`, fullPage: true });
  await page.keyboard.press('KeyP'); const paused = await probe(page); await page.clock.runFor(1000);
  expect((await probe(page)).shots).toEqual(paused.shots);
});

test('portrait controller swaps sides, stays within the screen and is hidden on wide layouts', async ({ page }) => {
  await expect(page.locator('.touch-controls')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.touch-controls')).toBeVisible();
  const before = await page.locator('.dpad-side').boundingBox(), drawBefore = await page.locator('.draw-side').boundingBox();
  expect(before!.x).toBeLessThan(drawBefore!.x);
  await page.locator('#control-mode').click(); await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'two-right');
  const after = await page.locator('.dpad-side').boundingBox(), drawAfter = await page.locator('.draw-side').boundingBox();
  expect(after!.x).toBeGreaterThan(drawAfter!.x);
  const session = await touchController(page);
  await expect.poll(async () => (await probe(page)).player.y, { timeout: 6000 }).toBe(48);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
  await expect(page.locator('#percent')).toHaveText('50.0%');
  await page.screenshot({ path: 'test-results/mobile-controller.png', fullPage: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const box = await page.locator('#control-mode').boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.goto('/'); await expect(page.getByRole('button', { name: '开始探索' })).toBeVisible();
  await page.getByRole('button', { name: '开始探索' }).click(); await expect(page.locator('#overlay')).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 }); await expect(page.locator('.touch-controls')).toBeHidden();
  await page.setViewportSize({ width: 1000, height: 800 }); await expect(page.locator('.touch-controls')).toBeHidden();
});

test('reduced motion reveals territory without drifting particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await firstCut(page);
  await page.waitForTimeout(400);
  const state = await probe(page); expect(state.white).toBeGreaterThan(0); expect(state.particles).toBe(0);
  await expect(page.locator('#percent')).toHaveText('50.0%');
});
