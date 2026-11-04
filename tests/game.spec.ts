import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

type Probe = { joystickPoint: { x: number; y: number }; player: { x: number; y: number }; positions: { x: number; y: number; time: number }[]; white: number; particles: number; flash: string; boundary: { x: number; y: number }[]; trail: { x: number; y: number }[]; shots: { x: number; y: number }[]; enemyColors: string[]; enemyBodies: { x: number; y: number; color: string; angle: number }[]; bossRadius: number; warningFrame: string; warningShots: number; warningAngles: number[]; defeatFrame: string; awards: { text: string; color: string }[]; jumpScales: number[]; jumpShadows: number };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { probe: Probe }).probe);
async function worldPixel(page: Page, x: number, y: number) {
  return page.locator('#board').evaluate((canvas: HTMLCanvasElement, p) => {
    const scale = Math.min((canvas.width - 24) / 72, (canvas.height - 24) / 48);
    return [...canvas.getContext('2d')!.getImageData(Math.round((canvas.width - 72 * scale) / 2 + p.x * scale), Math.round((canvas.height - 48 * scale) / 2 + p.y * scale), 1, 1).data].slice(0, 3);
  }, { x, y });
}
async function moveClock(page: Page, key: string, done: (p: Probe['player']) => boolean) {
  await page.keyboard.down(key);
  for (let i = 0; i < 200 && !done((await probe(page)).player); i++) await page.clock.runFor(16);
  expect(done((await probe(page)).player), JSON.stringify({ player: (await probe(page)).player, trail: (await probe(page)).trail, progress: await page.locator('#percent').textContent(), lives: await page.locator('#lives').getAttribute('aria-label') })).toBe(true);
  await page.keyboard.up(key);
}
async function hold(page: Page, key: string, duration: number) {
  await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key);
}
async function firstCut(page: Page) {
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await probe(page)).player.y, { timeout: 6000, intervals: [16] }).toBe(48);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('Space');
}
async function encloseRoster(page: Page) {
  // A slightly off-centre cut claims the populated smaller side, including Boss.
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 30 && (await probe(page)).player.x < 40; i++) await page.clock.runFor(16);
  await page.keyboard.up('ArrowRight'); expect((await probe(page)).player.x).toBeGreaterThanOrEqual(40);
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowDown');
  for (let i = 0; i < 60 && (await probe(page)).player.y < 48; i++) await page.clock.runFor(100);
  expect((await probe(page)).player.y).toBe(48);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('Space'); await page.clock.runFor(250);
}
test.beforeEach(async ({ page }, info) => {
  const randomOpening = info.title.includes('random opening'), islandPlay = info.title.includes('island coast');
  if ((randomOpening || islandPlay || info.title.includes('enclosed image')) && info.title.includes('phone')) await page.setViewportSize({ width: 390, height: 844 });
  if (info.title.includes('notice safe area') || info.title.includes('wide touchpad safe area')) await page.route('**/src/style.css*', async route => {
    const response = await route.fetch();
    // Exercise the real layout rules with the values Safari supplies for a
    // notched screen. Chromium here does not expose native safe-area emulation.
    const insets = { top: 44, bottom: 34, left: 20, right: 20 };
    await route.fulfill({ response, body: (await response.text()).replace(/env\(safe-area-inset-(top|bottom|left|right)\)/g, (_, edge: keyof typeof insets) => `${insets[edge]}px`) });
  });
  const phasePreview = /configured phase ([23])/.exec(info.title)?.[1];
  const controlled = randomOpening || islandPlay || info.title.includes('boss damage jump') || info.title.includes('enclosing a normal') || Boolean(phasePreview) || info.title.includes('cross and X') || info.title.includes('enclosed image');
  if (!randomOpening) {
    // Fixed scene fixtures keep input/capture/effect regressions independent of
    // random hazards. Dedicated opening tests below use the unchanged real app.
    await page.route('**/src/engine.ts', async route => {
      const response = await route.fetch();
      let body = await response.text();
      if (islandPlay) body = body
        .replace('const region = this.opening.region;', 'const region = [{x:18,y:18},{x:30,y:18},{x:30,y:30},{x:18,y:30}];')
        .replace('this.player = openingSpawn(region, this.random);', 'this.player = {x:24,y:18};')
        .replace('advanceEnemy(body, dt, this.territories, walls)', 'advanceEnemy(body, 0, this.territories, walls)');
      else body = body.replace('options.opening ?? false', 'false').replaceAll('this.options.opening', 'false')
        .replace('defaultBoss(this.width, this.height)', "createEnemy('boss', { x: this.width * 0.84, y: this.height * 0.76 })");
      body = body.replace('defaultEnemies(this.width, this.height, this.boss, this.random,', 'fixtureEnemies(this.width, this.height, this.boss, this.random,');
      body += "\nfunction fixtureEnemies(width, height) { return ['straight', 'orbit', 'zigzag'].flatMap((kind, row) => [0.58, 0.73, 0.88].map(x => createEnemy(kind, { x: width*x, y: height*[0.25,0.51,0.76][row] }))); }";
      if (info.title.includes('internal seam')) {
        // Reproduce a sub-tolerance contact with the real geometry. Browser
        // frame timing cannot reliably land within 2.5e-8 world units of shore.
        body += '\nconst confirmForSeam = Game.prototype.confirmOpening; Game.prototype.confirmOpening = function() { const selected = confirmForSeam.call(this); if (selected) { this.player={x:30,y:22}; this.anchor={...this.player}; this.move("right",true,4); this.move("down",true,4); this.move("left",true,4-2.5e-8); } return selected; };';
      }
      if (info.title.includes('frame departure')) body = body.replace('this.bossAttack.update(dt,', 'this.bossAttack.update(0,');
      if (info.title.includes('enclosed image')) body = body
        .replace('advanceEnemy(body, dt, this.territories, walls)', 'advanceEnemy(body, 0, this.territories, walls)')
        .replace('this.boss = options.boss === null ?', 'this.boss = true ?');
      if (phasePreview) body = body.replace(/this\.bossHealth = this\.bossMaxHealth/g, `this.bossHealth = ${phasePreview === '2' ? 3 : 1}`);
      await route.fulfill({ response, body });
    });
  }
  if (controlled) await page.clock.install({ time: new Date('2026-11-03T00:00:00Z') });
  // Observe the real canvas drawing commands without adding debug APIs to the app.
  await page.addInitScript(() => {
    const state = { joystickPoint: { x: 0, y: 0 }, player: { x: 0, y: 0 }, positions: [] as { x: number; y: number; time: number }[], white: 0, particles: 0, flash: '', boundary: [] as { x: number; y: number }[], trail: [] as { x: number; y: number }[], shots: [] as { x: number; y: number }[], enemyColors: [] as string[], enemyBodies: [] as { x: number; y: number; color: string; angle: number }[], bossRadius: 0, warningFrame: '', warningShots: -1, warningAngles: [] as number[], defeatFrame: '', awards: [] as { text: string; color: string }[], jumpScales: [] as number[], jumpShadows: 0 };
    (window as unknown as { probe: typeof state }).probe = state;
    for (const type of ['pointerdown', 'pointermove']) document.addEventListener(type, event => {
      const e = event as PointerEvent;
      if (e.target instanceof Element && e.target.closest('#joystick')) state.joystickPoint = { x: e.clientX, y: e.clientY };
    });
    const paths = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }[]>();
    const translations = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }>();
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'clearRect', 'translate'] as const) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function(this: CanvasRenderingContext2D, ...args: number[]) {
        if (method === 'clearRect' && this.canvas.id === 'board') { state.trail = []; state.shots = []; state.enemyColors = []; state.enemyBodies = []; state.jumpScales = []; state.jumpShadows = 0; state.warningAngles = []; }
        if (method === 'translate') translations.set(this, { x: args[0], y: args[1] });
        if (method === 'beginPath') paths.set(this, []);
        if (method === 'moveTo' || method === 'lineTo') paths.get(this)?.push({ x: args[0], y: args[1] });
        if (method === 'stroke' && this.strokeStyle === '#ffcf75') state.trail = [...(paths.get(this) ?? [])];
        if (method === 'stroke' && this.strokeStyle === '#79edc9') state.boundary = [...(paths.get(this) ?? [])];
        if (method === 'stroke' && this.strokeStyle === '#ffe0c6' && paths.get(this)?.length === 2) { const p = paths.get(this)![0]; state.warningAngles.push(Math.atan2(p.y, p.x)); }
        if (method === 'stroke' && this.strokeStyle === '#ffa56e' && paths.get(this)?.length === 6) state.bossRadius = Math.max(...paths.get(this)!.map(p => Math.hypot(p.x, p.y)));
        return Reflect.apply(original, this, args);
      } as never;
    }
    let warningScheduled = false;
    const scale = CanvasRenderingContext2D.prototype.scale;
    CanvasRenderingContext2D.prototype.scale = function(x, y) {
      if (x > 1 && x < 1.4 && x === y) state.jumpScales.push(x);
      return scale.call(this, x, y);
    };
    const ellipse = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function(...args: Parameters<typeof ellipse>) {
      if (args[2] === 2.28 && args[3] === 0.82 && this.fillStyle === '#000000') state.jumpShadows++;
      return ellipse.apply(this, args);
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(...args: Parameters<typeof fillText>) {
      if (/^\+\d+$/.test(args[0])) {
        state.awards.push({ text: args[0], color: String(this.fillStyle) });
        if (!state.defeatFrame && this.globalAlpha < 0.85 && this.globalAlpha > 0.6) queueMicrotask(() => { state.defeatFrame = this.canvas.toDataURL(); });
      }
      return fillText.apply(this, args);
    };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function(...args: Parameters<typeof arc>) {
      if (args[2] === 3.06 && this.strokeStyle === '#ffe0c6' && args[4] - args[3] >= Math.PI && !warningScheduled) {
        warningScheduled = true;
        queueMicrotask(() => { state.warningFrame = this.canvas.toDataURL(); state.warningShots = state.shots.length; });
      }
      if (args[2] === 0.22) state.shots.push({ x: args[0], y: args[1] });
      if (args[2] === 0.14) { state.player = { x: args[0], y: args[1] }; state.positions.push({ ...state.player, time: performance.now() }); }
      return arc.apply(this, args);
    };
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function(...args: unknown[]) {
      if (['#ff727d', '#bda4ff', '#72cfff', '#ffa56e'].includes(String(this.fillStyle))) {
        const color = String(this.fillStyle), p = translations.get(this), transform = this.getTransform();
        state.enemyColors.push(color);
        if (p) state.enemyBodies.push({ ...p, color, angle: Math.atan2(transform.b, transform.a) });
      }
      if (this.fillStyle === '#ffffff') {
        state.white++;
        if (state.white === 1) queueMicrotask(() => { state.flash = this.canvas.toDataURL(); });
      }
      if (this.fillStyle === '#d9fff1') state.particles++;
      return Reflect.apply(fill, this, args);
    };
  });
  await page.goto('/');
  // Always pause in the future: slow module loading must not rewind the clock
  // behind the app's initial performance.now() and drop simulated frames.
  if (controlled) await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.getByRole('button', { name: '开始探索' }).click();
  // Existing direction-pad fixtures explicitly select that mode. Dedicated wide
  // touchpad tests below exercise the unchanged production single-hand default.
  if (!info.title.includes('wide touchpad')) await page.locator('#control-mode').evaluate((e: HTMLButtonElement) => e.click());
});

