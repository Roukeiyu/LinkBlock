/** Rasterize the matching sealed scenes and portrait frames once at build time.
 * Run build-expansion-assets.py first, then this script. This avoids evaluating
 * the SVG desaturation/mask/glow filters on every canvas frame during gameplay.
 * Requires Playwright Chromium (or CHROMIUM_PATH) and ffmpeg.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const versionAt = args.indexOf('--version');
const version = versionAt < 0 ? 'v3' : args[versionAt + 1];
const levelsAt = args.indexOf('--levels');
const levelsEnd = args.findIndex((arg, i) => i > levelsAt && arg.startsWith('--'));
const levelArgs = levelsAt < 0 ? ['6', '7', '8', '9', '10'] : args.slice(levelsAt + 1, levelsEnd < 0 ? undefined : levelsEnd);
const levels = levelArgs.map(Number);
if (!version || !/^v\d+$/.test(version) || !levels.length || levels.some(level => !Number.isInteger(level) || level < 1 || level > 10)) throw new Error('Expected --version vN and --levels 1 2 ... 10');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: process.env.CHROMIUM_PATH ? ['--no-sandbox'] : [],
});
try {
  const page = await browser.newPage();
  for (const level of levels) for (const name of ['sealed', 'portrait', 'portrait-sealed']) {
    const svg = readFileSync(resolve(root, 'art/expansion/build', version, String(level), `${name}.svg`)).toString('base64');
    const png = await page.evaluate(async data => {
      const image = new Image(); image.src = `data:image/svg+xml;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    }, svg);
    const output = resolve(root, 'public/levels', String(level), version, `${name}.webp`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'pipe:0', '-frames:v', '1',
      '-c:v', 'libwebp', '-quality', '90', '-compression_level', '6', output], { input: Buffer.from(png, 'base64') });
    console.log(`${level}/${name}.webp`);
  }
} finally {
  await browser.close();
}
