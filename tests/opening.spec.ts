import { expect, test } from '@playwright/test';

// Face centres measured from the actual artwork, independent of opening bounds.
const faceCentres = [[.47, .18], [.49, .19], [.37, .20], [.37, .20], [.34, .17],
  [.47, .15], [.49, .15], [.46, .14], [.49, .15], [.47, .16]];

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`all level openings keep faces hidden at 30 Hz on ${viewport.width}px screens`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 3, unlocked: 10, cleared: [] })));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        window.readOpening = () => ({ phase: game.phase, opening: game.opening,
          face: gameOptionsFor(current).openingFace, captured: game.captured, sealed: ruined.src,
          facePixelDifference: window.checkOpeningFace?.() ?? 0 });` });
    });
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    const read = () => page.evaluate(() => (window as unknown as { readOpening: () => {
      phase: string; sealed: string; facePixelDifference: number;
      opening: { region: { x: number; y: number }[]; candidates: number };
      face: { left: number; top: number; right: number; bottom: number };
      captured: { x: number; y: number }[][];
    } }).readOpening());
    const safe = (region: { x: number; y: number }[], face: Awaited<ReturnType<typeof read>>['face']) => {
      const xs = region.map(p => p.x), ys = region.map(p => p.y);
      expect(Math.max(...xs) < face.left * 72 || Math.min(...xs) > face.right * 72
        || Math.max(...ys) < face.top * 48 || Math.min(...ys) > face.bottom * 48).toBe(true);
    };
    for (let level = 1; level <= 10; level++) {
      await page.goto('/');
      await page.locator('#menu-levels').click();
      await page.locator(`#level-list [data-level="${level}"]`).click();
      await page.clock.runFor(16);
      let state = await read();
      expect(state.phase).toBe('opening'); safe(state.opening.region, state.face);
      await page.evaluate(async ({ sealed, centre }) => {
        const image = new Image(); image.src = sealed; await image.decode();
        const board = document.querySelector<HTMLCanvasElement>('#board')!;
        const reference = document.createElement('canvas');
        reference.width = board.width; reference.height = board.height;
        const scale = Math.min((board.width - 24) / 72, (board.height - 24) / 48);
        const ox = (board.width - 72 * scale) / 2, oy = (board.height - 48 * scale) / 2;
        const context = reference.getContext('2d')!;
        context.translate(ox, oy); context.scale(scale, scale); context.drawImage(image, 0, 0, 72, 48);
        // Compare an eyes-to-mouth patch against the sealed plate on every tick.
        const x = Math.round(ox + (centre[0] - .035) * 72 * scale);
        const y = Math.round(oy + (centre[1] - .04) * 48 * scale);
        const width = Math.round(.07 * 72 * scale), height = Math.round(.08 * 48 * scale);
        const expected = context.getImageData(x, y, width, height).data;
        (window as unknown as { checkOpeningFace: () => number }).checkOpeningFace = () => {
          const actual = board.getContext('2d')!.getImageData(x, y, width, height).data;
          return actual.reduce((max, value, i) => Math.max(max, Math.abs(value - expected[i])), 0);
        };
      }, { sealed: state.sealed, centre: faceCentres[level - 1] });
      for (let tick = 1; tick < 150; tick++) {
        await page.clock.runFor(Math.round(tick * 1000 / 30) - Math.round((tick - 1) * 1000 / 30)); state = await read();
        expect(state.phase).toBe('opening'); safe(state.opening.region, state.face);
        expect(state.facePixelDifference, `level ${level}, candidate ${state.opening.candidates}`).toBeLessThanOrEqual(2);
        if (tick === 30) expect(state.opening.candidates).toBe(31);
      }
      expect(state.opening.candidates).toBe(150);
      const selected = state.opening.region;
      if (level % 2) {
        await page.locator('#board').focus(); await page.keyboard.press('Space');
      } else await page.clock.runFor(34);
      state = await read(); expect(state.phase).toBe('playing');
      expect(state.captured[0]).toEqual(selected);
      for (const region of state.captured) safe(region, state.face);
      if (level === 1) {
        await page.keyboard.press('KeyR'); state = await read();
        expect(state.phase).toBe('opening'); expect(state.opening.candidates).toBe(1);
        safe(state.opening.region, state.face);
        await page.screenshot({ path: `test-results/opening-face-safe-${viewport.width}.png`, fullPage: true });
      }
    }
  });
}
