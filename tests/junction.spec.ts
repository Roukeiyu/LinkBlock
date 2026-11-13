import { expect, test, type Page } from '@playwright/test';
import type { Game } from '../src/engine';

declare global {
  interface Window {
    junctionGame: () => Game;
    junctionPointer: { x: number; y: number };
  }
}

const probe = (page: Page) => page.evaluate(() => {
  const game = window.junctionGame();
  return { player: game.player, trail: game.trail, claimed: game.claimed, retracting: game.retracting };
});

test.beforeEach(async ({ page }, info) => {
  if (info.title.includes('phone')) await page.setViewportSize({ width: 390, height: 844 });
  // Reproduce the topology through real captures. Only the initial scene and
  // hazards are controlled; input, movement, closure, scoring and rendering run
  // through the shipped app. Inspection is injected only by this test route.
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
      window.junctionGame = () => game;
      const confirmForJunction = Game.prototype.confirmOpening;
      Game.prototype.confirmOpening = function() {
        if (this.opening) this.opening.region = [{x:18,y:18},{x:30,y:18},{x:30,y:30},{x:18,y:30}];
        const selected = confirmForJunction.call(this);
        if (selected) {
          this.options.powerUps=false; this.powerUp=undefined;
          this.enemies=[]; this.boss=undefined; this.bossAttack=undefined;
          this.player={x:30,y:18}; this.anchor={...this.player};
          this.move('up',true,10); this.move('right',true,10);
          this.move('down',true,10); this.move('left',true,10);
          this.player={x:30.12,y:18}; this.anchor={...this.player};
        }
        return selected;
      };` });
  });
  await page.addInitScript(() => document.addEventListener('pointermove', event => {
    window.junctionPointer = { x: event.clientX, y: event.clientY };
  }));
  await page.clock.install({ time: new Date('2026-11-12T00:00:00Z') });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.goto('/'); await page.locator('#menu-start').click();
  await controlMode(page, 'two-left');
});

async function controlMode(page: Page, mode: string) {
  for (let i = 0; i < 3 && await page.locator('.touch-controls').getAttribute('data-mode') !== mode; i++) {
    await page.locator('#control-mode').evaluate((button: HTMLButtonElement) => button.click());
  }
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', mode);
}

async function touchJoystick(page: Page) {
  const box = (await page.locator('#joystick').boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  return { session, move: async (dx: number, dy: number) => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x + dx, y: y + dy }] });
    await expect.poll(() => page.evaluate(p => {
      const actual = window.junctionPointer;
      return actual && Math.abs(actual.x - p.x) < 0.1 && Math.abs(actual.y - p.y) < 0.1;
    }, { x: x + dx, y: y + dy })).toBe(true);
  } };
}

for (const input of ['keyboard', 'one-hand', 'two-hand']) test(`island coast corner junction turns, crosses and captures onto the other island with ${input}${input === 'keyboard' ? '' : ' on phone'}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  if (input === 'one-hand') await controlMode(page, 'one-hand');
  await page.locator('#board').focus(); await page.keyboard.press('Space'); await page.clock.runFor(32);
  expect((await probe(page)).player).toEqual({ x: 30.12, y: 18 });
  const initialScore = Number(await page.locator('#score').textContent());
  type Direction = 'up' | 'right' | 'down' | 'left';
  const keys = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' };
  const finger = input === 'one-hand' ? await touchJoystick(page) : undefined;
  const session = finger?.session ?? (input === 'two-hand' ? await page.context().newCDPSession(page) : undefined);
  if (session) await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const center = async (selector: string) => { const b = (await page.locator(selector).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const draw = input === 'two-hand' ? { id: 2, ...await center('#touch-draw') } : undefined;
  let direction: Direction | undefined, dx = 0, dy = 0;
  if (input === 'keyboard') await page.keyboard.down('Space');
  const drive = async (next: Direction, ms: number) => {
    if (input === 'keyboard') {
      if (direction) await page.keyboard.up(keys[direction]);
      await page.keyboard.down(keys[next]);
    } else if (finger) {
      dx += next === 'right' ? 12 : next === 'left' ? -12 : 0;
      dy += next === 'down' ? 12 : next === 'up' ? -12 : 0;
      await finger.move(dx, dy);
    } else {
      await session!.send('Input.dispatchTouchEvent', { type: direction ? 'touchMove' : 'touchStart', touchPoints: [{ id: 1, ...await center(`[data-dir="${next}"]`) }, draw!] });
      await expect(page.locator(`[data-dir="${next}"]`)).toHaveClass(/is-held/);
    }
    direction = next; await page.clock.runFor(ms);
  };
  await drive('up', 96);
  expect((await probe(page)).player.x).toBe(30); expect((await probe(page)).player.y).toBeLessThan(17);
  await drive('down', 288);
  expect((await probe(page)).player.x).toBe(30); expect((await probe(page)).player.y).toBeGreaterThan(21);
  await drive('up', 288);
  expect((await probe(page)).player.y).toBeLessThan(17); expect((await probe(page)).trail).toHaveLength(0);
  expect(Number(await page.locator('#score').textContent())).toBe(initialScore);
  await drive('left', 144); expect((await probe(page)).trail.length).toBeGreaterThan(1);
  await drive('down', 144);
  const closed = (await probe(page)).player;
  expect(closed.x).toBeLessThan(28); expect(closed.y).toBe(18); expect((await probe(page)).trail).toHaveLength(0);
  expect((await probe(page)).retracting).toBe(false); expect((await probe(page)).claimed).toBeGreaterThan(244);
  // Keep the same action press after closure and move onto the lower shore.
  await drive('left', 96); expect((await probe(page)).player.x).toBeLessThan(closed.x);
  expect((await probe(page)).player.y).toBe(18); expect((await probe(page)).trail).toHaveLength(0);
  expect(Number(await page.locator('#score').textContent())).toBeGreaterThan(initialScore);
  const home = (await probe(page)).player, claimed = (await probe(page)).claimed;
  await drive('up', 64); expect((await probe(page)).trail.length).toBeGreaterThan(1);
  if (input === 'keyboard') { await page.keyboard.up(keys[direction!]); await page.keyboard.up('Space'); }
  else { await session!.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session!.detach(); }
  await page.clock.runFor(160);
  expect((await probe(page)).player).toEqual(home); expect((await probe(page)).trail).toHaveLength(0);
  expect((await probe(page)).claimed).toBe(claimed);
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命'); expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/corner-junction-${input}.png`, fullPage: true });
});

