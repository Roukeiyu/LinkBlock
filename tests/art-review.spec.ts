import { expect, test } from '@playwright/test';
import { LEVELS } from '../src/levels';

for (const width of [1280, 390]) {
  test(`completion masks can be reviewed in both forms at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/review/rewards.html');
    const buttons = page.locator('#levels .mask-button');
    const dialog = page.locator('#mask-viewer');
    await expect(buttons).toHaveCount(10);
    for (const monster of [false, true]) {
      if (monster) await page.locator('#form-toggle').click();
      for (const id of [1, 4, 8, 10]) {
        await page.locator('#level-filter').selectOption(String(id));
        const card = page.locator('#levels section:visible figure').first();
        await card.locator('.mask-button').click();
        await expect(dialog).toBeVisible();
        await expect(page.locator('#mask-note')).toContainText('红色区域');
        const mask = monster ? `monster/${id}/mask.png` : LEVELS[id - 1].mask;
        const art = monster ? (id === 10 ? `monster/${id}/restored.webp` : `review/monster-forms/${id}.png`) : LEVELS[id - 1].restored;
        await expect(page.locator('#mask-base')).toHaveAttribute('src', `../${art}`);
        await expect(page.locator('#mask-raw')).toHaveAttribute('src', `../${mask}`);
        await expect(page.locator('#mask-download')).toHaveAttribute('href', `../${mask}`);
        await expect(page.locator('#mask-caption')).toContainText(monster ? '魔物形态' : '人形');
        if (monster && id === 10) await expect(page.locator('#mask-note')).toContainText('游戏中使用的魔物成图');
        const overlay = await page.locator('#mask-overlay').evaluate((canvas: HTMLCanvasElement) => {
          const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
          let colored = 0, clear = 0;
          for (let i = 3; i < data.length; i += 4) data[i] ? colored++ : clear++;
          return { colored, clear };
        });
        expect(overlay.colored).toBeGreaterThan(1000);
        expect(overlay.clear).toBeGreaterThan(1000);
        await page.locator('#mask-show-raw').click();
        await expect(page.locator('#mask-raw')).toBeVisible();
        await expect(page.locator('#mask-overlay')).toBeHidden();
        await page.locator('#mask-show-overlay').click();
        await expect(page.locator('#mask-overlay')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(card.locator('.mask-button')).toBeFocused();
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

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
        expect(size.source).toEqual([768, 512]);
        expect(size.ratio).toBeCloseTo(1.5, 2);
      }
      await expect(page.locator('.dimensions')).toHaveText(Array(30).fill('1536 × 1024'));
    }
    await page.locator('#level-filter').selectOption('10');
    await expect(page.locator('#levels section:visible')).toHaveCount(1);
    const originals = page.locator('#levels section:visible .grid .file');
    const original = '../' + await originals.first().textContent();
    expect(original).toContain(pageName === 'rewards' ? LEVELS[9].restored : LEVELS[9].sprites.tree);
    await page.locator('#levels section:visible figure > button').first().click();
    await expect(page.locator('#viewer')).toBeVisible();
    await expect(page.locator('#download')).toHaveAttribute('href', new URL(original!, page.url()).href);
    const perLevel = count / 10;
    const visibleImages = page.locator('#levels section:visible .grid img');
    const sourceAt = async (index: number) => '../' + await originals.nth(index).textContent();
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
    await assertCurrent(perLevel - 1, perLevel, await sourceAt(perLevel - 1), (await visibleImages.last().getAttribute('alt'))!);
    await page.keyboard.press('ArrowRight');
    await assertCurrent(0, perLevel, original!, (await visibleImages.first().getAttribute('alt'))!);
    await page.getByRole('button', { name: '下一张', exact: true }).click();
    await assertCurrent(1, perLevel, await sourceAt(1), (await visibleImages.nth(1).getAttribute('alt'))!);
    await page.keyboard.press('Escape');
    await expect(page.locator('#viewer')).not.toBeVisible();
    await expect(page.locator('#levels section:visible figure > button').first()).toBeFocused();
    // With all levels visible, arrows cross chapter boundaries and wrap the catalog.
    await page.locator('#level-filter').selectOption('all');
    await page.locator('#levels figure > button').first().click();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#position')).toHaveText(`${count} / ${count}`);
    await expect(page.locator('#full')).toHaveAttribute('src', '../' + await page.locator('#levels .grid .file').last().textContent());
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#position')).toHaveText(`1 / ${count}`);
    await page.locator('#close').click();
    await page.locator('#levels figure > button').nth(perLevel - 1).click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#full')).toHaveAttribute('src', '../' + await page.locator('#levels .grid .file').nth(perLevel).textContent());
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

for (const width of [1280, 390]) {
  test(`review switches all rewards and downloads without losing place at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/review/rewards.html');
    const images = page.locator('#levels .grid img');
    const toggle = page.locator('#form-toggle');
    const previewPaths = (form: string) => LEVELS.flatMap(l => ['restored', 'ninety', 'perfect'].map(kind => `review/previews/${l.id}-${kind}-${form}.webp`));
    const humanPaths = previewPaths('human'), monsterPaths = previewPaths('monster');
    const assertImages = async (paths: string[]) => {
      await expect(images).toHaveCount(30);
      await images.evaluateAll(imgs => imgs.forEach(image => {
        const img = image as HTMLImageElement;
        img.loading = 'eager';
      }));
      await expect.poll(() => images.evaluateAll((imgs, expected) => imgs.every((image, index) => {
        const img = image as HTMLImageElement;
        return img.getAttribute('src') === `../${expected[index]}` &&
          img.currentSrc === new URL(`../${expected[index]}`, document.baseURI).href &&
          img.complete && img.naturalWidth === 768 && img.naturalHeight === 512;
      }), paths), { timeout: 30000, message: 'All selected reward previews should load at their preview size' }).toBe(true);
    };
    await assertImages(humanPaths);
    const dock = page.locator('#form-dock');
    const dockToggle = page.locator('#dock-toggle');
    const initial = (await dock.boundingBox())!;
    expect(initial.y).toBeGreaterThan(844 / 2);
    expect(initial.x + initial.width).toBeCloseTo(width, 0);
    await dockToggle.click();
    await expect(dockToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeHidden();
    const collapsed = (await dock.boundingBox())!;
    expect(collapsed.width).toBeLessThan(initial.width);
    expect(collapsed.x + collapsed.width).toBeCloseTo(width, 0);
    await dockToggle.click();
    await expect(dockToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto';window.scrollTo(0, 1500); });
    const scroll = await page.evaluate(() => scrollY);
    const scrolled = (await dock.boundingBox())!;
    expect(scrolled.x).toBe(initial.x);
    expect(scrolled.y).toBe(initial.y);
    expect(scrolled.x + scrolled.width).toBeCloseTo(width, 0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#form-status')).toContainText('魔物形态');
    await assertImages(monsterPaths);
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
    await page.locator('#level-filter').selectOption('4');
    await expect(page.locator('#levels section:visible')).toHaveCount(1);
    await page.locator('#levels section:visible figure > button').nth(1).click();
    await expect(page.locator('#position')).toHaveText('2 / 3');
    await expect(page.locator('#full')).toHaveAttribute('src', '../review/monster-forms/4-ninety.png');
    await expect(page.locator('#download')).toHaveAttribute('download', 'level-4-4-ninety.png');
    await page.locator('#viewer-form-toggle').click();
    await expect(page.locator('#full')).toHaveAttribute('src', `../${LEVELS[3].rewardNinety}`);
    await expect(page.locator('#caption')).toContainText('人形');
    await expect(page.locator('#position')).toHaveText('2 / 3');
    await assertImages(humanPaths);
    await page.locator('#viewer-form-toggle').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#full')).toHaveAttribute('src', '../review/monster-forms/4-perfect.png');
    await expect(page.locator('#download')).toHaveAttribute('href', new URL('../review/monster-forms/4-perfect.png', page.url()).href);
    await page.keyboard.press('Escape');
    await expect(page.locator('#level-filter')).toHaveValue('4');
    await page.reload();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await assertImages(monsterPaths);
    await toggle.click();
    await assertImages(humanPaths);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('nearby previews preload and wait for decoding without stale switches', async ({ page }) => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  const originalRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/review/monster-forms/') || request.url().includes('/levels/1/v10/restored.webp')) originalRequests.push(request.url());
  });
  await page.route('**/review/previews/1-restored-monster.webp', async route => {
    requested = true;
    await blocked;
    await route.continue();
  });
  try {
    await page.goto('/review/rewards.html', { waitUntil: 'domcontentloaded' });
    const card = page.locator('#levels figure').first(), img = card.locator('img');
    await card.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute('src', '../review/previews/1-restored-human.webp');
    await expect.poll(() => requested).toBe(true);
    expect(originalRequests).toEqual([]);
    const toggle = page.locator('#form-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(img).toHaveAttribute('src', '../review/previews/1-restored-human.webp');
    await expect(card.locator('figcaption')).toContainText('人形');
    await toggle.click();
    release();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(img).toHaveAttribute('src', '../review/previews/1-restored-human.webp');
    await toggle.click();
    await expect(img).toHaveAttribute('src', '../review/previews/1-restored-monster.webp');
    await expect(card.locator('figcaption')).toContainText('魔物形态');
    await card.locator(':scope > button').click();
    await expect(page.locator('#full')).toHaveAttribute('src', '../review/monster-forms/1.png');
    await expect(page.locator('#download')).toHaveAttribute('href', new URL('../review/monster-forms/1.png', page.url()).href);
  } finally { release(); }
});

test('loads visible previews first, then retains all forms for later comparisons', async ({ page }) => {
  // Intercepting a request disables the browser HTTP cache. Count the page's
  // preloader objects instead of network events, which can include revalidation
  // or refetches when Chromium evicts an image under memory pressure.
  await page.addInitScript(() => {
    const original = window.Image;
    (window as any).__previewImagesCreated = 0;
    window.Image = new Proxy(original, {
      construct(target, args, newTarget) {
        (window as any).__previewImagesCreated++;
        return Reflect.construct(target, args, newTarget);
      },
    });
  });
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let visibleRequested = false;
  const requested: string[] = [], completed = new Set<string>();
  page.on('request', request => {
    if (request.url().includes('/review/previews/')) requested.push(new URL(request.url()).pathname);
  });
  page.on('requestfinished', request => {
    if (request.url().includes('/review/previews/')) completed.add(new URL(request.url()).pathname);
  });
  await page.route('**/review/previews/1-restored-monster.webp', async route => {
    visibleRequested = true;
    await blocked;
    await route.continue();
  });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/review/rewards.html', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => visibleRequested).toBe(true);
    expect(requested.some(path => path.endsWith('/10-perfect-monster.webp'))).toBe(false);
    release();
    await expect.poll(() => completed.size, { timeout: 30000 }).toBe(60);
    const before = await page.evaluate(() => (window as any).__previewImagesCreated);
    expect(before).toBe(60);
    await page.locator('#levels section').last().scrollIntoViewIfNeeded();
    await page.locator('#form-toggle').click();
    await expect(page.locator('#levels section').last().locator('img').last())
      .toHaveAttribute('src', '../review/previews/10-perfect-monster.webp');
    await page.locator('#form-toggle').click();
    await page.locator('#form-toggle').click();
    await expect(page.locator('#levels section').last().locator('img').last())
      .toHaveAttribute('src', '../review/previews/10-perfect-monster.webp');
    const last = page.locator('#levels section').last().locator('img').last();
    await expect.poll(() => last.evaluate((img: HTMLImageElement) =>
      img.complete && img.naturalWidth === 768 && img.naturalHeight === 512)).toBe(true);
    expect(await page.evaluate(() => (window as any).__previewImagesCreated)).toBe(before);
  } finally { release(); }
});

test.describe('touch review navigation', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('horizontal swipes change images while vertical gestures do not', async ({ page }) => {
    await page.goto('/review/rewards.html');
    await page.locator('#level-filter').selectOption('7');
    await page.locator('#levels section:visible figure > button').first().click();
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
    const reviewRequests: string[] = [];
    page.on('request', request => { if (request.url().includes('/review/monster-forms/')) reviewRequests.push(request.url()); });
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
    expect(reviewRequests).toEqual([]);
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
