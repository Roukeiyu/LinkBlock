/** Encode approved monster completion plates and their rescued portraits. */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (let id = 11; id <= 20; id++) {
  const spec = JSON.parse(readFileSync(resolve(root, `art/monster-masks/${id}.json`), 'utf8'));
  const source = readFileSync(resolve(root, spec.source));
  if (createHash('sha256').update(source).digest('hex') !== spec.source_sha256)
    throw new Error(`Level ${id}: artwork changed after its mask was reviewed`);
  const target = resolve(root, `public/monster/${id}`);
  await sharp(source).webp({ quality: 95, effort: 5 }).toFile(resolve(target, 'restored.webp'));
  const [left, top, size] = spec.portrait_crop;
  await sharp(source).extract({ left, top, width: size, height: size }).resize(320, 320)
    .webp({ quality: 88 }).toFile(resolve(target, 'portrait.webp'));
  console.log(`Level ${id}: approved monster completion and portrait encoded`);
}
