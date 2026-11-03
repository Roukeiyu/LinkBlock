import { expect, test } from '@playwright/test';

test('keyboard game: start, draw a complete cut, pause, sound and restart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '连接，划出你的领地。' })).toBeVisible();
  await page.getByRole('button', { name: '开始探索' }).click();
  await expect(page.locator('#state-label')).toHaveText('探索中');
  // The enemy starts in the right half and cannot reach this cut before it closes.
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => Number(await page.locator('.progress-track').getAttribute('aria-valuenow')), { timeout: 7000 }).toBeGreaterThan(0);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('Space');
  await expect(page.locator('#score')).not.toHaveText('000000');
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('heading', { name: '风景会等你。' })).toBeVisible();
  const time = await page.locator('#elapsed').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('#elapsed')).toHaveText(time!);
  await page.getByRole('button', { name: '继续探索' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.getByRole('button', { name: '音效关闭' }).click();
  await expect(page.getByRole('button', { name: '音效开启' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyR');
  await expect(page.locator('#percent')).toHaveText('0.0%');
  await expect(page.locator('#score')).toHaveText('000000');
  await expect(page.locator('#state-label')).toHaveText('探索中');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#state-label')).toHaveText('已暂停');
  expect(errors).toEqual([]);
});

test('reveals the complete landscape on victory and can start a fresh run', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始探索' }).click();
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => Number(await page.locator('.progress-track').getAttribute('aria-valuenow')), { timeout: 7000 }).toBeGreaterThan(0);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('Space');
  for (let i = 0; i < 23; i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await expect(page.getByRole('heading', { name: '这片风景，属于你。' })).toBeVisible({ timeout: 7000 });
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');
  await expect(page.locator('#state-label')).toHaveText('探索完成');
  await expect(page.locator('#overlay-hint')).toHaveText('静谧之湖 · 已解锁完整风景');
  await page.getByRole('button', { name: '再探索一次' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#percent')).toHaveText('0.0%');
  await expect(page.locator('#score')).toHaveText('000000');
});

test('mobile layout and touch controls work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#board')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '开始探索' }).click();
  await page.getByRole('button', { name: '画线：关' }).click();
  await expect(page.getByRole('button', { name: '画线：开' })).toHaveAttribute('aria-pressed', 'true');
  const down = await page.getByRole('button', { name: '向下' }).boundingBox();
  await page.mouse.move(down!.x + down!.width / 2, down!.y + down!.height / 2);
  await page.mouse.down();
  await expect.poll(async () => Number(await page.locator('.progress-track').getAttribute('aria-valuenow')), { timeout: 7000 }).toBeGreaterThan(0);
  await page.mouse.up();
  await page.getByRole('button', { name: '暂停', exact: false }).click();
  await expect(page.getByRole('button', { name: '继续探索' })).toBeVisible();
});
