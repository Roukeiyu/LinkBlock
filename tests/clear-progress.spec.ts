import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`clear progress requires confirmation and preserves settings on ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto('/');
    const original = {
      levels: JSON.stringify({ version: 3, unlocked: 3, cleared: [1, 2] }),
      codex: JSON.stringify({ clear: true, ninety: true, perfect: false, levels: { 2: { clear: true, ninety: false, perfect: true } } }),
      audio: JSON.stringify({ music: false, sfx: true, musicVolume: 0.3, sfxVolume: 0.6 }),
    };
    await page.evaluate(value => {
      localStorage.setItem('linkblock.fenglin.levels', value.levels);
      localStorage.setItem('linkblock.fenglin.codex', value.codex);
      localStorage.setItem('linkblock.fenglin.audio', value.audio);
      localStorage.setItem('linkblock.fenglin.character-form', 'monster');
      localStorage.setItem('other-app-data', 'untouched');
    }, original);
    await page.reload(); await expect(page.locator('#seal-count')).toHaveText('已解封 2/10');
    // A paused old run must not be resumed after its progress has been reset.
    await page.locator('#menu-start').click(); await expect(page.locator('#level-title')).toContainText('第三关');
    await page.locator('#home').click(); await page.locator('#menu-settings').click();
    await page.locator('#clear-progress').click();
    const dialog = page.getByRole('alertdialog', { name: '清空所有进度？' });
    await expect(dialog).toBeVisible(); await expect(page.locator('#cancel-clear-progress')).toBeFocused();
    await expect(dialog).toContainText('关卡进度和图鉴奖励将被清空');
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('linkblock.fenglin.levels'))).toBe(original.levels);
    await page.locator('#clear-progress').click(); await page.locator('#cancel-clear-progress').click();
    expect(await page.evaluate(() => localStorage.getItem('linkblock.fenglin.codex'))).toBe(original.codex);
    await page.locator('#clear-progress').click(); await page.locator('#confirm-clear-progress').click();
    await expect(dialog).toBeHidden(); await expect(page.locator('#seal-count')).toHaveText('已解封 0/10');
    expect(await page.evaluate(() => ({
      levels: localStorage.getItem('linkblock.fenglin.levels'), codex: localStorage.getItem('linkblock.fenglin.codex'),
      audio: localStorage.getItem('linkblock.fenglin.audio'), form: localStorage.getItem('linkblock.fenglin.character-form'),
      other: localStorage.getItem('other-app-data'),
    }))).toEqual({ levels: null, codex: null, audio: original.audio, form: 'monster', other: 'untouched' });
    await page.reload(); await expect(page.locator('#seal-count')).toHaveText('已解封 0/10');
    await page.locator('#menu-levels').click(); await expect(page.locator('#level-list button:not([disabled])')).toHaveCount(1);
    await page.locator('#levels-close').click(); await page.locator('#menu-gallery').click();
    await expect(page.locator('.gallery-item.locked')).toHaveCount(30); await page.locator('#gallery-close').click();
    await page.locator('#menu-start').click(); await expect(page.locator('#level-title')).toContainText('第一关');
  });
}

test('keeps the confirmation open and restores progress when storage removal fails', async ({ page }) => {
  await page.goto('/');
  const levels = JSON.stringify({ version: 3, unlocked: 2, cleared: [1] });
  const codex = JSON.stringify({ clear: true, ninety: true, perfect: false });
  await page.evaluate(({ levels, codex }) => {
    localStorage.setItem('linkblock.fenglin.levels', levels); localStorage.setItem('linkblock.fenglin.codex', codex);
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key) {
      if (key === 'linkblock.fenglin.codex') throw new Error('storage unavailable');
      return remove.call(this, key);
    };
  }, { levels, codex });
  await page.locator('#menu-settings').click(); await page.locator('#clear-progress').click();
  await page.locator('#confirm-clear-progress').click();
  await expect(page.getByRole('alertdialog', { name: '清空所有进度？' })).toBeVisible();
  await expect(page.locator('#clear-progress-error')).toContainText('无法清空进度');
  expect(await page.evaluate(() => ({ levels: localStorage.getItem('linkblock.fenglin.levels'), codex: localStorage.getItem('linkblock.fenglin.codex') }))).toEqual({ levels, codex });
});