for (const viewport of ['desktop', 'phone']) test(`random opening has varied safe spawns, a centered boss and fresh restart/reload on ${viewport}`, async ({ page }) => {
  const choose = async (single = false) => {
    await page.clock.runFor(16); await expect(page.locator('#opening-hint')).toBeVisible();
    expect((await probe(page)).enemyBodies).toHaveLength(0); expect((await probe(page)).shots).toHaveLength(0);
    const initial = (await probe(page)).trail; expect(initial).toHaveLength(4);
    let rectangle = initial;
    for (let i = 0; i < 20 && JSON.stringify(rectangle) === JSON.stringify(initial); i++) {
      await page.clock.runFor(50); rectangle = (await probe(page)).trail;
    }
    expect(rectangle).not.toEqual(initial);
    if (viewport === 'phone') {
      await controlMode(page, single ? 'one-hand' : 'two-left');
      const button = page.locator(single ? '#joystick' : '#touch-draw');
      await expect(button).toHaveAttribute('aria-label', '确认起点');
      const box = (await button.boundingBox())!, session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
    } else await page.keyboard.press('Space');
    await expect(page.locator('#opening-hint')).toBeHidden(); await expect(page.locator('#state-label')).toHaveText('探索中');
    const percent = Math.abs((rectangle[1].x - rectangle[0].x) * (rectangle[3].y - rectangle[0].y)) / (72 * 48) * 100;
    expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(percent, 7);
    const player = (await probe(page)).player;
    expect(player.x).toBeGreaterThan(0); expect(player.y).toBeGreaterThan(0);
    const onEdge = rectangle.some((a, i) => {
      const b = rectangle[(i + 1) % 4];
      return Math.min(a.x, b.x) - 1e-7 <= player.x && player.x <= Math.max(a.x, b.x) + 1e-7
        && Math.min(a.y, b.y) - 1e-7 <= player.y && player.y <= Math.max(a.y, b.y) + 1e-7;
    }); expect(onEdge).toBe(true); expect((await probe(page)).trail).toHaveLength(0);
    return rectangle;
  };
  const verify = async () => {
    const state = await probe(page), bodies = state.enemyBodies;
    expect(bodies).toHaveLength(10);
    const boss = bodies.find(body => body.color === '#ffa56e')!;
    expect({ x: boss.x, y: boss.y }).toEqual({ x: 36, y: 24 });
    const radii: Record<string, number> = { '#ff727d': 0.85, '#bda4ff': 0.67, '#72cfff': 0.78, '#ffa56e': 2 };
    for (const color of ['#ff727d', '#bda4ff', '#72cfff']) expect(bodies.filter(body => body.color === color)).toHaveLength(3);
    for (const body of bodies.filter(body => body !== boss)) {
      const r = radii[body.color];
      expect(Math.min(body.x, 72 - body.x, body.y, 48 - body.y)).toBeGreaterThanOrEqual(r + 0.16 - 1e-7);
      expect(Math.hypot(body.x - state.player.x, body.y - state.player.y)).toBeGreaterThanOrEqual(r + 3.34 - 1e-7);
      for (const other of bodies.filter(other => other !== body)) expect(Math.hypot(body.x - other.x, body.y - other.y)).toBeGreaterThanOrEqual(r + radii[other.color] + 0.25 - 1e-7);
    }
    const arrows = bodies.filter(body => body.color === '#ff727d');
    for (let i = 0; i < arrows.length; i++) for (let j = i + 1; j < arrows.length; j++) {
      expect(Math.acos(Math.cos(arrows[i].angle - arrows[j].angle))).toBeGreaterThanOrEqual(Math.PI / 3 - 1e-7);
    }
    return bodies.filter(body => body !== boss).map(body => [body.x, body.y, body.angle]);
  };
  const startingRectangle = await choose();
  const first = await verify();
  await page.screenshot({ path: `test-results/random-opening-${viewport}.png`, fullPage: true });
  const anchor = (await probe(page)).player, progress = await page.locator('#percent').textContent();
  const outward = Math.abs(anchor.y - startingRectangle[0].y) < 1e-7 ? 'ArrowUp' : Math.abs(anchor.y - startingRectangle[3].y) < 1e-7 ? 'ArrowDown' : Math.abs(anchor.x - startingRectangle[0].x) < 1e-7 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down('Space'); await page.keyboard.down(outward); await page.clock.runFor(40); await page.keyboard.up(outward);
  expect((await probe(page)).trail.length).toBeGreaterThan(1); expect((await probe(page)).player).not.toEqual(anchor);
  await page.keyboard.up('Space'); await page.clock.runFor(100);
  expect((await probe(page)).player).toEqual(anchor); expect((await probe(page)).trail).toHaveLength(0);
  await expect(page.locator('#percent')).toHaveText(progress!); await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.keyboard.press('KeyR'); await choose(viewport === 'phone');
  const restart = await verify(); expect(restart).not.toEqual(first);
  await expect(page.locator('#score')).toHaveText('000000'); await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', '5');
  await page.goto('/'); await page.clock.runFor(16); expect((await probe(page)).enemyBodies).toHaveLength(0);
  await page.getByRole('button', { name: '开始探索' }).click(); await choose();
  const reloaded = await verify(); expect(reloaded).not.toEqual(restart); expect(reloaded).not.toEqual(first);
});

test('random opening selection pauses, stays empty and auto-confirms the final rectangle at five seconds', async ({ page }) => {
  await page.locator('#sound').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('#state-label')).toHaveText('选择起点');
  await page.locator('#board').focus();
  await page.clock.runFor(1000); expect((await probe(page)).enemyBodies).toHaveLength(0);
  await page.keyboard.press('KeyP'); await page.clock.runFor(10000); await expect(page.locator('#state-label')).toHaveText('已暂停');
  expect((await probe(page)).enemyBodies).toHaveLength(0); await page.getByRole('button', { name: '继续探索' }).click();
  await page.clock.runFor(3950); await expect(page.locator('#state-label')).toHaveText('选择起点');
  const rectangle = (await probe(page)).trail;
  await page.screenshot({ path: 'test-results/opening-selection.png', fullPage: true });
  expect((await probe(page)).enemyBodies).toHaveLength(0); await page.clock.runFor(80);
  await expect(page.locator('#state-label')).toHaveText('探索中'); expect((await probe(page)).enemyBodies).toHaveLength(10);
  const percent = Math.abs((rectangle[1].x - rectangle[0].x) * (rectangle[3].y - rectangle[0].y)) / (72 * 48) * 100;
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(percent, 7);
  await expect(page.locator('#elapsed')).toHaveText('00:00'); expect((await probe(page)).shots).toHaveLength(0);
});

