import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

type Probe = { player: { x: number; y: number }; positions: { x: number; y: number; time: number }[]; white: number; particles: number; flash: string; trail: { x: number; y: number }[]; shots: { x: number; y: number }[]; enemyColors: string[]; warningFrame: string; warningShots: number; defeatFrame: string; awards: { text: string; color: string }[]; jumpScales: number[]; jumpShadows: number };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { probe: Probe }).probe);
async function hold(page: Page, key: string, duration: number) {
  await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key);
}
async function firstCut(page: Page) {
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await probe(page)).player.y, { timeout: 6000, intervals: [16] }).toBe(48);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('Space');
}
test.beforeEach(async ({ page }, info) => {
  const controlled = info.title.includes('boss damage jump') || info.title.includes('enclosing a normal');
  if (controlled) await page.clock.install({ time: new Date('2026-11-03T00:00:00Z') });
  // Observe the real canvas drawing commands without adding debug APIs to the app.
  await page.addInitScript(() => {
    const state = { player: { x: 0, y: 0 }, positions: [] as { x: number; y: number; time: number }[], white: 0, particles: 0, flash: '', trail: [] as { x: number; y: number }[], shots: [] as { x: number; y: number }[], enemyColors: [] as string[], warningFrame: '', warningShots: -1, defeatFrame: '', awards: [] as { text: string; color: string }[], jumpScales: [] as number[], jumpShadows: 0 };
    (window as unknown as { probe: typeof state }).probe = state;
    const paths = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }[]>();
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'clearRect'] as const) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function(this: CanvasRenderingContext2D, ...args: number[]) {
        if (method === 'clearRect' && this.canvas.id === 'board') { state.trail = []; state.shots = []; state.enemyColors = []; state.jumpScales = []; state.jumpShadows = 0; }
        if (method === 'beginPath') paths.set(this, []);
        if (method === 'moveTo' || method === 'lineTo') paths.get(this)?.push({ x: args[0], y: args[1] });
        if (method === 'stroke' && this.strokeStyle === '#ffcf75') state.trail = [...(paths.get(this) ?? [])];
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
      if (args[2] === 1.35 && args[3] === 0.48 && this.fillStyle === '#000000') state.jumpShadows++;
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
      if (args[2] === 1.8 && args[4] - args[3] >= Math.PI && !warningScheduled) {
        warningScheduled = true;
        queueMicrotask(() => { state.warningFrame = this.canvas.toDataURL(); state.warningShots = state.shots.length; });
      }
      if (args[2] === 0.22) state.shots.push({ x: args[0], y: args[1] });
      if (args[2] === 0.14) { state.player = { x: args[0], y: args[1] }; state.positions.push({ ...state.player, time: performance.now() }); }
      return arc.apply(this, args);
    };
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function(...args: unknown[]) {
      if (['#ff727d', '#bda4ff', '#72cfff', '#ffa56e'].includes(String(this.fillStyle))) state.enemyColors.push(String(this.fillStyle));
      if (this.fillStyle === '#ffffff') {
        state.white++;
        if (state.white === 1) queueMicrotask(() => { state.flash = this.canvas.toDataURL(); });
      }
      if (this.fillStyle === '#d9fff1') state.particles++;
      return Reflect.apply(fill, this, args);
    };
  });
  await page.goto('/');
  if (controlled) await page.clock.pauseAt(new Date('2026-11-03T00:00:01Z'));
  await page.getByRole('button', { name: '开始探索' }).click();
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
    if (swapped) await page.locator('#swap-controls').click();
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
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown'); await page.clock.runFor(2200);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('Space');
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(944); await page.keyboard.up('ArrowUp');
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowRight'); await page.clock.runFor(1700);
  await page.clock.runFor(250);
  await expect(page.locator('[data-kind="zigzag"]')).toHaveClass(/defeated/, { timeout: 4000 });
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space');
  await expect(page.locator('#toast')).toContainText('+1000');
  await expect.poll(async () => (await probe(page)).awards.some(award => award.text === '+500' && award.color === '#72cfff')).toBe(true);
  expect((await probe(page)).enemyColors).not.toContain('#72cfff');
  await expect.poll(async () => (await probe(page)).defeatFrame.length).toBeGreaterThan(0);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/enemy-defeat.png', Buffer.from((await probe(page)).defeatFrame.split(',')[1], 'base64'));
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeGreaterThan(50);
});

test('boss damage jump shows four health bars, landing shadow and scaling before returning to normal', async ({ page }) => {
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown'); await page.clock.runFor(2200);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('Space');
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(944); await page.keyboard.up('ArrowUp');
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowRight'); await page.clock.runFor(1700);
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space'); await page.clock.runFor(250);
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

test('four independent enemy bodies, boss warning and eight-way shots survive pause and reset on restart', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.enemy-entry')).toHaveCount(4);
  await expect.poll(async () => new Set((await probe(page)).enemyColors).size).toBe(4);
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
  expect(errors).toEqual([]);
});

test('portrait controller swaps sides, stays within the screen and is hidden on wide layouts', async ({ page }) => {
  await expect(page.locator('.touch-controls')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.touch-controls')).toBeVisible();
  const before = await page.locator('.dpad-side').boundingBox(), drawBefore = await page.locator('.draw-side').boundingBox();
  expect(before!.x).toBeLessThan(drawBefore!.x);
  await page.locator('#swap-controls').click(); await expect(page.locator('#swap-controls')).toHaveAttribute('aria-pressed', 'true');
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
    const box = await page.locator('#swap-controls').boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
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
