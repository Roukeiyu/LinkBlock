import { expect, test } from '@playwright/test';
import type { Game } from '../src/engine';

declare global { interface Window { powerUpGame: () => Game } }

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`power-up appears, can be picked up, and pauses on ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        window.powerUpGame = () => game;
        const selectPowerUpOpening = Game.prototype.confirmOpening;
        Game.prototype.confirmOpening = function() {
          if (this.opening) this.opening.region = [{x:18,y:18},{x:30,y:18},{x:30,y:30},{x:18,y:30}];
          return selectPowerUpOpening.call(this);
        };` });
    });
    await page.clock.install(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.goto('/'); await page.locator('#menu-start').click();
    await page.locator('#board').focus(); await page.keyboard.press('Space'); await page.clock.runFor(160);
    const item = await page.evaluate(() => window.powerUpGame().powerUp);
    expect(item).toBeDefined(); expect(['slow', 'stop', 'speed']).toContain(item!.kind);
    await page.locator('#board').screenshot({ path: `test-results/powerup-board-${viewport.width}.png` });
    await page.evaluate(() => {
      const game = window.powerUpGame(); game.enemies = []; game.boss = undefined; game.bossAttack = undefined;
      game.player = { x: 24, y: 18 }; game.anchor = { ...game.player };
      game.powerUp = { x: 24, y: 14, kind: 'stop' };
    });
    await page.keyboard.down('Space'); await page.keyboard.down('ArrowUp'); await page.clock.runFor(240);
    await page.keyboard.up('ArrowUp');
    expect((await page.evaluate(() => window.powerUpGame().player)).y).toBeLessThan(18);
    await expect(page.locator('#powerup-status')).toContainText('止步');
    const active = await page.evaluate(() => window.powerUpGame().powerUpEffects.stop);
    expect(active).toBeGreaterThan(2.6); expect(active).toBeLessThan(3);
    expect(await page.evaluate(() => window.powerUpGame().powerUp)).toBeUndefined();
    await page.locator('#pause').click(); await page.clock.runFor(5000);
    expect(await page.evaluate(() => window.powerUpGame().powerUpEffects.stop)).toBe(active);
    await expect(page.locator('#powerup-status')).toContainText('止步');
    await page.locator('#primary').click(); await page.clock.runFor(3100);
    await expect(page.locator('#powerup-status')).toBeHidden();
    expect(await page.evaluate(() => window.powerUpGame().powerUpEffects.stop)).toBe(0);
    expect(errors).toEqual([]);
  });
}