test('continuous movement stays on the drawn edge and turns between arbitrary coordinates', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await hold(page, 'ArrowRight', 137);
  const start = (await probe(page)).player;
  expect(start.x).toBeGreaterThan(36); expect(start.y).toBe(0);
  await page.keyboard.down('Space'); await hold(page, 'ArrowDown', 173);
  const turn = (await probe(page)).player;
  expect(turn.x).toBeCloseTo(start.x, 7); expect(turn.y).toBeGreaterThan(0);
  await hold(page, 'ArrowLeft', 143);
  const end = (await probe(page)).player;
  expect(end.x).toBeLessThan(turn.x); expect(end.y).toBeCloseTo(turn.y, 7);
  const samples = (await probe(page)).positions.filter(p => p.y > 0 && p.x === start.x);
  expect(new Set(samples.map(p => p.y)).size).toBeGreaterThan(5);
  expect(samples.some(p => Math.abs(p.y - Math.round(p.y)) > 0.05)).toBe(true);
  await page.waitForTimeout(100); expect((await probe(page)).player).toEqual(end);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await probe(page)).player).toEqual(start);
  expect((await probe(page)).trail).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('Space release retracts a bent trail, ignores new input until the anchor and allows a fresh cut', async ({ page }) => {
  await page.keyboard.down('Space');
  await hold(page, 'ArrowDown', 450); await hold(page, 'ArrowLeft', 350); await hold(page, 'ArrowDown', 350);
  const before = await probe(page), start = before.trail[0];
  expect(before.trail).toHaveLength(4);
  const releasedAt = await page.evaluate(() => performance.now());
  await page.keyboard.up('Space'); await page.keyboard.down('Space'); await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(60);
  const during = await probe(page);
  expect(during.player.x).toBeCloseTo(before.player.x, 7);
  expect(during.player.y).toBeLessThan(before.player.y);
  expect(during.trail.at(-1)).toEqual(during.player);
  await page.locator('#board').screenshot({ path: 'test-results/retracting-trail.png' });
  await expect.poll(async () => (await probe(page)).player, { intervals: [16] }).toEqual(start);
  const returned = await probe(page);
  expect(returned.trail).toHaveLength(0);
  // Every sampled point lies on the original polyline; the tip never takes a shortcut.
  const samples = returned.positions.filter(p => p.time > releasedAt);
  expect(samples.some(p => Math.abs(p.x - before.player.x) < 1e-7 && p.y < before.player.y - 0.2)).toBe(true);
  expect(samples.some(p => p.x > before.player.x + 0.2 && p.x < start.x - 0.2)).toBe(true);
  for (const p of samples) {
    const onFirst = Math.abs(p.x - start.x) < 1e-7 && p.y >= 0 && p.y <= before.trail[1].y;
    const onSecond = Math.abs(p.y - before.trail[1].y) < 1e-7 && p.x >= before.player.x && p.x <= start.x;
    const onThird = Math.abs(p.x - before.player.x) < 1e-7 && p.y >= before.trail[1].y && p.y <= before.player.y;
    expect(onFirst || onSecond || onThird).toBe(true);
  }
  await page.waitForTimeout(100); expect((await probe(page)).player).toEqual(start);
  await expect(page.locator('#percent')).toHaveText('0.0%'); await expect(page.locator('#score')).toHaveText('000000');
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space');
  await page.keyboard.down('Space'); await hold(page, 'ArrowDown', 100);
  expect((await probe(page)).player.y).toBeGreaterThan(0); await page.keyboard.up('Space');
});

async function touchController(page: Page) {
  const direction = await page.getByRole('button', { name: '向下' }).boundingBox();
  const draw = await page.locator('#touch-draw').boundingBox();
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const points = [direction!, draw!].map((box, i) => ({ id: i + 1, x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 4, radiusY: 4, force: 1 }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  return session;
}

for (const swapped of [false, true]) {
  test(`a held mobile direction slides through all buttons and stops outside, swapped=${swapped}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    if (swapped) await page.locator('#control-mode').click();
    const center = async (selector: string) => {
      const box = await page.locator(selector).boundingBox();
      return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    };
    const draw = await center('#touch-draw');
    const session = await touchController(page);
    const moveTo = async (position: { x: number; y: number }) => session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ id: 1, ...position, radiusX: 4, radiusY: 4, force: 1 }, { id: 2, ...draw, radiusX: 4, radiusY: 4, force: 1 }],
    });
    await page.waitForTimeout(300); const down = (await probe(page)).player;
    expect(down.y).toBeGreaterThan(0);
    for (const direction of ['right', 'up', 'left'] as const) {
      await moveTo(await center(`[data-dir="${direction}"]`));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const before = (await probe(page)).player; await page.waitForTimeout(100);
      await expect(page.locator(`[data-dir="${direction}"]`)).toHaveClass(/is-held/);
      await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true');
      const after = (await probe(page)).player;
      if (direction === 'right') { expect(after.x).toBeGreaterThan(before.x); expect(after.y).toBeCloseTo(before.y, 7); }
      if (direction === 'up') { expect(after.y).toBeLessThan(before.y); expect(after.x).toBeCloseTo(before.x, 7); }
      if (direction === 'left') { expect(after.x).toBeLessThan(before.x); expect(after.y).toBeCloseTo(before.y, 7); }
    }
    // Pointer capture remains on the pad, but coordinates over the board stop it.
    await moveTo(await center('#board')); await page.waitForTimeout(40);
    const stopped = (await probe(page)).player; await page.waitForTimeout(100);
    expect((await probe(page)).player).toEqual(stopped);
    await expect(page.locator('.dpad .is-held')).toHaveCount(0);
    await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true');
    await moveTo(await center('[data-dir="down"]')); await page.waitForTimeout(60);
    expect((await probe(page)).player.y).toBeGreaterThan(stopped.y);
    await page.screenshot({ path: `test-results/dpad-slide${swapped ? '-swapped' : ''}.png`, fullPage: true });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
    await expect(page.locator('.dpad .is-held')).toHaveCount(0);
    await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'false');
    await session.detach(); expect(errors).toEqual([]);
  });
}

for (const swapped of [false, true]) {
  test(`expanded circular d-pad sectors accept touches beyond the visible buttons, swapped=${swapped}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); if (swapped) await page.locator('#control-mode').click();
    const pad = await page.locator('.dpad').boundingBox(), draw = await page.locator('#touch-draw').boundingBox();
    const cx = pad!.x + pad!.width / 2, cy = pad!.y + pad!.height / 2;
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const points = (dx: number, dy: number) => [{ id: 1, x: cx + dx, y: cy + dy, radiusX: 4, radiusY: 4, force: 1 }, { id: 2, x: draw!.x + draw!.width / 2, y: draw!.y + draw!.height / 2, radiusX: 4, radiusY: 4, force: 1 }];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(80, 0) });
    await expect(page.locator('[data-dir="right"]')).toHaveClass(/is-held/); await page.waitForTimeout(100);
    expect((await probe(page)).player.x).toBeGreaterThan(36);
    for (const step of [{ dir: 'down', dx: 15, dy: 80, ms: 250 }, { dir: 'left', dx: -72, dy: 30, ms: 80 }, { dir: 'up', dx: -15, dy: -80, ms: 100 }]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(step.dx, step.dy) });
      await expect(page.locator(`[data-dir="${step.dir}"]`)).toHaveClass(/is-held/);
      await page.waitForTimeout(step.ms);
    }
    const anchor = (await probe(page)).trail[0]; expect(anchor).toBeDefined();
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(2, 2) });
    await page.waitForTimeout(40); const stopped = (await probe(page)).player;
    await page.waitForTimeout(80); expect((await probe(page)).player).toEqual(stopped);
    await expect(page.locator('.dpad .is-held')).toHaveCount(0);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(120, 0) });
    await page.waitForTimeout(80); expect((await probe(page)).player).toEqual(stopped);
    await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await probe(page)).player).toEqual(anchor);
    await session.detach();
  });
}

async function controlMode(page: Page, mode: string) {
  for (let i = 0; i < 3 && await page.locator('.touch-controls').getAttribute('data-mode') !== mode; i++) await page.locator('#control-mode').click();
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', mode);
}
async function singleHand(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await controlMode(page, 'one-hand');
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'one-hand');
  await expect(page.locator('.dpad-side')).toBeHidden(); await expect(page.locator('.draw-side')).toBeHidden();
  await expect(page.locator('#joystick')).toBeVisible();
}
async function touchJoystick(page: Page) {
  const box = await page.locator('#joystick').boundingBox(), x = box!.x + box!.width / 2, y = box!.y + box!.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const point = (dx = 0, dy = 0) => ({ id: 1, x: x + dx, y: y + dy, radiusX: 4, radiusY: 4, force: 1 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point()] });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  return { session, point, move: async (dx: number, dy: number) => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(dx, dy)] });
    // Chrome can coalesce pointermove until its compositor frame. Observe
    // actual input coordinates (the knob may already be clamped at this angle).
    if (await page.locator('#joystick').getAttribute('aria-pressed') === 'false') return;
    await expect.poll(async () => {
      const actual = (await probe(page)).joystickPoint, expected = point(dx, dy);
      return Math.abs(actual.x - expected.x) < 0.1 && Math.abs(actual.y - expected.y) < 0.1;
    }).toBe(true);
  } };
}

for (const variant of ['left edge', 'right edge', 'safe area']) test(`island coast phone wide touchpad ${variant} starts anywhere, captures outside and keeps buttons separate`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const viewport = variant === 'left edge' ? { width: 320, height: 568 } : { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'one-hand'); await expect(page.locator('.dpad-side')).toBeHidden();
  const pad = page.locator('#joystick'), box = (await pad.boundingBox())!, mode = (await page.locator('#control-mode').boundingBox())!, status = (await page.locator('.mobile-game-status').boundingBox())!;
  expect(box.width).toBeGreaterThan(viewport.width * 0.78); expect(box.y).toBeGreaterThanOrEqual(status.y + status.height); expect(box.y + box.height).toBeLessThan(mode.y);
  expect(mode.y + mode.height).toBeLessThanOrEqual(viewport.height - (variant === 'safe area' ? 34 : 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const session = await page.context().newCDPSession(page); await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const startX = variant === 'right edge' ? box.x + box.width - 4 : box.x + 4, startY = box.y + box.height / 2;
  const point = (dx = 0, dy = 0) => ({ id: 1, x: startX + dx, y: startY + dy });
  // A touch anywhere first confirms the opening without inheriting a drawing gesture.
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point()] }); await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.clock.runFor(32);
  expect((await probe(page)).player).toEqual({ x: 24, y: 18 }); expect((await probe(page)).trail).toHaveLength(0);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point()] }); await page.clock.runFor(48);
  expect((await probe(page)).player).toEqual({ x: 24, y: 18 }); await expect(pad).toHaveAttribute('aria-pressed', 'true');
  expect(await pad.evaluate(e => parseFloat((e as HTMLElement).style.getPropertyValue('--origin-x')))).toBeCloseTo(startX - box.x, 1);
  const move = async (dx: number, dy: number) => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(dx, dy)] });
    await expect.poll(async () => Math.abs((await probe(page)).joystickPoint.y - point(dx, dy).y) < 0.1 && Math.abs((await probe(page)).joystickPoint.x - point(dx, dy).x) < 0.1).toBe(true);
  };
  await move(0, -10); await page.clock.runFor(64); const up = (await probe(page)).player;
  expect(up.x).toBe(24); expect(up.y).toBeLessThan(18);
  // The second contact cannot replace the owning finger or its origin.
  const other = { id: 2, x: box.x + box.width / 2, y: startY + 15 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0, -10), other] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [other] }); await expect(pad).toHaveAttribute('aria-pressed', 'true');
  const dx = variant === 'right edge' ? -10 : 10;
  await move(dx, -10); await page.clock.runFor(64); const turn = (await probe(page)).player;
  expect(turn.y).toBe(up.y); expect(Math.sign(turn.x - up.x)).toBe(Math.sign(dx));
  const outside = box.y - 10 - startY;
  await move(dx, outside); await page.clock.runFor(64); expect((await probe(page)).player.y).toBeLessThan(turn.y);
  await expect(pad).toHaveAttribute('aria-pressed', 'true'); expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  await page.screenshot({ path: `test-results/wide-touchpad-${variant.replace(' ', '-')}-active.png`, fullPage: true });
  await session.send('Input.dispatchTouchEvent', { type: variant === 'safe area' ? 'touchCancel' : 'touchEnd', touchPoints: [] }); await page.clock.runFor(500); await session.detach();
  expect((await probe(page)).player).toEqual({ x: 24, y: 18 }); expect((await probe(page)).trail).toHaveLength(0); await expect(pad).toHaveAttribute('aria-pressed', 'false');
  expect(await pad.evaluate(e => (e as HTMLElement).style.getPropertyValue('--origin-x'))).toBe('');
  await page.locator('#mobile-pause').click(); await expect(page.locator('#state-label')).toHaveText('已暂停'); await page.locator('#mobile-pause').click();
  await page.locator('#control-mode').click(); await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'two-left'); await expect(pad).toBeHidden();
  await page.locator('#mobile-restart').click(); await expect(page.locator('#state-label')).toHaveText('选择起点'); expect(errors).toEqual([]);
});

