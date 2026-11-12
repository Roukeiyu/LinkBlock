import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageDimensions } from './image-dimensions.mjs';

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
}
if (errors.length) throw new Error(`Artwork canvas mismatch:\n${errors.join('\n')}`);
console.log('Artwork canvases: all 30 reward images and 20 seal/mask assets are 1536 × 1024.');
