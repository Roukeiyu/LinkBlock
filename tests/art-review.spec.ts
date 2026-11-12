import { expect, test } from '@playwright/test';
import { LEVELS } from '../src/levels';

for (const [pageName, count] of [['rewards', 30], ['enemies', 60]] as const) {
  test(`${pageName} review loads every current image and opens the original`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/review/${pageName}.html`);
    await expect(page.locator('#levels section')).toHaveCount(10);
    await expect(page.locator('#levels img')).toHaveCount(count);
    // Trigger lazy assets, including the final chapters below the viewport.
    const broken = await page.locator('#levels img').evaluateAll(async images => {
      await Promise.all(images.map(image => {
        const img = image as HTMLImageElement;
        img.loading = 'eager';
        return img.decode().catch(() => {});
      }));
      return images.filter(image => !(image as HTMLImageElement).naturalWidth).map(image => (image as HTMLImageElement).src);
    });
    expect(broken).toEqual([]);
    if (pageName === 'rewards') {
      const sizes = await page.locator('#levels img').evaluateAll(images => images.map(image => {
        const img = image as HTMLImageElement, box = img.getBoundingClientRect();
        return { source: [img.naturalWidth, img.naturalHeight], ratio: box.width / box.height };
      }));
      for (const size of sizes) {
        expect(size.source).toEqual([1536, 1024]);
        expect(size.ratio).toBeCloseTo(1.5, 2);
      }
      await expect(page.locator('.dimensions')).toHaveText(Array(30).fill('1536 × 1024'));
    }
    await page.locator('#level-filter').selectOption('10');
    await expect(page.locator('#levels section:visible')).toHaveCount(1);
    const original = await page.locator('#levels section:visible img').first().getAttribute('src');
    expect(original).toContain(pageName === 'rewards' ? LEVELS[9].restored : LEVELS[9].sprites.tree);
    await page.locator('#levels section:visible figure button').first().click();
    await expect(page.locator('#viewer')).toBeVisible();
    await expect(page.locator('#download')).toHaveAttribute('href', new URL(original!, page.url()).href);
    const perLevel = count / 10;
    const visibleImages = page.locator('#levels section:visible .grid img');
    const assertCurrent = async (index: number, total: number, source: string, label: string) => {
      await expect(page.locator('#position')).toHaveText(`${index + 1} / ${total}`);
      await expect(page.locator('#full')).toHaveAttribute('src', source);
      await expect(page.locator('#full')).toHaveAttribute('alt', label);
      await expect(page.locator('#caption')).toHaveText(label);
      await expect(page.locator('#download')).toHaveAttribute('href', new URL(source, page.url()).href);
      await expect(page.locator('#download')).toHaveAttribute('download', `level-10-${source.split('/').pop()}`);
    };
    // A filtered viewer loops within this level, and keeps captions/downloads in sync.
    await page.getByRole('button', { name: '上一张', exact: true }).click();
    await assertCurrent(perLevel - 1, perLevel, (await visibleImages.last().getAttribute('src'))!, (await visibleImages.last().getAttribute('alt'))!);
    await page.keyboard.press('ArrowRight');
    await assertCurrent(0, perLevel, original!, (await visibleImages.first().getAttribute('alt'))!);
    await page.getByRole('button', { name: '下一张', exact: true }).click();
    await assertCurrent(1, perLevel, (await visibleImages.nth(1).getAttribute('src'))!, (await visibleImages.nth(1).getAttribute('alt'))!);
    await page.keyboard.press('Escape');
    await expect(page.locator('#viewer')).not.toBeVisible();
    await expect(page.locator('#levels section:visible figure button').first()).toBeFocused();
    // With all levels visible, arrows cross chapter boundaries and wrap the catalog.
    await page.locator('#level-filter').selectOption('all');
    await page.locator('#levels figure button').first().click();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#position')).toHaveText(`${count} / ${count}`);
    await expect(page.locator('#full')).toHaveAttribute('src', (await page.locator('#levels .grid img').last().getAttribute('src'))!);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#position')).toHaveText(`1 / ${count}`);
    await page.locator('#close').click();
    await page.locator('#levels figure button').nth(perLevel - 1).click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#full')).toHaveAttribute('src', (await page.locator('#levels .grid img').nth(perLevel).getAttribute('src'))!);
    await page.locator('#close').click();
    if (pageName === 'enemies') {
      await page.locator('#animation-toggle').click();
      await expect(page.locator('#animation-toggle')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('[data-frame]')).toHaveCount(4);
      const frames = await page.locator('[data-frame]').evaluateAll(canvases => canvases.map(c => (c as HTMLCanvasElement).toDataURL()));
      expect(new Set(frames).size).toBe(4);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(errors).toEqual([]);
  });
}

test.describe('touch review navigation', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('horizontal swipes change images while vertical gestures do not', async ({ page }) => {
    await page.goto('/review/rewards.html');
    await page.locator('#level-filter').selectOption('7');
    await page.locator('#levels section:visible figure button').first().click();
    await page.locator('#full').evaluate((img: HTMLImageElement) => img.decode());
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (dx: number, dy: number) => {
      const box = (await page.locator('#full').boundingBox())!;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 5; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 5, y: y + dy * step / 5 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(-100, 0);
    await expect(page.locator('#position')).toHaveText('2 / 3');
    await expect(page.locator('#full')).toHaveAttribute('src', `../${LEVELS[6].rewardNinety}`);
    await swipe(100, 0);
    await expect(page.locator('#position')).toHaveText('1 / 3');
    await swipe(0, -65);
    await expect(page.locator('#position')).toHaveText('1 / 3');
    await page.getByRole('button', { name: '上一张', exact: true }).click();
    await expect(page.locator('#position')).toHaveText('3 / 3');
    expect(await page.locator('#viewer').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await cdp.detach();
  });
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`gallery cards and enlarged rewards keep the same canvas at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      const ids = Array.from({ length: 10 }, (_, i) => i + 1);
      const earned = { clear: true, ninety: true, perfect: true };
      localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 3, unlocked: 10, cleared: ids }));
      localStorage.setItem('linkblock.fenglin.codex', JSON.stringify({ ...earned,
        levels: Object.fromEntries(ids.slice(1).map(id => [id, earned])) }));
    });
    await page.goto('/');
    await page.locator('#menu-gallery').click();
    const images = page.locator('.gallery-item > img');
    await expect(images).toHaveCount(30);
    const sizes = await images.evaluateAll(async images => Promise.all(images.map(async image => {
      const img = image as HTMLImageElement; img.loading = 'eager'; await img.decode();
      const box = img.getBoundingClientRect();
      return { src: img.getAttribute('src'), natural: [img.naturalWidth, img.naturalHeight], ratio: box.width / box.height };
    })));
    const paths = LEVELS.flatMap(level => [level.restored, level.rewardNinety, level.rewardPerfect]);
    for (let i = 0; i < sizes.length; i++) {
      expect(sizes[i].src).toContain(paths[i]);
      expect(sizes[i].natural).toEqual([1536, 1024]);
      expect(sizes[i].ratio).toBeCloseTo(1.5, 2);
    }
    for (const index of [0, 1, 2, 26, 29]) {
      await page.locator('.gallery-item').nth(index).click();
      await expect(page.locator('#viewer')).toBeVisible();
      const bounds = await page.locator('#viewer-img').evaluate(async (img: HTMLImageElement) => {
        await img.decode(); const box = img.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
      expect(bounds.width / bounds.height).toBeCloseTo(1.5, 2);
      expect(bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.height).toBeLessThanOrEqual(viewport.height - 96);
      await page.locator('#viewer-close').click();
    }
  });
}