test('one-handed joystick draws while held, turns continuously, clamps the knob and retracts on release', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await singleHand(page);
  const { session, move } = await touchJoystick(page);
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(100); expect((await probe(page)).player).toEqual({ x: 36, y: 0 });
  await move(0, 45); await page.waitForTimeout(300); const down = (await probe(page)).player;
  expect(down.y).toBeGreaterThan(0); expect((await probe(page)).trail.length).toBeGreaterThan(1);
  await move(120, 45); await page.waitForTimeout(120); const right = (await probe(page)).player;
  expect(right.x).toBeGreaterThan(down.x);
  const knob = await page.locator('#joystick').evaluate(element => Number.parseFloat((element as HTMLElement).style.getPropertyValue('--stick-x')));
  expect(knob).toBeGreaterThan(0); expect(knob).toBeLessThan(60);
  await move(120, 0); await page.waitForTimeout(100); const up = (await probe(page)).player; expect(up.y).toBeLessThan(right.y);
  const beforeStill = (await probe(page)).player; await move(120, 0); await page.waitForTimeout(60);
  const stopped = (await probe(page)).player; expect(stopped.x).toBe(beforeStill.x); expect(stopped.y).toBeLessThan(beforeStill.y);
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  await move(75, 0); await page.waitForTimeout(70); expect((await probe(page)).player.x).toBeLessThan(stopped.x);
  await page.screenshot({ path: 'test-results/single-hand-joystick.png', fullPage: true });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false'); expect((await probe(page)).trail).toHaveLength(0);
  expect(await page.locator('#joystick').evaluate(element => (element as HTMLElement).style.getPropertyValue('--stick-x'))).toBe('');
  await session.detach(); expect(errors).toEqual([]);
});

test('island coast joystick drag follows local turns on one side, keeps stationary direction and ignores other fingers on phone', async ({ page }) => {
  await singleHand(page); await page.locator('#joystick').click(); await page.clock.runFor(32);
  const { session, move, point } = await touchJoystick(page);
  await page.clock.runFor(48); expect((await probe(page)).player).toEqual({ x: 24, y: 18 });
  await move(160, 0); await page.clock.runFor(80); const anchor = (await probe(page)).player;
  expect(anchor.x).toBeGreaterThan(24); expect(anchor.y).toBe(18);
  await move(160, -30); await page.clock.runFor(80); const up = (await probe(page)).player;
  expect(up.x).toBe(anchor.x); expect(up.y).toBeLessThan(anchor.y);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(160, -30), { ...point(-40, 30), id: 2 }] });
  await page.clock.runFor(48); expect((await probe(page)).player.x).toBe(anchor.x);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...point(-40, 30), id: 2 }] });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  const beforeLeft = (await probe(page)).player;
  await move(145, -30); await page.clock.runFor(64); const left = (await probe(page)).player;
  expect(left.x).toBeLessThan(beforeLeft.x); expect(left.y).toBe(beforeLeft.y);
  expect(await page.locator('#joystick').evaluate(e => parseFloat((e as HTMLElement).style.getPropertyValue('--stick-x')))).toBeGreaterThan(0);
  expect(await page.locator('#joystick').evaluate(e => parseFloat((e as HTMLElement).style.getPropertyValue('--stick-x')))).toBeLessThan(40);
  await move(145, 0); await page.clock.runFor(32); const down = (await probe(page)).player;
  expect(down.x).toBe(left.x); expect(down.y).toBeGreaterThan(left.y);
  await page.clock.runFor(32); const still = (await probe(page)).player;
  expect(still.x).toBe(down.x); expect(still.y).toBeGreaterThan(down.y);
  for (const [x, y] of [[145.5, 0.5], [145, 0], [145.3, -0.3]]) {
    await move(x, y); await page.clock.runFor(16); expect((await probe(page)).player.x).toBe(down.x);
  }
  const beforeTurn = (await probe(page)).player; await move(120, 0); await page.clock.runFor(32);
  expect((await probe(page)).player.x).toBeLessThan(beforeTurn.x); expect((await probe(page)).player.y).toBe(beforeTurn.y);
  await page.screenshot({ path: 'test-results/joystick-drag-phone.png', fullPage: true });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await page.clock.runFor(500);
  expect((await probe(page)).player).toEqual(anchor); expect((await probe(page)).trail).toHaveLength(0);
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false'); await session.detach();
});

test('island coast joystick drag closes a real island loop and resets the previous touch point on phone', async ({ page }) => {
  await singleHand(page); await page.locator('#joystick').click(); await page.clock.runFor(32);
  const initial = Number(await page.locator('.progress-track').getAttribute('aria-valuenow'));
  const { session, move } = await touchJoystick(page);
  const until = async (done: (p: Probe['player']) => boolean) => {
    for (let i = 0; i < 120 && !done((await probe(page)).player); i++) await page.clock.runFor(16);
    expect(done((await probe(page)).player)).toBe(true);
  };
  await move(0, -30); await until(p => p.y <= 12);
  await move(-30, -30); await until(p => p.x <= 20);
  await move(-30, 0); await page.clock.runFor(32);
  const path = (await probe(page)).trail, y = path[1].y, x = path[2].x;
  await until(p => Math.abs(p.y - 18) < 1e-6); expect((await probe(page)).trail).toHaveLength(0);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach(); await page.clock.runFor(1300);
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(initial + (24 - x) * (18 - y) / (72 * 48) * 100, 7);
  expect(await worldPixel(page, 22, 15)).not.toEqual([14, 32, 43]);
  const next = await touchJoystick(page); await next.move(0, -20); await page.clock.runFor(48);
  expect((await probe(page)).player.x).toBe(x); expect((await probe(page)).player.y).toBeLessThan(18);
  await next.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await next.session.detach();
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.screenshot({ path: 'test-results/joystick-drag-capture-phone.png', fullPage: true });
});

test('island coast joystick drag starts off center and accepts a short local swipe on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.clock.runFor(32);
  await page.locator('#control-mode').click(); await page.locator('#control-mode').click();
  await page.locator('#joystick').click(); await page.clock.runFor(32);
  const box = (await page.locator('#joystick').boundingBox())!, x = box.x + box.width / 2 + 35, y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page), touch = (dy: number) => ({ id: 1, x, y: y + dy });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0)] }); await page.clock.runFor(96);
  expect((await probe(page)).player).toEqual({ x: 24, y: 18 }); // Position inside the pad is not a movement command.
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(-8)] });
  await expect.poll(async () => Math.abs((await probe(page)).joystickPoint.y - (y - 8)) < 0.1).toBe(true);
  await page.clock.runFor(80); const moving = (await probe(page)).player;
  expect(moving.x).toBe(24); expect(moving.y).toBeLessThan(18);
  await page.clock.runFor(48); expect((await probe(page)).player.y).toBeLessThan(moving.y);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await page.clock.runFor(300);
  expect((await probe(page)).player).toEqual({ x: 24, y: 18 }); expect((await probe(page)).trail).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/joystick-drag-small-phone.png', fullPage: true }); await session.detach();
});

test('mode switching, touch cancellation and wide layout discard active joystick input', async ({ page }) => {
  await singleHand(page); const first = await touchJoystick(page);
  await first.move(0, 45); await page.waitForTimeout(200); expect((await probe(page)).player.y).toBeGreaterThan(0);
  await page.locator('#control-mode').click();
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'two-left'); await expect(page.locator('#joystick')).toBeHidden();
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await first.move(45, 0); await page.waitForTimeout(100); expect((await probe(page)).player).toEqual({ x: 36, y: 0 });
  await first.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await first.session.detach();
  await singleHand(page); const cancelled = await touchJoystick(page); await cancelled.move(0, 45); await page.waitForTimeout(200);
  await cancelled.session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false'); await cancelled.session.detach();
  const wide = await touchJoystick(page); await wide.move(0, 45); await page.waitForTimeout(200);
  await page.setViewportSize({ width: 1000, height: 800 }); await expect(page.locator('.touch-controls')).toBeHidden();
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await wide.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wide.session.detach();
  await page.setViewportSize({ width: 320, height: 568 }); await expect(page.locator('#joystick')).toBeVisible();
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/single-hand-small.png', fullPage: true });
});

