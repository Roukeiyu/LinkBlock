import { expect, test } from '@playwright/test';
import { LEVELS } from '../src/levels';

test('all new art, masks, enemies, rewards and audio load from real bundled files', async ({ page, request }) => {
  await page.goto('/');
  for (const level of LEVELS.slice(5)) {
    const paths = [level.restored, level.sealed, level.mask, level.portraitSealed, level.portraitRescued,
      level.rewardNinety!, level.rewardPerfect!, level.sprites.mist, level.sprites.thorn, level.sprites.ghost,
      level.sprites.spore, level.sprites.crow, level.sprites.tree];
    const images = await page.evaluate(async files => Promise.all(files.map(file => new Promise<{ file: string; width: number; height: number }>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve({ file, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error(file)); image.src = file;
    }))), paths);
    expect(images.every(image => image.width > 0 && image.height > 0)).toBe(true);
    const maskShare = await page.evaluate(async path => {
      const image = new Image(); image.src = path; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 96, 64);
      const data = ctx.getImageData(0, 0, 96, 64).data;
      return Array.from({ length: 96 * 64 }, (_, i) => data[i * 4] > 127 ? 1 : 0).reduce((a: number, b) => a + b, 0) / (96 * 64);
    }, level.mask);
    expect(maskShare).toBeGreaterThan(.1); expect(maskShare).toBeLessThan(.8);
    for (const ext of ['ogg', 'mp3']) {
      const response = await request.get(`/audio/${level.music}.${ext}`);
      expect(response.ok()).toBe(true); expect((await response.body()).length).toBeGreaterThan(10000);
    }
  }
});

test('old five-clear save opens level six, new rewards persist, and only level ten ends the campaign', async ({ page }) => {
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
      window.expansionWin = () => {
        game = new Game(20, 20, { enemies: [], boss: null, victory: { territoryPercent: 40 } });
        game.start(); game.move('down', true, 20);
      };` });
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 2, unlocked: 5, cleared: [1, 2, 3, 4, 5] })));
  await page.reload(); await page.clock.install();
  await expect(page.locator('#seal-count')).toHaveText('已解封 5/10');
  await page.locator('#menu-levels').click();
  await expect(page.locator('#level-list button')).toHaveCount(10);
  await expect(page.locator('#level-list button:not([disabled])')).toHaveCount(6);
  await page.locator('#level-list [data-level="6"]').click();
  await expect(page.locator('#level-title')).toContainText('第六关');
  await page.evaluate(() => (window as unknown as { expansionWin: () => void }).expansionWin());
  await page.clock.runFor(4000);
  await expect(page.locator('#next-level')).toBeVisible();
  await page.locator('#next-level').click();
  await expect(page.locator('#level-title')).toContainText('第七关');
  await page.reload();
  await expect(page.locator('#seal-count')).toHaveText('已解封 6/10');
  await page.evaluate(() => localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 3, unlocked: 10, cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9] })));
  await page.reload();
  await page.locator('#menu-start').click();
  await expect(page.locator('#level-title')).toContainText('第十关');
  await page.evaluate(() => (window as unknown as { expansionWin: () => void }).expansionWin());
  await page.clock.runFor(4000);
  await expect(page.locator('#next-level')).toBeHidden();
  await expect(page.locator('#overlay-title')).toHaveText('10 关都解开了。');
  await expect(page.locator('#primary')).toContainText('从第一关再来');
  await page.locator('#primary').click();
  await expect(page.locator('#level-title')).toContainText('第一关');
  await page.reload();
  await expect(page.locator('#seal-count')).toHaveText('已解封 10/10');
  await page.locator('#menu-gallery').click();
  await expect(page.locator('.gallery-level')).toHaveCount(10);
  await expect(page.locator('.gallery-item')).toHaveCount(30);
  await page.locator('.gallery-item[data-level="10"][data-reward="perfect"]').click();
  await expect(page.locator('#viewer-img')).toHaveAttribute('src', /levels\/10\/perfect.webp$/);
  await expect.poll(() => page.locator('#viewer-img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});
