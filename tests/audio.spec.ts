import { expect, test } from '@playwright/test';
import { LEVELS } from '../src/levels';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`Suno tracks switch, loop, mute and preserve volume at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 3, unlocked: 10, cleared: [1,2,3,4,5,6,7,8,9] })));
    await page.reload();
    for (const level of LEVELS.slice(4)) {
      await page.locator('#menu-levels').click();
      await page.locator(`#level-list [data-level="${level.id}"]`).click();
      const track = page.locator('audio');
      await expect(track).toHaveCount(1);
      await expect(track).toHaveAttribute('src', new RegExp(`${level.music}\\.ogg$`));
      await expect.poll(() => track.evaluate((a: HTMLAudioElement) => a.readyState)).toBeGreaterThanOrEqual(2);
      await expect.poll(() => track.evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0)).toBe(true);
      expect(await track.evaluate((a: HTMLAudioElement) => a.loop && a.duration > 140 && a.duration < 155)).toBe(true);
      // Seek near the end and verify an actual media loop, not just loop=true.
      await track.evaluate((a: HTMLAudioElement) => { a.currentTime = a.duration - .15; });
      await expect.poll(() => track.evaluate((a: HTMLAudioElement) => a.currentTime), { timeout: 10000 }).toBeLessThan(3);
      await page.locator('#music').click();
      await expect.poll(() => track.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
      await page.locator('#music').click();
      await expect.poll(() => track.evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true);
      await page.locator('#music-volume').evaluate((el: HTMLInputElement) => { el.value = '35'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('linkblock.fenglin.audio')!).musicVolume)).toBe(.35);
      await page.locator('#home').click();
    }
    await page.reload();
    await page.locator('#menu-settings').click();
    await expect(page.locator('#menu-music-volume')).toHaveValue('35');
  });
}

test('all six MP3 fallbacks decode and play in the actual music controller', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const canPlay = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function(type: string) {
      return type.includes('ogg') ? '' : canPlay.call(this, type);
    };
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 3, unlocked: 10, cleared: [1,2,3,4,5,6,7,8,9] })));
  await page.reload();
  for (const level of LEVELS.slice(4)) {
    await page.locator('#menu-levels').click();
    await page.locator(`#level-list [data-level="${level.id}"]`).click();
    const track = page.locator('audio');
    await expect(track).toHaveAttribute('src', new RegExp(`${level.music}\\.mp3$`));
    await expect.poll(() => track.evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0)).toBe(true);
    expect(await track.evaluate((a: HTMLAudioElement) => a.error)).toBeNull();
    await page.locator('#home').click();
  }
});