test('single-hand control retains a keyboard equivalent and clears on restart', async ({ page }) => {
  await singleHand(page); await page.locator('#joystick').focus();
  await page.keyboard.down('Space'); await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'true');
  await hold(page, 'ArrowDown', 200); expect((await probe(page)).player.y).toBeGreaterThan(0);
  await page.keyboard.up('Space'); await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#joystick').focus(); await page.keyboard.down('Space'); await hold(page, 'ArrowDown', 120);
  await page.keyboard.press('Tab'); await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.up('Space'); await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  const finger = await touchJoystick(page); await finger.move(0, 45); await page.waitForTimeout(200);
  await page.keyboard.press('KeyR'); await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'one-hand');
  await expect(page.locator('#joystick')).toHaveAttribute('aria-pressed', 'false');
  await finger.move(45, 0); await page.waitForTimeout(100); expect((await probe(page)).player).toEqual({ x: 36, y: 0 });
  await finger.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await finger.session.detach();
});

test('long press cannot select the whole page on the landing screen or in either mobile mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('button', { name: '开始探索' })).toBeVisible();
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  for (const stage of ['landing', 'two-hand', 'one-hand']) {
    if (stage === 'two-hand') { await page.getByRole('button', { name: '开始探索' }).click(); await controlMode(page, 'two-left'); }
    if (stage === 'one-hand') await controlMode(page, 'one-hand');
    for (const selector of ['.brand-light', 'h1']) {
      const box = (await page.locator(selector).boundingBox())!;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 4, radiusY: 4, force: 1 }] });
      await page.waitForTimeout(750); expect(await page.evaluate(() => getSelection()?.toString()), `${stage}: ${selector}`).toBe('');
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    }
    const selectors = ['.brand', '.brand-light', '.brand-icon i', 'h1', 'h1 span', '.intro-copy', '#board', '#percent', '.board-footer', '#control-mode', stage !== 'two-hand' ? '#joystick' : '#touch-draw'];
    const behavior = await page.evaluate(selectors => selectors.map(selector => {
      const element = document.querySelector(selector)!;
      return { selector, selection: getComputedStyle(element).userSelect,
        cancelled: ['contextmenu', 'selectstart', 'dragstart'].map(type => !element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))) };
    }), selectors);
    for (const result of behavior) { expect(result.selection, result.selector).toBe('none'); expect(result.cancelled, result.selector).toEqual([true, true, true]); }
    await expect(page.getByRole('heading', { name: '连接，划出你的领地。' })).toBeVisible();
    const button = page.locator(stage !== 'two-hand' ? '#joystick' : '[data-dir="down"]');
    await button.focus(); await expect(button).toBeFocused();
  }
  await session.detach();
  await page.screenshot({ path: 'test-results/page-long-press-phone.png', fullPage: true });
});

test('island coast native editors retain selection, menus and typing without game shortcuts', async ({ page }) => {
  await page.evaluate(() => {
    const form = document.createElement('div'); form.id = 'editing-fixture';
    form.innerHTML = '<input id="native-input" aria-label="输入测试"><textarea id="native-textarea" aria-label="多行测试"></textarea><select id="native-select" aria-label="选择测试"><option>one</option><option>two</option></select><div id="native-editor" contenteditable><span id="native-child">editable words</span><span id="native-static" contenteditable="false">static label</span><span id="native-nested" contenteditable="true">nested editor</span></div>';
    document.querySelector('.game-main')!.append(form);
  });
  const editors = ['#native-input', '#native-textarea', '#native-select', '#native-editor', '#native-child', '#native-nested'];
  const behavior = await page.evaluate(selectors => selectors.map(selector => {
    const element = document.querySelector(selector)!;
    return { selector, selection: getComputedStyle(element).userSelect,
      cancelled: ['contextmenu', 'selectstart', 'dragstart'].map(type => !element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))) };
  }), editors);
  for (const result of behavior) { expect(result.selection, result.selector).toBe('text'); expect(result.cancelled, result.selector).toEqual([false, false, false]); }
  expect(await page.locator('#native-static').evaluate(e => ({ selection: getComputedStyle(e).userSelect, menu: e.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true })) }))).toEqual({ selection: 'none', menu: false });
  for (const selector of ['#native-input', '#native-textarea']) {
    await page.locator(selector).focus(); await page.keyboard.type('wasd p r '); await expect(page.locator(selector)).toHaveValue('wasd p r ');
    await page.keyboard.press('ControlOrMeta+A');
    expect(await page.locator(selector).evaluate((e: HTMLInputElement | HTMLTextAreaElement) => e.selectionEnd! - e.selectionStart!)).toBe(9);
  }
  await page.locator('#native-child').click(); await page.keyboard.press('ControlOrMeta+A');
  expect(await page.evaluate(() => getSelection()?.toString())).toContain('editable words');
  await page.keyboard.type('wasd p r '); await expect(page.locator('#native-editor')).toContainText('wasd p r');
  await page.locator('#native-select').selectOption({ label: 'two' }); await expect(page.locator('#native-select')).toHaveValue('two');
  await expect(page.locator('#state-label')).toHaveText('选择起点'); expect((await probe(page)).enemyBodies).toHaveLength(0);
  await page.locator('#editing-fixture').evaluate(e => e.remove()); await page.locator('#board').focus();
  await page.keyboard.press('Space'); await page.clock.runFor(32); await expect(page.locator('#state-label')).toHaveText('探索中');
});

test('page graphics and links cannot drag, text cannot be mouse-selected and desktop scrolling remains available', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 }); await page.goto('/');
  await page.evaluate(() => {
    const image = document.createElement('img'); image.id = 'image-fixture'; image.alt = '测试图标';
    image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="green"/></svg>';
    document.querySelector('.intro')!.append(image);
    (window as unknown as { nativeDrags: boolean[] }).nativeDrags = [];
    document.addEventListener('dragstart', event => (window as unknown as { nativeDrags: boolean[] }).nativeDrags.push(event.defaultPrevented));
  });
  for (const selector of ['h1', '.brand', '#image-fixture']) {
    const box = (await page.locator(selector).boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  }
  expect(await page.evaluate(() => (window as unknown as { nativeDrags: boolean[] }).nativeDrags.every(cancelled => cancelled))).toBe(true);
  for (const selector of ['.brand', '#image-fixture', '.primary-button svg']) {
    expect(await page.locator(selector).evaluate(e => ({ drag: getComputedStyle(e).getPropertyValue('-webkit-user-drag'), cancelled: !e.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true })) }))).toEqual({ drag: 'none', cancelled: true });
  }
  await page.mouse.wheel(0, 650); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '开始探索' }).click(); await expect(page.locator('#overlay')).toBeHidden();
  await page.setViewportSize({ width: 780, height: 900 }); await page.evaluate(() => scrollTo(0, 0));
  const session = await page.context().newCDPSession(page); await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 700, y: 450 }] });
  for (const y of [400, 350, 300, 250, 200]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: 700, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0); await session.detach();
});

test('mobile held draw and direction support simultaneous touches, release and cancellation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await touchController(page);
  await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(350); expect((await probe(page)).player.y).toBeGreaterThan(0);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'false');
  expect((await probe(page)).trail).toHaveLength(0);
  await session.detach();
  const cancelled = await touchController(page); await page.waitForTimeout(250);
  await cancelled.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await probe(page)).player).toEqual({ x: 36, y: 0 });
  await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'false'); await cancelled.detach();
});

test('enclosing a normal enemy removes its body, awards points and plays matching fireworks', async ({ page }) => {
  await encloseRoster(page);
  await expect(page.locator('[data-kind="zigzag"]')).toHaveClass(/defeated/, { timeout: 4000 });
  await expect(page.locator('#toast')).toContainText('+4500');
  await expect.poll(async () => (await probe(page)).awards.some(award => award.text === '+500' && award.color === '#72cfff')).toBe(true);
  expect((await probe(page)).enemyColors).not.toContain('#72cfff');
  await expect.poll(async () => (await probe(page)).defeatFrame.length).toBeGreaterThan(0);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/enemy-defeat.png', Buffer.from((await probe(page)).defeatFrame.split(',')[1], 'base64'));
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeGreaterThan(40);
});

test('boss damage jump shows four health bars, landing shadow and scaling before returning to normal', async ({ page }) => {
  await encloseRoster(page);
  await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', '4');
  await expect(page.locator('#boss-hearts .filled')).toHaveCount(4);
  await expect(page.locator('#boss-status')).toHaveText('跃迁中');
  expect((await probe(page)).jumpShadows).toBeGreaterThan(0);
  expect((await probe(page)).jumpScales.some(scale => scale > 1.1)).toBe(true);
  await page.locator('#board').screenshot({ path: 'test-results/boss-jump.png' });
  await page.screenshot({ path: 'test-results/boss-health-desktop.png', fullPage: true });
  await page.keyboard.press('KeyP'); const paused = await probe(page); await page.clock.runFor(500);
  expect((await probe(page)).jumpScales).toEqual(paused.jumpScales);
  await page.getByRole('button', { name: '继续探索' }).click(); await page.clock.runFor(1200);
  await expect(page.locator('#boss-status')).not.toHaveText('跃迁中');
  await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', '4');
  expect((await probe(page)).jumpScales).toHaveLength(0);
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
});

