import { expect, test } from '@playwright/test';

test('ambient particle loops never create a transient title scrollbar', async ({ page }) => {
  for (const [width, height] of [[1280, 800], [390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#title-screen img').evaluateAll(images =>
      Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    const overflow = await page.evaluate(() => {
      const title = document.querySelector<HTMLElement>('#title-screen')!;
      const animations = [...document.querySelectorAll('.dust i')].flatMap(el => el.getAnimations());
      animations.forEach(animation => animation.pause());
      // Inspect entry, travel and the loop boundary without missing a short flash.
      return [0, .005, .02, .5, .995, 1, 1.005].map(progress => {
        for (const animation of animations) {
          const timing = animation.effect!.getTiming();
          animation.currentTime = (timing.delay ?? 0) + Number(timing.duration) * progress;
        }
        return { progress, x: title.scrollWidth - title.clientWidth, y: title.scrollHeight - title.clientHeight };
      }).filter(sample => sample.x > 0 || sample.y > 0);
    });
    expect(overflow, `title overflow at ${width}×${height}`).toEqual([]);
  }
});

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
