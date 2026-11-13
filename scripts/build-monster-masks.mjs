/** Package full-resolution image-generated monster mattes and their seals.
 * Usage: node scripts/build-monster-masks.mjs [1 ... 10]
 * Original artwork is never rewritten. Review-only art is not a mask source.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = data => createHash('sha256').update(data).digest('hex');
const levels = process.argv.length > 2 ? process.argv.slice(2).map(Number) : Array.from({ length: 10 }, (_, i) => i + 1);
if (levels.some(id => !Number.isInteger(id) || id < 1 || id > 10)) throw new Error('Expected level IDs from 1 to 10');

for (const id of levels) {
  const specPath = resolve(root, `art/monster-masks/${id}.json`);
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  if (spec.version !== 2) throw new Error(`Level ${id}: expected an extracted raster matte`);
  const source = readFileSync(resolve(root, spec.source));
  const matte = readFileSync(resolve(root, spec.matte));
  if (digest(source) !== spec.source_sha256 || digest(matte) !== spec.matte_sha256)
    throw new Error(`Level ${id}: artwork or matte changed; inspect the overlay before updating provenance`);
  const { data: rgb, info: plate } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: gray, info } = await sharp(matte).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const [width, height] = spec.canvas;
  if (width !== 1536 || height !== 1024 || plate.width !== width || plate.height !== height || info.width !== width || info.height !== height)
    throw new Error(`Level ${id}: artwork and matte must share the original 1536 × 1024 canvas`);
  if (!Number.isInteger(spec.guard_pixels) || spec.guard_pixels < 0 || spec.guard_pixels > 3)
    throw new Error(`Level ${id}: invalid edge guard`);
  const mask = Buffer.from(gray.map(value => value > 127 ? 255 : 0));
  const preserved = new Set(spec.background_holes.map(({ point: [x, y] }) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height || mask[y * width + x])
      throw new Error(`Level ${id}: background-hole probe no longer falls on background at ${x}, ${y}`);
    return y * width + x;
  }));
  // A dark fold, necklace or finger drawn over clothing is not transparency.
  // Keep explicitly reviewed real holes, regardless of their area; the exterior
  // is always kept. This preserves thin bandage and vine gaps that size-based
  // hole filling would erase.
  const visited = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] || visited[start]) continue;
    let head = 0, tail = 1, keep = false;
    queue[0] = start; visited[start] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width);
      if (!x || !y || x === width - 1 || y === height - 1 || preserved.has(i)) keep = true;
      for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (next < 0 || mask[next] || visited[next]) continue;
        visited[next] = 1; queue[tail++] = next;
      }
    }
    if (!keep) for (let i = 0; i < tail; i++) mask[queue[i]] = 255;
  }
  // Like the human masks, guard antialiased fringes without smoothing away
  // individual hairs, ice spikes or cloth fibers. Two source pixels only.
  let guarded = mask;
  for (let pass = 0; pass < spec.guard_pixels; pass++) {
    const next = Buffer.from(guarded);
    for (let i = 0; i < guarded.length; i++) {
      const x = i % width, y = Math.floor(i / width);
      if (guarded[i] || (x > 0 && guarded[i - 1]) || (x < width - 1 && guarded[i + 1]) ||
          (y > 0 && guarded[i - width]) || (y < height - 1 && guarded[i + width])) next[i] = 255;
    }
    guarded = next;
  }
  const target = resolve(root, `public/monster/${id}`);
  await sharp(guarded, { raw: { width, height, channels: 1 } }).png().toFile(resolve(target, 'mask.png'));
  // Rebuild only mask-dependent art, using the same dark veil as the original
  // monster packer. Completion paintings, rewards and rescued portraits stay intact.
  const sealed = Buffer.alloc(rgb.length);
  for (let i = 0; i < guarded.length; i++) {
    const offset = i * 3;
    const luminance = Math.round(rgb[offset] * .299 + rgb[offset + 1] * .587 + rgb[offset + 2] * .114);
    for (let c = 0; c < 3; c++) sealed[offset + c] = guarded[i] ? [32, 32, 44][c]
      : Math.floor(Math.floor(luminance * .75 + rgb[offset + c] * .25) * .52);
  }
  const raw = { width, height, channels: 3 };
  await sharp(sealed, { raw }).webp({ quality: 88, effort: 5 }).toFile(resolve(target, 'sealed.webp'));
  const [left, top, size] = spec.portrait_crop;
  await sharp(sealed, { raw }).extract({ left, top, width: size, height: size }).resize(320, 320)
    .webp({ quality: 88 }).toFile(resolve(target, 'portrait-sealed.webp'));
  spec.mask_sha256 = digest(readFileSync(resolve(target, 'mask.png')));
  spec.sealed_sha256 = digest(readFileSync(resolve(target, 'sealed.webp')));
  spec.portrait_sealed_sha256 = digest(readFileSync(resolve(target, 'portrait-sealed.webp')));
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
  console.log(`Level ${id}: extracted matte packaged; ${(guarded.filter(v => v > 0).length / guarded.length * 100).toFixed(1)}% character; seal and portrait synchronized`);
}