test('closure flashes only the captured region white, dissolves and keeps player centered on its edge', async ({ page }) => {
  await firstCut(page);
  await expect.poll(async () => (await probe(page)).white).toBeGreaterThan(0);
  const flash = (await probe(page)).flash;
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/capture-white.png', Buffer.from(flash.split(',')[1], 'base64'));
  const flashPixels = await page.evaluate(async data => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 864; canvas.height = 576;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const at = (x: number) => [...ctx.getImageData(x, 150, 1, 1).data].slice(0, 3);
    return { captured: at(394), danger: at(470) };
  }, flash);
  expect(Math.min(...flashPixels.captured)).toBeGreaterThan(230);
  expect(flashPixels.danger).toEqual([14, 32, 43]);
  await expect.poll(async () => (await probe(page)).particles).toBeGreaterThan(0);
  await expect(page.locator('#percent')).toHaveText('50.0%');
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.locator('#board').screenshot({ path: 'test-results/capture-dissolve.png' });
  const before = (await probe(page)).player;
  await hold(page, 'ArrowLeft', 120);
  expect((await probe(page)).player).toEqual(before);
  await page.keyboard.down('Space'); await hold(page, 'ArrowLeft', 120); await page.keyboard.up('Space');
  expect((await probe(page)).player).toEqual(before); expect((await probe(page)).trail).toHaveLength(0);
  await hold(page, 'ArrowUp', 280);
  const edge = (await probe(page)).player;
  expect(edge.x).toBe(36); expect(edge.y).toBeLessThan(before.y);
  await hold(page, 'ArrowLeft', 100);
  expect((await probe(page)).player).toEqual(edge);
  await page.keyboard.down('Space'); await hold(page, 'ArrowLeft', 100); await page.keyboard.up('Space');
  expect((await probe(page)).player).toEqual(edge);
  // A pixel on the line above the player is mint; equal distances on each side
  // lie in the revealed landscape and dark field respectively.
  const pixels = await page.locator('#board').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    return { line: at(432, 480), danger: at(470, 480), revealed: at(394, 480) };
  });
  expect(pixels.line[1]).toBeGreaterThan(pixels.danger[1] + 80);
  expect(pixels.danger).toEqual([14, 32, 43]);
  expect(pixels.revealed).not.toEqual(pixels.danger);
  await page.waitForTimeout(1300); const settled = await probe(page);
  await page.waitForTimeout(120); const later = await probe(page);
  expect(later.particles).toBe(settled.particles); expect(later.white).toBe(settled.white);
  const edges = await page.locator('#board').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!, s = Math.min((canvas.width - 24) / 72, (canvas.height - 24) / 48);
    const at = (x: number, y: number) => [...ctx.getImageData(Math.round((canvas.width - 72 * s) / 2 + x * s), Math.round((canvas.height - 48 * s) / 2 + y * s), 1, 1).data].slice(0, 3);
    return { removed: [at(10, 0), at(0, 24), at(10, 48)], retained: [at(60, 0), at(72, 24), at(60, 48), at(36, 12)] };
  });
  for (const pixel of edges.removed) expect(pixel[1]).toBeLessThan(150);
  for (const pixel of edges.retained) expect(pixel[1]).toBeGreaterThan(180);
  await page.locator('#board').screenshot({ path: 'test-results/obsolete-edges-removed.png' });
  await page.locator('#board').screenshot({ path: 'test-results/continuous-edge.png' });
});

for (const phone of [false, true]) test(`enclosed image reveals a large loop and subsequent growth, not their exterior, ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  await page.clock.runFor(32);
  await moveClock(page, 'ArrowLeft', p => p.x <= 4);
  const left = (await probe(page)).player.x;
  await page.keyboard.down('Space');
  await moveClock(page, 'ArrowDown', p => p.y >= 40);
  const bottom = (await probe(page)).player.y;
  await moveClock(page, 'ArrowRight', p => p.x >= 66);
  const right = (await probe(page)).player.x;
  await moveClock(page, 'ArrowUp', p => Math.abs(p.y) < 1e-6); await page.keyboard.up('Space');
  await page.clock.runFor(1300);
  const expected = (right - left) * bottom / (72 * 48) * 100;
  expect(expected).toBeGreaterThan(70);
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(expected, 6);
  expect(await worldPixel(page, 30, 20)).not.toEqual([14, 32, 43]);
  expect(await worldPixel(page, 70, 20)).toEqual([14, 32, 43]);
  expect(await worldPixel(page, 30, 46)).toEqual([14, 32, 43]);
  expect((await probe(page)).enemyColors).toHaveLength(0);
  // Follow the new perimeter, then grow a second small pocket outward from it.
  await moveClock(page, 'ArrowDown', p => p.y >= bottom - 1e-6);
  await moveClock(page, 'ArrowLeft', p => p.x <= 56);
  const a = { ...(await probe(page)).player };
  await page.keyboard.down('Space');
  await moveClock(page, 'ArrowDown', p => p.y >= 44);
  const y = (await probe(page)).player.y;
  await moveClock(page, 'ArrowLeft', p => p.x <= 48);
  const x = (await probe(page)).player.x;
  await moveClock(page, 'ArrowUp', p => Math.abs(p.y - bottom) < 1e-6); await page.keyboard.up('Space');
  await page.clock.runFor(1300);
  const next = expected + (a.x - x) * (y - bottom) / (72 * 48) * 100;
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(next, 6);
  expect(await worldPixel(page, 52, 42)).not.toEqual([14, 32, 43]);
  expect(await worldPixel(page, 30, 20)).not.toEqual([14, 32, 43]);
  expect(await worldPixel(page, 30, 46)).toEqual([14, 32, 43]);
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.screenshot({ path: `test-results/enclosed-image-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
});

for (const phone of [false, true]) test(`island coast is the only shore, frame contact retracts and consecutive island loops reveal images on ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.keyboard.press('Space'); await page.clock.runFor(32);
  const initial = Number(await page.locator('.progress-track').getAttribute('aria-valuenow'));
  expect(initial).toBeCloseTo(144 / (72 * 48) * 100);
  expect((await probe(page)).boundary.every(p => p.x >= 18 && p.x <= 30 && p.y >= 18 && p.y <= 30)).toBe(true);
  expect(await worldPixel(page, 26, 22)).not.toEqual([14, 32, 43]);
  let session: Awaited<ReturnType<ReturnType<typeof page.context>['newCDPSession']>> | undefined;
  if (phone) {
    session = await page.context().newCDPSession(page);
    const up = (await page.locator('[data-dir=up]').boundingBox())!, action = (await page.locator('#touch-draw').boundingBox())!;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { id: 1, x: up.x + up.width / 2, y: up.y + up.height / 2 }, { id: 2, x: action.x + action.width / 2, y: action.y + action.height / 2 },
    ] });
  } else { await page.keyboard.down('Space'); await page.keyboard.down('ArrowUp'); }
  await page.clock.runFor(1000);
  expect((await probe(page)).player).toEqual({ x: 24, y: 0 }); expect((await probe(page)).trail.length).toBeGreaterThan(1);
  await page.clock.runFor(500); expect((await probe(page)).player).toEqual({ x: 24, y: 0 });
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(initial, 8);
  await expect(page.locator('#score')).toHaveText('000000');
  await page.screenshot({ path: `test-results/island-frame-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
  if (session) { await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await session.detach(); }
  else { await page.keyboard.up('ArrowUp'); await page.keyboard.up('Space'); }
  await page.clock.runFor(400);
  expect((await probe(page)).player).toEqual({ x: 24, y: 18 }); expect((await probe(page)).trail).toHaveLength(0);
  await page.keyboard.down('Space'); await moveClock(page, 'ArrowUp', p => p.y <= 10);
  const top = (await probe(page)).player.y;
  await moveClock(page, 'ArrowRight', p => p.x >= 28); const right = (await probe(page)).player.x;
  await moveClock(page, 'ArrowDown', p => Math.abs(p.y - 18) < 1e-6); await page.keyboard.up('Space');
  await page.clock.runFor(1300);
  const first = initial + (right - 24) * (18 - top) / (72 * 48) * 100;
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(first, 7);
  expect(await worldPixel(page, 26, 14)).not.toEqual([14, 32, 43]);
  const before = (await probe(page)).player; await page.keyboard.down('ArrowLeft'); await page.clock.runFor(100); await page.keyboard.up('ArrowLeft');
  expect((await probe(page)).player).toEqual(before); // Removed old shore inside the enlarged island.
  await moveClock(page, 'ArrowRight', p => Math.abs(p.x - 30) < 1e-6);
  await page.keyboard.down('Space'); await moveClock(page, 'ArrowRight', p => p.x >= 34); const end = (await probe(page)).player.x;
  await moveClock(page, 'ArrowUp', p => p.y <= 14); const y = (await probe(page)).player.y;
  await moveClock(page, 'ArrowLeft', p => Math.abs(p.x - right) < 1e-6); await page.keyboard.up('Space');
  await page.clock.runFor(1300);
  const total = first + (end - right) * (18 - y) / (72 * 48) * 100;
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(total, 7);
  expect(await worldPixel(page, 32, 16)).not.toEqual([14, 32, 43]);
  expect(await worldPixel(page, 60, 4)).toEqual([14, 32, 43]);
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', '5'); expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/island-growth-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
});

