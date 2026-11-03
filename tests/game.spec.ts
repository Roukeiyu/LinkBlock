import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

type Probe = { player: { x: number; y: number }; positions: { x: number; y: number; time: number }[]; white: number; particles: number; flash: string };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { probe: Probe }).probe);
async function hold(page: Page, key: string, duration: number) {
  await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key);
}
async function firstCut(page: Page) {
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await probe(page)).player.y, { timeout: 6000, intervals: [16] }).toBe(48);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('Space');
}
test.beforeEach(async ({ page }) => {
  // Observe the real canvas drawing commands without adding debug APIs to the app.
  await page.addInitScript(() => {
    const state = { player: { x: 0, y: 0 }, positions: [] as { x: number; y: number; time: number }[], white: 0, particles: 0, flash: '' };
    (window as unknown as { probe: typeof state }).probe = state;
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function(...args: Parameters<typeof arc>) {
      if (args[2] === 0.14) { state.player = { x: args[0], y: args[1] }; state.positions.push({ ...state.player, time: performance.now() }); }
      return arc.apply(this, args);
    };
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function(...args: unknown[]) {
      if (this.fillStyle === '#ffffff') {
        state.white++;
        if (state.white === 1) queueMicrotask(() => { state.flash = this.canvas.toDataURL(); });
      }
      if (this.fillStyle === '#d9fff1') state.particles++;
      return Reflect.apply(fill, this, args);
    };
  });
  await page.goto('/'); await page.getByRole('button', { name: '开始探索' }).click();
});

test('continuous movement stays on the drawn edge and turns between arbitrary coordinates', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await hold(page, 'ArrowRight', 137);
  const start = (await probe(page)).player;
  expect(start.x).toBeGreaterThan(36); expect(start.y).toBe(0);
  await page.keyboard.down('Space'); await hold(page, 'ArrowDown', 173);
  const turn = (await probe(page)).player;
  expect(turn.x).toBeCloseTo(start.x, 7); expect(turn.y).toBeGreaterThan(0);
  await hold(page, 'ArrowLeft', 143); await page.keyboard.up('Space');
  const end = (await probe(page)).player;
  expect(end.x).toBeLessThan(turn.x); expect(end.y).toBeCloseTo(turn.y, 7);
  const samples = (await probe(page)).positions.filter(p => p.y > 0 && p.x === start.x);
  expect(new Set(samples.map(p => p.y)).size).toBeGreaterThan(5);
  expect(samples.some(p => Math.abs(p.y - Math.round(p.y)) > 0.05)).toBe(true);
  await page.waitForTimeout(100); expect((await probe(page)).player).toEqual(end);
  expect(errors).toEqual([]);
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

test('victory completes the effect before showing results and can restart', async ({ page }) => {
  await firstCut(page);
  await hold(page, 'ArrowUp', 1000);
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowRight');
  await expect(page.getByRole('heading', { name: '这片风景，属于你。' })).toBeVisible({ timeout: 6000 });
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space');
  await expect(page.locator('#overlay-hint')).toHaveText('静谧之湖 · 已解锁完整风景');
  await page.getByRole('button', { name: '再探索一次' }).click();
  await expect(page.locator('#percent')).toHaveText('0.0%'); await expect(page.locator('#overlay')).toBeHidden();
});

test('touch uses continuous movement and layout fits a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '画线：关' }).click();
  const down = await page.getByRole('button', { name: '向下' }).boundingBox();
  await page.mouse.move(down!.x + down!.width / 2, down!.y + down!.height / 2); await page.mouse.down();
  await expect.poll(async () => (await probe(page)).player.y, { timeout: 6000 }).toBe(48); await page.mouse.up();
  await expect(page.locator('#percent')).toHaveText('50.0%');
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('reduced motion reveals territory without drifting particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await firstCut(page);
  await page.waitForTimeout(400);
  const state = await probe(page); expect(state.white).toBeGreaterThan(0); expect(state.particles).toBe(0);
  await expect(page.locator('#percent')).toHaveText('50.0%');
});
