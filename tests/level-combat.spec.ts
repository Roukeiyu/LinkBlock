import { expect, test } from '@playwright/test';
import type { Game } from '../src/engine';

declare global { interface Window { battle: () => Game } }

test.beforeEach(async ({ page }) => {
  // Test-only inspection; the shipped application has no debug entry point.
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.battle = () => game;` });
  });
  await page.addInitScript(() => localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ unlocked: 10 })));
});

for (const [screen, width, height] of [['desktop', 1280, 800], ['portrait', 390, 844], ['small', 320, 568], ['landscape', 844, 390]] as const) {
  test(`ten distinct battles and readable guidance on ${screen}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await page.clock.install();
    await page.locator('#menu-guide').click();
    await expect(page.locator('#combat-guide section')).toHaveCount(10);
    await expect(page.locator('#combat-guide section').first()).toContainText('场上最多 6 只小怪');
    await expect(page.locator('#combat-guide section').nth(4)).toContainText('每 4 秒最多补 1 只');
    const guide = await page.locator('.combat-guide-card').boundingBox();
    expect(guide!.y).toBeGreaterThanOrEqual(0);
    expect(guide!.y + guide!.height).toBeLessThanOrEqual(height + 1);
    await page.keyboard.press('Escape'); await expect(page.locator('#combat-guide')).toBeHidden();
    const names = ['十字 / X 交替', '流沙扇射', '旋转电弧', '血翼夹击', '缺口围猎', '快慢双潮', '三方狐火', '冰晶排射', '四翼石羽', '熔冠轮舞'];
    for (let id = 1; id <= 10; id++) {
      if (id > 1) await page.locator('#home').click();
      await page.locator('#menu-levels').click();
      await page.locator(`#level-list [data-level="${id}"]`).click();
      await expect(page.locator('#state-label')).toHaveText('选择起点');
      await page.locator('#board').focus(); await page.keyboard.press('Space');
      await expect(page.locator('#state-label')).toHaveText('探索中');
      expect(await page.evaluate(() => window.battle().enemies.length)).toBe(id <= 5 ? id + 5 : id + 7);
      expect(await page.evaluate(() => window.battle().bossAttack?.name)).toBe(names[id - 1]);
      // Keep the scene alive to observe the first real warning and volley.
      await page.evaluate(() => { window.battle().protection = 1000; });
      const interval = await page.evaluate(() => (window.battle().bossAttack as unknown as { interval: number }).interval);
      await page.clock.runFor((interval - 0.5) * 1000);
      expect(await page.evaluate(() => window.battle().bossAttack!.warning)).toBeGreaterThan(0);
      const angles = await page.evaluate(() => [...(window.battle().bossAttack!.warningAngles ?? [])]);
      if (id > 1) expect(angles.length).toBeGreaterThan(0);
      const help = await page.locator('#combat-help').boundingBox();
      expect(help!.x).toBeGreaterThanOrEqual(0); expect(help!.x + help!.width).toBeLessThanOrEqual(width);
      await page.locator('#combat-help').click();
      const elapsed = await page.evaluate(() => window.battle().elapsed);
      await page.keyboard.press('KeyR'); await page.keyboard.press('KeyP');
      await page.clock.runFor(1000);
      expect(await page.evaluate(() => window.battle().elapsed)).toBe(elapsed);
      await page.locator('#combat-guide-close').click();
      await page.locator('#primary').click();
      await page.clock.runFor(700);
      expect(await page.evaluate(() => window.battle().hazards.length)).toBeGreaterThan(0);
      await page.locator('#restart').click();
      await expect(page.locator('#state-label')).toHaveText('选择起点');
      expect(await page.evaluate(() => window.battle().hazards.length)).toBe(0);
    }
    expect(errors).toEqual([]);
  });
}