for (const phone of [false, true]) test(`island coast stays visible and walkable at the frame, with a separate arena border on ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  await page.keyboard.press('Space'); await page.clock.runFor(32);
  await page.keyboard.down('Space'); await moveClock(page, 'ArrowUp', p => Math.abs(p.y) < 1e-6);
  await moveClock(page, 'ArrowRight', p => p.x >= 28); const right = (await probe(page)).player.x;
  await moveClock(page, 'ArrowDown', p => Math.abs(p.y - 18) < 1e-6); await page.keyboard.up('Space');
  await page.clock.runFor(1300);
  const areaBefore = Number(await page.locator('.progress-track').getAttribute('aria-valuenow')), scoreBefore = await page.locator('#score').textContent();
  expect((await probe(page)).boundary.some((p, i, points) => i % 2 === 0 && Math.abs(p.y) < 1e-6 && Math.abs(points[i + 1].y) < 1e-6 && Math.min(p.x, points[i + 1].x) <= 26 && Math.max(p.x, points[i + 1].x) >= 26)).toBe(true);
  expect((await worldPixel(page, 26, 0))[1]).toBeGreaterThan(180);
  const gap = 4 / 11.5;
  for (const [x, y] of [[48, -gap], [-gap, 24], [72 + gap, 24], [48, 48 + gap]]) {
    expect(await worldPixel(page, x, y)).toEqual([99, 134, 156]);
  }
  if (phone) {
    const session = await page.context().newCDPSession(page);
    const touch = async (type: string, direction: string) => {
      const box = (await page.locator(`[data-dir=${direction}]`).boundingBox())!;
      await session.send('Input.dispatchTouchEvent', { type, touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    };
    await touch('touchStart', 'up'); await page.clock.runFor(1000);
    expect((await probe(page)).player).toEqual({ x: right, y: 0 });
    await touch('touchMove', 'left'); await page.clock.runFor(500);
    expect((await probe(page)).player).toEqual({ x: 24, y: 0 });
    await page.clock.runFor(300); expect((await probe(page)).player).toEqual({ x: 24, y: 0 });
    await touch('touchMove', 'down'); await page.clock.runFor(1000);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
  } else {
    await moveClock(page, 'ArrowUp', p => Math.abs(p.y) < 1e-6);
    await moveClock(page, 'ArrowLeft', p => Math.abs(p.x - 24) < 1e-6);
    await page.keyboard.down('ArrowLeft'); await page.clock.runFor(300); await page.keyboard.up('ArrowLeft');
    expect((await probe(page)).player).toEqual({ x: 24, y: 0 });
    await moveClock(page, 'ArrowDown', p => Math.abs(p.y - 18) < 1e-6);
  }
  expect((await probe(page)).player).toEqual({ x: 24, y: 18 }); expect((await probe(page)).trail).toHaveLength(0);
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(areaBefore, 7);
  await expect(page.locator('#score')).toHaveText(scoreBefore!);
  expect(await worldPixel(page, 50, 0)).toEqual([14, 32, 43]);
  // A second enlargement preserves the same continuous edge at the arena.
  await moveClock(page, 'ArrowLeft', p => p.x <= 22); const x = (await probe(page)).player.x;
  await page.keyboard.down('Space'); await moveClock(page, 'ArrowUp', p => p.y <= 12); const y = (await probe(page)).player.y;
  await moveClock(page, 'ArrowRight', p => Math.abs(p.x - 24) < 1e-6); await page.keyboard.up('Space');
  await page.clock.runFor(1300);
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(areaBefore + (24 - x) * (18 - y) / (72 * 48) * 100, 7);
  expect((await worldPixel(page, 26, 0))[1]).toBeGreaterThan(180);
  await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.screenshot({ path: `test-results/continuous-frame-shore-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
});

for (const phone of [false, true]) test(`island coast has no internal seam after near-shore closure on ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  await page.keyboard.press('Space'); await page.clock.runFor(1400);
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(160 / (72 * 48) * 100, 8);
  const internal = (await probe(page)).boundary.some((a, i, points) => i % 2 === 0 && a.x === 30 && points[i + 1].x === 30 && Math.min(a.y, points[i + 1].y) < 24 && Math.max(a.y, points[i + 1].y) > 24);
  expect(internal).toBe(false); expect((await worldPixel(page, 30, 24))[1]).toBeLessThan(140);
  expect((await worldPixel(page, 34, 24))[1]).toBeGreaterThan(150);
  const before = (await probe(page)).player;
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(150); await page.keyboard.up('ArrowUp');
  expect((await probe(page)).player).toEqual(before);
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowUp'); await page.clock.runFor(150);
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('Space');
  expect((await probe(page)).player).toEqual(before); expect((await probe(page)).trail).toHaveLength(0);
  await page.screenshot({ path: `test-results/no-internal-shore-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
});

for (const input of ['keyboard', 'mouse', 'touch']) test(`island coast permits frame departure and retraction with ${input}${input === 'keyboard' ? '' : ' on phone'}`, async ({ page }) => {
  await page.keyboard.press('Space'); await page.clock.runFor(32);
  await page.keyboard.down('Space'); await moveClock(page, 'ArrowUp', p => Math.abs(p.y) < 1e-6);
  await moveClock(page, 'ArrowRight', p => p.x >= 28); const right = (await probe(page)).player.x;
  await moveClock(page, 'ArrowDown', p => Math.abs(p.y - 18) < 1e-6); await page.keyboard.up('Space'); await page.clock.runFor(1300);
  await moveClock(page, 'ArrowUp', p => Math.abs(p.y) < 1e-6);
  const progress = await page.locator('#percent').textContent(), score = await page.locator('#score').textContent();
  const claimedBefore = Number(await page.locator('.progress-track').getAttribute('aria-valuenow'));
  let session: Awaited<ReturnType<ReturnType<typeof page.context>['newCDPSession']>> | undefined;
  if (input === 'touch') {
    session = await page.context().newCDPSession(page);
    const dir = (await page.locator('[data-dir=right]').boundingBox())!, action = (await page.locator('#touch-draw').boundingBox())!;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { id: 1, x: dir.x + dir.width / 2, y: dir.y + dir.height / 2 }, { id: 2, x: action.x + action.width / 2, y: action.y + action.height / 2 },
    ] });
  } else {
    if (input === 'mouse') { const box = (await page.locator('#touch-draw').boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); }
    else await page.keyboard.down('Space');
    await page.keyboard.down('ArrowRight');
  }
  await page.clock.runFor(100);
  expect((await probe(page)).player.x).toBeGreaterThan(right + 1); expect((await probe(page)).player.y).toBe(0);
  expect((await probe(page)).trail.length).toBeGreaterThan(1);
  await expect(page.locator('#percent')).toHaveText(progress!); await expect(page.locator('#score')).toHaveText(score!);
  if (session) { await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await session.detach(); }
  else { await page.keyboard.up('ArrowRight'); if (input === 'mouse') await page.mouse.up(); else await page.keyboard.up('Space'); }
  await page.clock.runFor(400); expect((await probe(page)).player).toEqual({ x: right, y: 0 }); expect((await probe(page)).trail).toHaveLength(0);
  await page.locator('#board').focus(); await page.keyboard.down('Space');
  await moveClock(page, 'ArrowRight', p => p.x >= right + 4); const x = (await probe(page)).player.x;
  await moveClock(page, 'ArrowDown', p => p.y >= 4); const y = (await probe(page)).player.y;
  await moveClock(page, 'ArrowLeft', p => Math.abs(p.x - right) < 1e-6); await page.keyboard.up('Space'); await page.clock.runFor(1300);
  expect((await probe(page)).trail).toHaveLength(0);
  expect(Number(await page.locator('.progress-track').getAttribute('aria-valuenow'))).toBeCloseTo(claimedBefore + (x - right) * y / (72 * 48) * 100, 7);
  const ghost = (await probe(page)).boundary.some((a, i, points) => i % 2 === 0 && a.x === right && points[i + 1].x === right && Math.min(a.y, points[i + 1].y) < 2 && Math.max(a.y, points[i + 1].y) > 2);
  expect(ghost).toBe(false); await expect(page.locator('#lives')).toHaveAttribute('aria-label', '剩余 3 条生命');
  await page.screenshot({ path: `test-results/frame-departure-${input}.png`, fullPage: true });
});

