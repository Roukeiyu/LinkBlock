import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageDimensions } from './image-dimensions.mjs';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ entryPoints: [resolve(root, 'src/levels.ts')], bundle: true,
  platform: 'node', format: 'esm', write: false });
const { LEVELS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const errors = [];
for (const level of LEVELS) {
  for (const key of ['restored', 'rewardNinety', 'rewardPerfect', 'sealed', 'mask']) {
    const file = level[key];
    if (!file) { errors.push(`Level ${level.id}: missing ${key}`); continue; }
    const { width, height } = imageDimensions(resolve(root, 'public', file));
    if (width !== 1536 || height !== 1024) errors.push(`${file}: ${width} × ${height}; expected 1536 × 1024`);
  }
  for (const key of ['restored', 'ninety', 'perfect', 'sealed', 'mask']) {
    const file = `monster/${level.id}/${key}.${key === 'mask' ? 'png' : 'webp'}`;
    const { width, height } = imageDimensions(resolve(root, 'public', file));
    if (width !== 1536 || height !== 1024) errors.push(`${file}: ${width} × ${height}; expected 1536 × 1024`);
  }
  for (const file of [level.mask, `monster/${level.id}/mask.png`]) {
    const { data } = await sharp(resolve(root, 'public', file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let character = 0, background = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 127 && Math.max(data[i], data[i + 1], data[i + 2]) > 127) character++;
      else background++;
    }
    if (!character || !background) errors.push(`${file}: mask must contain both character and background`);
  }
}
if (errors.length) throw new Error(`Artwork canvas mismatch:\n${errors.join('\n')}`);
console.log('Artwork canvases and character masks checked for all 10 levels in both forms.');
