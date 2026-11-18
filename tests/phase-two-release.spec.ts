import { expect, test } from '@playwright/test';
import { LEVELS } from '../src/levels';

for (const form of ['human', 'monster'] as const) {
  test(`phase-two ${form} artwork and mask load in the actual opening`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(characterForm => {
      localStorage.setItem('linkblock.fenglin.character-form', characterForm);
      localStorage.setItem('linkblock.fenglin.levels', JSON.stringify({ version: 3, unlocked: 20, cleared: [] }));
    }, form);
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}
        window.startApprovedLevel = id => beginLevel(id);
        window.approvedLevelState = () => ({
          restored: restored.src, sealed: ruined.src, mask: charMaskImage?.src,
          maskLoaded: !!game.completionMask, opening: game.opening?.region,
          face: gameOptionsFor(current, monsterForm).openingFace,
        });
        window.confirmApprovedOpening = () => { game.confirmOpening(); sync(); render(performance.now()); };` });
    });
    await page.goto('/');
    for (let level = 11; level <= 20; level++) {
      await page.evaluate(id => (window as any).startApprovedLevel(id), level);
      const state = () => page.evaluate(() => (window as any).approvedLevelState());
      await expect.poll(async () => (await state()).maskLoaded).toBe(true);
      const current = await state();
      const art = LEVELS[level - 1];
      expect(new URL(current.restored).pathname).toBe('/' + (form === 'monster' ? `monster/${level}/restored.webp` : art.restored));
      expect(new URL(current.sealed).pathname).toBe('/' + (form === 'monster' ? `monster/${level}/sealed.webp` : art.sealed));
      expect(new URL(current.mask).pathname).toBe('/' + (form === 'monster' ? `monster/${level}/mask.png` : art.mask));
      const xs = current.opening.map((p: { x: number }) => p.x), ys = current.opening.map((p: { y: number }) => p.y);
      expect(Math.max(...xs) < current.face.left * 72 || Math.min(...xs) > current.face.right * 72 ||
        Math.max(...ys) < current.face.top * 48 || Math.min(...ys) > current.face.bottom * 48).toBe(true);
      await page.evaluate(() => (window as any).confirmApprovedOpening());
      if ([16, 19].includes(level)) await page.screenshot({ path: `test-results/phase-two-${level}-${form}.png` });
    }
  });
}