test('pause, sound, restart and background pause', async ({ page }) => {
  await firstCut(page);
  await page.keyboard.press('KeyP'); await expect(page.getByRole('heading', { name: '风景会等你。' })).toBeVisible();
  const time = await page.locator('#elapsed').textContent(), position = (await probe(page)).player;
  await page.waitForTimeout(1100);
  await expect(page.locator('#elapsed')).toHaveText(time!); expect((await probe(page)).player).toEqual(position);
  await page.getByRole('button', { name: '继续探索' }).click();
  await page.getByRole('button', { name: '音效关闭' }).click();
  await expect(page.getByRole('button', { name: '音效开启' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyR'); await expect(page.locator('#percent')).toHaveText('0.0%');
  await expect(page.locator('#score')).toHaveText('000000');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#state-label')).toHaveText('已暂停');
});

test('nine ordinary enemies and a larger boss, cross and X volleys match warnings and reset on restart', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.enemy-entry')).toHaveCount(4);
  await expect.poll(async () => new Set((await probe(page)).enemyColors).size).toBe(4);
  const checkRoster = async () => {
    const colors = (await probe(page)).enemyColors;
    expect((await probe(page)).bossRadius).toBeCloseTo(2);
    for (const color of ['#ff727d', '#bda4ff', '#72cfff']) expect(colors.filter(c => c === color)).toHaveLength(3);
    expect(colors.filter(c => c === '#ffa56e')).toHaveLength(1);
    for (const kind of ['straight', 'orbit', 'zigzag']) await expect(page.locator(`[data-kind="${kind}"] em`)).toContainText('×3');
  };
  const until = async (condition: () => Promise<boolean>) => {
    for (let i = 0; i < 100 && !await condition(); i++) await page.clock.runFor(100);
    expect(await condition()).toBe(true);
  };
  const pattern = (angles: number[], offset: number) => {
    expect(angles).toHaveLength(4);
    angles.forEach((angle, i) => expect(Math.cos(angle - offset - i * Math.PI / 2)).toBeCloseTo(1, 8));
  };
  const shotAngles = async () => {
    const shots = (await probe(page)).shots; expect(shots).toHaveLength(4);
    const center = shots.reduce((sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }), { x: 0, y: 0 });
    return shots.map(p => Math.atan2(p.y - center.y, p.x - center.x));
  };
  await checkRoster();
  await until(async () => await page.locator('#boss-status').textContent() === '即将释放');
  pattern((await probe(page)).warningAngles, 0);
  await mkdir('test-results', { recursive: true });
  await until(async () => (await probe(page)).shots.length === 4); pattern(await shotAngles(), 0);
  await page.locator('#board').screenshot({ path: 'test-results/cross-volley.png' });
  await page.screenshot({ path: 'test-results/enemies-desktop.png', fullPage: true });
  await page.keyboard.press('KeyP'); await expect(page.locator('#state-label')).toHaveText('已暂停');
  const paused = (await probe(page)).shots; await page.clock.runFor(1000);
  expect((await probe(page)).shots).toEqual(paused);
  await page.getByRole('button', { name: '继续探索' }).click();
  await page.clock.runFor(100); expect((await probe(page)).shots).not.toEqual(paused);
  await until(async () => await page.locator('#boss-status').textContent() === '即将释放');
  pattern((await probe(page)).warningAngles, Math.PI / 4); expect((await probe(page)).shots).toHaveLength(0);
  await until(async () => (await probe(page)).shots.length === 4); pattern(await shotAngles(), Math.PI / 4);
  await page.locator('#board').screenshot({ path: 'test-results/x-volley.png' });
  await page.keyboard.press('KeyR'); await expect(page.locator('#percent')).toHaveText('0.0%');
  expect((await probe(page)).shots).toHaveLength(0);
  await checkRoster();
  await until(async () => await page.locator('#boss-status').textContent() === '即将释放'); pattern((await probe(page)).warningAngles, 0);
  expect(errors).toEqual([]);
});

for (const phase of [2, 3]) test(`configured phase ${phase} renders eight shots and the correct reinforcement target`, async ({ page }) => {
  await expect(page.locator('#boss-phase')).toContainText(phase === 2 ? '二阶段' : '三阶段');
  await expect(page.locator('.boss-health')).toHaveAttribute('aria-valuenow', phase === 2 ? '3' : '1');
  if (phase === 3) await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 0; i < 100 && (await probe(page)).shots.length !== 8; i++) await page.clock.runFor(100);
  const shots = (await probe(page)).shots;
  expect(shots).toHaveLength(8);
  const elapsed = Number((await page.locator('#elapsed').textContent())!.split(':')[1]);
  if (phase === 2) expect(elapsed).toBeGreaterThanOrEqual(4); else expect(elapsed).toBeLessThanOrEqual(3);
  const center = shots.reduce((sum, p) => ({ x: sum.x + p.x / 8, y: sum.y + p.y / 8 }), { x: 0, y: 0 });
  const angles = shots.map(p => Math.atan2(p.y - center.y, p.x - center.x));
  for (let i = 1; i < angles.length; i++) expect((angles[i] - angles[i - 1] + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo(Math.PI / 4, 4);
  await page.locator('#board').screenshot({ path: `test-results/phase-${phase}-shots.png` });
  for (let i = 0; i < 60 && (await probe(page)).enemyColors.length !== (phase === 2 ? 10 : 16); i++) await page.clock.runFor(100);
  expect((await probe(page)).enemyColors).toHaveLength(phase === 2 ? 10 : 16);
  // Rendering observes a spawn before the throttled HUD update; advance the
  // frozen clock so the UI can report the same already verified roster.
  await page.clock.runFor(100);
  await expect(page.locator('#boss-phase')).toContainText(phase === 2 ? '9/9' : '15/15');
  if (phase === 3) {
    const arrows = (await probe(page)).enemyBodies.filter(body => body.color === '#ff727d');
    expect(arrows.some(body => Math.abs(Math.sin(body.angle)) < 1e-7)).toBe(true);
    expect(arrows.some(body => Math.abs(Math.cos(body.angle)) < 1e-7)).toBe(true);
  }
  await page.screenshot({ path: `test-results/phase-${phase}-roster.png`, fullPage: true });
  await page.keyboard.press('KeyP'); const paused = await probe(page); await page.clock.runFor(1000);
  expect((await probe(page)).shots).toEqual(paused.shots);
});

test('portrait controller swaps sides, stays within the screen and is hidden on wide layouts', async ({ page }) => {
  await expect(page.locator('.touch-controls')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.touch-controls')).toBeVisible();
  const before = await page.locator('.dpad-side').boundingBox(), drawBefore = await page.locator('.draw-side').boundingBox();
  expect(before!.x).toBeLessThan(drawBefore!.x);
  await page.locator('#control-mode').click(); await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', 'two-right');
  const after = await page.locator('.dpad-side').boundingBox(), drawAfter = await page.locator('.draw-side').boundingBox();
  expect(after!.x).toBeGreaterThan(drawAfter!.x);
  const session = await touchController(page);
  await expect.poll(async () => (await probe(page)).player.y, { timeout: 6000 }).toBe(48);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
  await expect(page.locator('#percent')).toHaveText('50.0%');
  await page.screenshot({ path: 'test-results/mobile-controller.png', fullPage: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const box = await page.locator('#control-mode').boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.goto('/'); await expect(page.getByRole('button', { name: '开始探索' })).toBeVisible();
  await page.getByRole('button', { name: '开始探索' }).click(); await expect(page.locator('#overlay')).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 }); await expect(page.locator('.touch-controls')).toBeHidden();
  await page.setViewportSize({ width: 1000, height: 800 }); await expect(page.locator('.touch-controls')).toBeHidden();
});

for (const variant of ['portrait', 'small', 'safe area']) test(`island coast phone notice ${variant} stays outside play and touch areas in every control mode`, async ({ page }) => {
  const viewport = variant === 'small' ? { width: 320, height: 568 } : { width: 390, height: 844 };
  await page.setViewportSize(viewport); await page.keyboard.press('Space'); await page.clock.runFor(32);
  const geometry = async () => Promise.all(['.board-shell', '.board-footer', '.touch-controls'].map(s => page.locator(s).boundingBox()));
  const before = await geometry();
  await page.keyboard.down('Space'); await moveClock(page, 'ArrowUp', p => p.y <= 12);
  await moveClock(page, 'ArrowRight', p => p.x >= 28);
  await moveClock(page, 'ArrowDown', p => Math.abs(p.y - 18) < 1e-6); await page.keyboard.up('Space'); await page.clock.runFor(250);
  await moveClock(page, 'ArrowUp', p => p.y <= 12);
  const anchor = (await probe(page)).player;
  const toast = page.locator('#toast'); await expect(toast).toHaveClass('toast visible');
  await expect(toast.locator('.toast-compact')).toHaveText('领地已扩大');
  expect(await toast.ariaSnapshot()).toContain('连接成功 · 新的领地已揭开');
  expect(await geometry()).toEqual(before);
  const check = async () => {
    await expect(page.locator('#mobile-notice-slot > #toast')).toHaveCount(1); await expect(page.getByRole('status')).toHaveCount(1);
    const [board, footer, controls] = await geometry(), message = (await toast.boundingBox())!;
    expect(message.y).toBeGreaterThanOrEqual(board!.y + board!.height);
    expect(message.y).toBeGreaterThanOrEqual(footer!.y); expect(message.y + message.height).toBeLessThanOrEqual(footer!.y + footer!.height);
    expect(message.y + message.height).toBeLessThanOrEqual(controls!.y);
    expect(await toast.evaluate(e => ({ overflow: e.scrollWidth > e.clientWidth, pointer: getComputedStyle(e).pointerEvents }))).toEqual({ overflow: false, pointer: 'none' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const mode = (await page.locator('#control-mode').boundingBox())!;
    expect(mode.y + mode.height).toBeLessThanOrEqual(viewport.height - (variant === 'safe area' ? 34 : 0));
  };
  for (const mode of ['two-left', 'two-right', 'one-hand']) {
    await expect(page.locator('.touch-controls')).toHaveAttribute('data-mode', mode); await check();
    if (mode === 'one-hand') {
      const { session, move } = await touchJoystick(page); await move(0, -18); await page.clock.runFor(64);
      expect((await probe(page)).player.y).toBeLessThan(anchor.y);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
    } else {
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const points = await Promise.all(['.dpad [data-dir="up"]', '#touch-draw'].map(async (s, i) => {
        const b = (await page.locator(s).boundingBox())!; return { id: i + 1, x: b.x + b.width / 2, y: b.y + b.height / 2, radiusX: 4, radiusY: 4, force: 1 };
      }));
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await expect(page.locator('#touch-draw')).toHaveAttribute('aria-pressed', 'true'); await page.clock.runFor(64);
      expect((await probe(page)).player.y).toBeLessThan(anchor.y);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
    }
    await page.clock.runFor(100); expect((await probe(page)).player).toEqual(anchor); expect((await probe(page)).trail).toHaveLength(0);
    if (mode !== 'one-hand') await page.locator('#control-mode').click();
  }
  await page.screenshot({ path: `test-results/mobile-notice-${variant.replace(' ', '-')}.png`, fullPage: true });
  if (variant === 'portrait') {
    await page.setViewportSize({ width: 844, height: 390 }); await page.clock.runFor(32);
    await expect(page.locator('.touch-controls')).toBeHidden(); await expect(page.locator('#mobile-notice-slot > #toast')).toHaveCount(1);
    const message = (await toast.boundingBox())!, board = (await page.locator('.board-shell').boundingBox())!;
    expect(message.y).toBeGreaterThanOrEqual(board.y + board.height); expect(message.y + message.height).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'test-results/mobile-notice-landscape.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 }); await page.clock.runFor(32);
    await expect(page.locator('.board-shell > #toast')).toHaveCount(1); await expect(toast.locator('.toast-compact')).toBeHidden();
    await expect(toast.locator('.toast-full')).toBeVisible();
    expect(await toast.evaluate(e => getComputedStyle(e).position)).toBe('absolute');
    await page.screenshot({ path: 'test-results/mobile-notice-desktop.png', fullPage: true });
  }
  await page.clock.runFor(2300); await expect(toast).not.toHaveClass('toast visible');
});

test('reduced motion reveals territory without drifting particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await firstCut(page);
  await page.waitForTimeout(400);
  const state = await probe(page); expect(state.white).toBeGreaterThan(0); expect(state.particles).toBe(0);
  await expect(page.locator('#percent')).toHaveText('50.0%');
});
