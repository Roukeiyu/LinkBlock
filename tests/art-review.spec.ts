import { expect, test } from '@playwright/test';

for (const [pageName, count] of [['rewards', 30], ['enemies', 60]] as const) {
  test(`${pageName} review loads every current image and opens the original`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/review/${pageName}.html`);
    await expect(page.locator('#levels section')).toHaveCount(10);
    await expect(page.locator('#levels img')).toHaveCount(count);
    // Trigger lazy assets, including the final chapters below the viewport.
    const broken = await page.locator('#levels img').evaluateAll(async images => {
      await Promise.all(images.map(image => {
        const img = image as HTMLImageElement;
        img.loading = 'eager';
        return img.decode().catch(() => {});
      }));
      return images.filter(image => !(image as HTMLImageElement).naturalWidth).map(image => (image as HTMLImageElement).src);
    });
    expect(broken).toEqual([]);
    await page.locator('#level-filter').selectOption('10');
    await expect(page.locator('#levels section:visible')).toHaveCount(1);
    const original = await page.locator('#levels section:visible img').first().getAttribute('src');
    expect(original).toContain('levels/10/v2/');
    await page.locator('#levels section:visible figure button').first().click();
    await expect(page.locator('#viewer')).toBeVisible();
    await expect(page.locator('#download')).toHaveAttribute('href', new URL(original!, page.url()).href);
    await page.keyboard.press('Escape');
    await expect(page.locator('#viewer')).not.toBeVisible();
    if (pageName === 'enemies') {
      await page.locator('#animation-toggle').click();
      await expect(page.locator('#animation-toggle')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('[data-frame]')).toHaveCount(4);
      const frames = await page.locator('[data-frame]').evaluateAll(canvases => canvases.map(c => (c as HTMLCanvasElement).toDataURL()));
      expect(new Set(frames).size).toBe(4);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(errors).toEqual([]);
  });
}

test('player uses four frames, freezes on pause, and respects reduced motion', async ({ page }) => {
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.battle = () => game;` });
  });
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    const samples: number[] = [];
    Object.assign(window, { spiritSamples: samples });
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
      if (args[0] instanceof HTMLImageElement && args[0].src.endsWith('/sprites/player-spirit.webp')) {
        samples.push(args[1]);
      }
      return Reflect.apply(draw, this, args);
    };
  });
  await page.goto('/');
  await page.clock.install();
  await page.locator('#menu-start').click();
  await page.keyboard.press('Space');
  await expect(page.locator('#state-label')).toHaveText('探索中');
  await page.evaluate(() => {
    const game = window.battle();
    game.enemies = []; game.boss = undefined; game.hazards = []; game.protection = 0;
  });
  const samples = () => page.evaluate(() => [...new Set((window as unknown as { spiritSamples: number[] }).spiritSamples)]);
  const reset = () => page.evaluate(() => { (window as unknown as { spiritSamples: number[] }).spiritSamples.length = 0; });
  await page.clock.runFor(850);
  expect((await samples()).length).toBe(4);
  await page.keyboard.press('KeyP');
  await expect(page.locator('#overlay')).toBeVisible();
  expect(await page.locator('.overlay-card').evaluate(e => getComputedStyle(e).borderImageSource)).toContain('torn-parchment.webp');
  expect(await page.locator('.overlay-card').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await reset(); await page.clock.runFor(850);
  expect((await samples()).length).toBe(1);
  await page.locator('#primary').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(40); await reset(); await page.clock.runFor(850);
  expect(await samples()).toEqual([0]);
});
