import { expect, test } from '@playwright/test';

for (const scenario of [
  { name: 'the final territory capture heals two lives to full', lives: 2, bossHealth: 0, full: true, boss: false },
  { name: 'a wounded Boss victory', lives: 1, bossHealth: 1, full: false, boss: true },
  { name: 'a final healing capture also defeats the Boss', lives: 2, bossHealth: 1, full: true, boss: true },
  { name: 'territory victory only damages the surviving Boss', lives: 1, bossHealth: 2, full: false, boss: false },
]) test(`reward conditions persist after ${scenario.name}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    // Make the final capture through the real engine. The production won-event
    // handler decides rewards, updates the gallery and writes the save.
    await route.fulfill({ response, body: `${await response.text()}
      window.rewardWin = ({ lives, bossHealth }) => {
        game = new Game(100, 100, { enemies: [], boss: bossHealth ? undefined : null, victory: { territoryPercent: 10 } });
        game.start(); game.lives = lives; game.hitsTaken = 3 - lives;
        if (game.boss) { game.boss.x = 70; game.boss.y = 15; game.boss.previous = { x: 70, y: 15 }; game.bossHealth = bossHealth; }
        game.move('down', true, 30); game.move('right', true, 40); game.move('up', true, 30);
        return { phase: game.phase, lives: game.lives, healed: game.lastCaptureHeal, reason: game.winReason };
      };
    ` });
  });
  await page.clock.install(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.goto('/'); await page.locator('#menu-start').click();
  const result = await page.evaluate(args => (window as unknown as { rewardWin: (args: { lives: number; bossHealth: number }) => {
    phase: string; lives: number; healed: boolean; reason: string;
  } }).rewardWin(args), { lives: scenario.lives, bossHealth: scenario.bossHealth });
  expect(result).toEqual({ phase: 'won', lives: scenario.lives + 1, healed: true, reason: scenario.boss ? 'boss' : 'territory' });
  await page.clock.runFor(4000);
  await expect(page.locator('#charms [data-reward="ninety"]')).toHaveAttribute('aria-label', '满血');
  await expect(page.locator('#charms [data-reward="perfect"]')).toHaveAttribute('aria-label', '击破');
  await expect(page.locator('#charms [data-reward="ninety"]')).toHaveAttribute('aria-pressed', String(scenario.full));
  await expect(page.locator('#charms [data-reward="perfect"]')).toHaveAttribute('aria-pressed', String(scenario.boss));
  const note = page.locator('#reward-note');
  if (scenario.full) await expect(note).toContainText('满血'); else await expect(note).not.toContainText('满血');
  if (scenario.boss) await expect(note).toContainText('击破'); else await expect(note).not.toContainText('击破');
  await page.reload(); await page.locator('#menu-gallery').click();
  for (const [reward, earned, label] of [['ninety', scenario.full, '通关时生命全满'], ['perfect', scenario.boss, '击败 Boss 通关']] as const) {
    const card = page.locator(`.gallery-item[data-level="1"][data-reward="${reward}"]`);
    if (earned) await expect(card).toBeEnabled(); else await expect(card).toBeDisabled();
    await expect(card).toContainText(label);
  }
  expect(errors).toEqual([]);
});
