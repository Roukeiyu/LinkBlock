import { expect, test } from '@playwright/test';

for (const phone of [false, true]) for (const scenario of ['corner', 'frame']) {
  test(`${phone ? 'phone joystick' : 'keyboard'} magnetism at ${scenario}`, async ({ page }) => {
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        let snapLanding;
        const originalMove = Game.prototype.move;
        Game.prototype.move = function(...args) {
          const closed = originalMove.apply(this, args);
          if (closed) snapLanding = {...this.player};
          return closed;
        };
        const originalConfirm = Game.prototype.confirmOpening;
        Game.prototype.confirmOpening = function() {
          if (this.opening) this.opening.region = [{x:12,y:12},{x:20,y:12},{x:20,y:20},{x:12,y:20}];
          const confirmed = originalConfirm.call(this);
          if (confirmed) {
            this.options.powerUps=false; this.powerUp=undefined;
            this.enemies=[]; this.boss=undefined; this.bossAttack=undefined;
            this.player={x:16,y:12}; this.anchor={...this.player};
            ${scenario === 'corner' ? "this.move('up',true,4); this.move('right',true,4.2); this.move('down',true,3.5);" : "this.move('up',true,11.5);"}
          }
          return confirmed;
        };
        window.readSnap = () => ({player: game.player, trail: game.trail, claimed: game.claimed,
          score: game.score, landing: snapLanding, retracting: game.retracting});
      ` });
    });
    await page.clock.install(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.goto('/'); await page.locator('#menu-start').click();
    await page.locator('#board').focus(); await page.keyboard.press('Space');
    const read = () => page.evaluate(() => (window as unknown as { readSnap: () => {
      player: { x: number; y: number }; trail: unknown[]; claimed: number; score: number;
      landing?: { x: number; y: number }; retracting: boolean;
    } }).readSnap());
    const session = phone ? await page.context().newCDPSession(page) : undefined;
    const key = scenario === 'corner' ? 'ArrowDown' : 'ArrowUp';
    if (session) {
      const box = (await page.locator('#joystick').boundingBox())!;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x, y: y + (scenario === 'corner' ? 12 : -12) }] });
      await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
    } else {
      await page.keyboard.down('Space'); await page.keyboard.down(key);
    }
    await page.clock.runFor(32);
    const state = await read();
    if (scenario === 'corner') {
      expect(state.landing).toEqual({ x: 20, y: 12 });
      expect(state.trail).toHaveLength(0); expect(state.claimed).toBeCloseTo(80.8);
    } else {
      expect(state.player).toEqual({ x: 16, y: 0 }); expect(state.trail).toHaveLength(2);
      expect(state.claimed).toBe(64); expect(state.score).toBe(0); expect(state.landing).toBeUndefined();
    }
    if (session) { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach(); }
    else { await page.keyboard.up(key); await page.keyboard.up('Space'); }
    await page.clock.runFor(320);
    expect((await read()).trail).toHaveLength(0);
    if (scenario === 'frame') expect((await read()).player).toEqual({ x: 16, y: 12 });
    await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
    expect(errors).toEqual([]);
  });
}
