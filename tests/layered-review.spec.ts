import { expect, test } from '@playwright/test';

test('chapter-two experiment shares one plate, exposes real alpha and remains separate from the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/review/level-2-layers.html');
  await expect(page.getByText('独立预览 · 尚未替换游戏素材')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(3);
  const checks = await page.evaluate(async () => {
    async function pixels(src: string) {
      const img = new Image(); img.src = src; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
      return { size: [img.width, img.height], data: ctx.getImageData(0, 0, img.width, img.height).data };
    }
    const base = '../levels/2/layered-preview-v1/';
    const background = await pixels(base + 'background.webp');
    const result = [];
    for (const tier of ['restored', 'ninety', 'perfect']) {
      const [character, composite, alpha] = await Promise.all([
        pixels(base + 'character-' + tier + '.webp'), pixels(base + tier + '.webp'), pixels(base + 'alpha-' + tier + '.png'),
      ]);
      let empty = 0, solid = 0, backgroundMismatch = 0, alphaMismatch = 0;
      for (let i = 0; i < character.data.length; i += 4 * 17) {
        const opacity = character.data[i + 3];
        if (opacity === 0) {
          empty++;
          if ([0, 1, 2].some(c => composite.data[i + c] !== background.data[i + c])) backgroundMismatch++;
        }
        if (opacity >= 240) solid++;
        if (alpha.data[i] !== opacity) alphaMismatch++;
      }
      result.push({ sizes: [background.size, character.size, composite.size, alpha.size], empty, solid, backgroundMismatch, alphaMismatch });
    }
    return result;
  });
  for (const c of checks) {
    expect(c.sizes).toEqual(Array(4).fill([1536, 1024]));
    expect(c.empty).toBeGreaterThan(15000); expect(c.solid).toBeGreaterThan(10000);
    expect(c.backgroundMismatch).toBe(0); expect(c.alphaMismatch).toBe(0);
  }
  await page.getByRole('button', { name: '仅背景', exact: true }).click();
  const plate = await page.locator('#main-stage .plate').getAttribute('src');
  await expect(page.locator('#main-stage .character')).toBeHidden();
  await page.locator('[data-tier="1"]').click();
  await expect(page.locator('#main-stage .plate')).toHaveAttribute('src', plate!);
  await page.getByRole('button', { name: '透明角色', exact: true }).click();
  await expect(page.locator('#main-stage .plate')).toBeHidden();
  await expect(page.locator('#main-stage .character')).toHaveAttribute('src', /character-ninety\.webp$/);
  await page.getByRole('button', { name: 'Alpha 轮廓', exact: true }).click();
  await expect(page.locator('#main-stage .alpha')).toBeVisible();
  await expect(page.locator('#main-stage .character')).toBeHidden();
  await page.getByRole('button', { name: '放大查看' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#full-stage .alpha')).toHaveAttribute('src', /alpha-perfect\.png$/);
  await expect(page.locator('#download-character')).toHaveAttribute('href', /character-perfect\.webp$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewer')).toBeHidden();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.goto('/review/rewards.html');
  const current = page.locator('#levels section[data-level="2"] .grid img');
  await expect(current.nth(0)).toHaveAttribute('src', /levels\/2\/v9\/restored.webp$/);
  await expect(current.nth(1)).toHaveAttribute('src', /levels\/2\/v10\/ninety.webp$/);
  await expect(current.nth(2)).toHaveAttribute('src', /levels\/2\/v9\/perfect.webp$/);
  expect(errors).toEqual([]);
});