test('player uses four frames, freezes on pause, and respects reduced motion', async ({ page }) => {
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.battle = () => game;` });
  });
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    const samples: number[] = [];
    Object.assign(window, { spiritSamples: samples });
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
      if (args[0] instanceof HTMLImageElement && args[0].src.endsWith('/sprites/player-spirit.webp')) {
        samples.push(args[1]);
      }
      return Reflect.apply(draw, this, args);
    };
  });
  await page.goto('/');
  await page.clock.install();
  await page.locator('#menu-start').click();
  await page.keyboard.press('Space');
  await expect(page.locator('#state-label')).toHaveText('探索中');
  await page.evaluate(() => {
    const game = window.battle();
    game.enemies = []; game.boss = undefined; game.hazards = []; game.protection = 0;
  });
  const samples = () => page.evaluate(() => [...new Set((window as unknown as { spiritSamples: number[] }).spiritSamples)]);
  const reset = () => page.evaluate(() => { (window as unknown as { spiritSamples: number[] }).spiritSamples.length = 0; });
  await page.clock.runFor(850);
  expect((await samples()).length).toBe(4);
  await page.keyboard.press('KeyP');
  await expect(page.locator('#overlay')).toBeVisible();
  expect(await page.locator('.overlay-card').evaluate(e => getComputedStyle(e).borderImageSource)).toContain('torn-parchment.webp');
  expect(await page.locator('.overlay-card').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await reset(); await page.clock.runFor(850);
  expect((await samples()).length).toBe(1);
  await page.locator('#primary').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(40); await reset(); await page.clock.runFor(850);
  expect(await samples()).toEqual([0]);
});
