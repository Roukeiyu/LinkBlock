import { expect, test } from '@playwright/test';

test('menu grid navigation and native audio controls work with the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#menu-levels')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#menu-gallery')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#menu-settings')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu-settings-panel')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#menu-music')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu-music')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#menu-settings-panel')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('#menu-music')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#menu-settings').click();
  await expect(page.locator('#menu-settings-panel')).toBeHidden();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#menu-gallery')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#gallery')).toBeVisible();
  await page.locator('#gallery-close').click();
  await page.locator('#menu-start').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title-screen')).toBeHidden();
  await expect(page.locator('#state-label')).toHaveText('选择起点');
});

test('small portrait menu keeps every entry reachable when settings expand', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  for (const button of await page.locator('.menu-btn').all()) {
    const box = await button.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#menu-settings').click();
  await page.locator('#menu-sfx-volume').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#menu-sfx-volume')).toHaveValue('1');
  await page.locator('#menu-levels').click();
  await expect(page.locator('#level-select')).toBeVisible();
  await page.locator('#levels-close').click();
  await page.locator('#menu-start').click();
  await expect(page.locator('#state-label')).toHaveText('选择起点');
});
