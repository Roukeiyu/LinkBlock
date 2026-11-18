import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    prepareHitScene(): void;
    shootLiveLine(): void;
    readHitScene(): { x: number; y: number; points: number; lives: number; protection: number };
  }
}

for (const reduced of [false, true]) {
  test(`held drawing carries through a bullet hit with visible health feedback, reduced motion=${reduced}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    if (reduced) await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        import { Projectile as TestShot } from '/src/attacks.ts';
        window.prepareHitScene = () => {
          game.opening.region = [{x:18,y:18},{x:30,y:18},{x:30,y:30},{x:18,y:30}];
          game.confirmOpening();
          game.enemies = []; game.boss = undefined; game.bossAttack = undefined;
          game.player = {x:24,y:18}; game.anchor = {...game.player};
        };
        window.shootLiveLine = () => game.spawnHazard(new TestShot({x:24,y:17}, {x:0,y:0}));
        window.readHitScene = () => ({...game.player, points:game.trail.length, lives:game.lives, protection:game.protection});` });
    });
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.goto('/'); await page.locator('#menu-start').click();
    await page.evaluate(() => window.prepareHitScene());
    await page.locator('#board').focus(); await page.keyboard.down('Space'); await page.keyboard.down('ArrowUp');
    await page.clock.runFor(240);
    const before = await page.evaluate(() => window.readHitScene());
    expect(before.y).toBeLessThan(15);
    await page.evaluate(() => window.shootLiveLine()); await page.clock.runFor(16);
    const hit = await page.evaluate(() => window.readHitScene());
    expect(hit.y).toBeCloseTo(before.y); expect(hit.points).toBe(2); expect(hit.lives).toBe(2);
    await expect(page.locator('#toast')).toContainText('生命 −1');
    await page.clock.runFor(160);
    const next = await page.evaluate(() => window.readHitScene());
    expect(next.y).toBeLessThan(hit.y - 2); expect(next.protection).toBeGreaterThan(0);
    await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 2 条生命');
    await page.locator('#board').screenshot({ path: `test-results/player-hit-${reduced ? 'phone' : 'desktop'}.png` });
    await page.keyboard.up('ArrowUp'); await page.keyboard.up('Space'); await page.clock.runFor(400);
    expect(await page.evaluate(() => window.readHitScene())).toMatchObject({ x: 24, y: 18, points: 0, lives: 2 });
  });
}
