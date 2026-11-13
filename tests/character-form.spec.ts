import { expect, test } from '@playwright/test';

test('form setting persists across gameplay and gallery previews restore on release', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 3, unlocked: 2, cleared: [1] }));
    localStorage.setItem('linkblock.fenglin.codex', JSON.stringify({ clear: true, ninety: true, perfect: true }));
  });
  await page.goto('/');
  await page.locator('#menu-settings').click();
  await page.locator('#menu-form').click();
  await expect(page.locator('#menu-form')).toHaveText('角色形态：魔物');
  await page.reload();
  await page.locator('#menu-settings').click();
  await expect(page.locator('#menu-form')).toHaveText('角色形态：魔物');
  await page.locator('#menu-gallery').click();
  const card = page.locator('.gallery-item[data-level="1"][data-reward="clear"] img');
  await expect(card).toHaveAttribute('src', /monster\/1\/restored.webp$/);
  const button = page.locator('#gallery-form');
  await button.hover(); await page.mouse.down();
  await expect(card).toHaveAttribute('src', /levels\/1\/v10\/restored.webp$/);
  await page.mouse.up();
  await expect(card).toHaveAttribute('src', /monster\/1\/restored.webp$/);
  await card.click();
  const full = page.locator('#viewer-img');
  await expect(full).toHaveAttribute('src', /monster\/1\/restored.webp$/);
  await page.locator('#viewer-form').focus();
  await page.keyboard.down('Space');
  await expect(full).toHaveAttribute('src', /levels\/1\/v10\/restored.webp$/);
  await page.keyboard.up('Space');
  await expect(full).toHaveAttribute('src', /monster\/1\/restored.webp$/);
  await page.locator('#viewer-close').click();
  await page.locator('#gallery-close').click();
  await page.locator('#menu-levels').click();
  await page.locator('#level-list button[data-level="1"]').click();
  await expect(page.locator('#portrait-img')).toHaveAttribute('src', /monster\/1\/portrait-sealed.webp$/);
});
