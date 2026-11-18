/** Package the reviewed phase-two human masks and matching seals and portraits. */
import { build } from 'esbuild';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ entryPoints: [resolve(root, 'src/levels.ts')], bundle: true, platform: 'node', format: 'esm', write: false });
const { LEVELS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const faceBundle = await build({ entryPoints: [resolve(root, 'src/faces.ts')], bundle: true, platform: 'node', format: 'esm', write: false });
const { FACE_REGIONS } = await import(`data:text/javascript;base64,${Buffer.from(faceBundle.outputFiles[0].text).toString('base64')}`);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

for (const level of LEVELS.filter(level => level.id >= 11)) {
  const specFile = resolve(root, `art/phase-two-masks/${level.id}.json`);
  const spec = JSON.parse(readFileSync(specFile, 'utf8'));
  const source = readFileSync(resolve(root, 'public', level.restored));
  const matte = readFileSync(resolve(root, spec.matte));
  if (spec.source !== level.restored || digest(source) !== spec.source_sha256 || digest(matte) !== spec.matte_sha256)
    throw new Error(`Level ${level.id}: artwork or reviewed matte changed`);
  const { data: rgb, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: gray, info: maskInfo } = await sharp(matte).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (width !== 1536 || height !== 1024 || maskInfo.width !== width || maskInfo.height !== height)
    throw new Error(`Level ${level.id}: artwork and mask dimensions differ`);
  const mask = Buffer.from(gray.map(value => value > 127 ? 255 : 0));
  const guarded = Buffer.from(mask);
  for (let i = 0; i < mask.length; i++) {
    const x = i % width, y = Math.floor(i / width);
    if (mask[i] || (x && mask[i - 1]) || (x + 1 < width && mask[i + 1]) ||
        (y && mask[i - width]) || (y + 1 < height && mask[i + width])) guarded[i] = 255;
  }
  const sealed = Buffer.alloc(rgb.length);
  for (let i = 0; i < guarded.length; i++) {
    const offset = i * 3;
    const luminance = Math.round(rgb[offset] * .299 + rgb[offset + 1] * .587 + rgb[offset + 2] * .114);
    for (let c = 0; c < 3; c++) sealed[offset + c] = guarded[i] ? [32, 32, 44][c]
      : Math.floor(Math.floor(luminance * .75 + rgb[offset + c] * .25) * .52);
  }
  const face = FACE_REGIONS[level.restored];
  const size = Math.min(height, Math.ceil(Math.max(face.width, face.height) * 1.55));
  const left = Math.max(0, Math.min(width - size, Math.round(face.x + face.width / 2 - size / 2)));
  const top = Math.max(0, Math.min(height - size, Math.round(face.y + face.height / 2 - size / 2)));
  const crop = { left, top, width: size, height: size };
  const target = resolve(root, `public/levels/${level.id}/alpha-v1`);
  mkdirSync(target, { recursive: true });
  await sharp(guarded, { raw: { width, height, channels: 1 } }).png().toFile(resolve(target, 'mask.png'));
  await sharp(sealed, { raw: { width, height, channels: 3 } }).webp({ quality: 88, effort: 5 }).toFile(resolve(target, 'sealed.webp'));
  await sharp(sealed, { raw: { width, height, channels: 3 } }).extract(crop).resize(320, 320).webp({ quality: 88 }).toFile(resolve(target, 'portrait-sealed.webp'));
  await sharp(source).extract(crop).resize(320, 320).webp({ quality: 88 }).toFile(resolve(target, 'portrait.webp'));
  spec.files = Object.fromEntries(['mask.png', 'sealed.webp', 'portrait-sealed.webp', 'portrait.webp']
    .map(file => [file, digest(readFileSync(resolve(target, file)))]));
  writeFileSync(specFile, JSON.stringify(spec, null, 2) + '\n');
  console.log(`Level ${level.id}: human mask, seal and portraits packaged`);
}
