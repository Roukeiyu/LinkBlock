import { expect, test } from '@playwright/test';

test('fresh visits, opening a game and refreshes never count the available first level as cleared', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#seal-count')).toHaveText('已解封 0/10');
  await page.locator('#menu-levels').click();
  await expect(page.locator('#level-list button:not([disabled])')).toHaveCount(1);
  await page.locator('#levels-close').click();
  await page.locator('#menu-start').click();
  await expect(page.locator('#state-label')).toHaveText('选择起点');
  await page.reload();
  await expect(page.locator('#seal-count')).toHaveText('已解封 0/10');
  await expect(page.locator('#seal-row img[src$="wax_seal_broken.png"]')).toHaveCount(0);
});

test('an orphan legacy reward cannot unlock a seal or gallery on first entry or refresh', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('linkblock.fenglin.codex', JSON.stringify({ clear: true, ninety: true, perfect: true })));
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(page.locator('#seal-count')).toHaveText('已解封 0/10');
    await page.locator('#menu-gallery').click();
    await expect(page.locator('.gallery-item.locked')).toHaveCount(30);
    await page.locator('#gallery-close').click();
  }
  // Migration does not delete old records merely by viewing the menu.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('linkblock.fenglin.codex')!).clear)).toBe(true);
});

test('consistent previously earned progress survives an upgrade and refresh', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('linkblock.fenglin.codex', JSON.stringify({ clear: true, ninety: false, perfect: false }));
    localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ unlocked: 2 }));
  });
  await page.reload();
  await expect(page.locator('#seal-count')).toHaveText('已解封 1/10');
  await expect(page.locator('#seal-row img[src$="wax_seal_broken.png"]')).toHaveCount(1);
  await page.locator('#menu-levels').click();
  await expect(page.locator('#level-list button:not([disabled])')).toHaveCount(2);
});

test('a real capture victory records one seal and retains it after reload and restart', async ({ page }) => {
  // Replace only the battle fixture in the test: the engine produces the won
  // event from an actual enclosing cut; the page handles and persists it.
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
      window.captureToWin = () => {
        game = new Game(20, 20, { enemies: [], boss: null, victory: { territoryPercent: 40 } });
        game.start(); game.move('down', true, 20);
      };` });
  });
  await page.goto('/'); await page.clock.install();
  await page.locator('#menu-start').click();
  await page.evaluate(() => (window as unknown as { captureToWin: () => void }).captureToWin());
  await page.clock.runFor(4000);
  await expect(page.locator('#state-label')).toHaveText('探索完成');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('linkblock.fenglin.levels')!));
  expect(saved).toEqual({ version: 3, unlocked: 2, cleared: [1] });
  await page.reload();
  await expect(page.locator('#seal-count')).toHaveText('已解封 1/10');
  await page.locator('#menu-start').click(); await page.locator('#restart').click();
  await page.reload();
  await expect(page.locator('#seal-count')).toHaveText('已解封 1/10');
});
