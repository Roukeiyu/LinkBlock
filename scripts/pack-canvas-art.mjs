/** Package already-generated 3:2 artwork; never crop or stretch to hide a wrong canvas.
 * node scripts/pack-canvas-art.mjs /path/to/generated_images
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageDimensions } from './image-dimensions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = process.argv[2];
if (!generated) throw new Error('Supply the generated PNG directory.');
const manifest = JSON.parse(readFileSync(resolve(root, 'art/canvas/v8-sources.json'), 'utf8'));
for (const [level, sources] of Object.entries(manifest.levels)) {
  const folder = resolve(root, 'public/levels', level, manifest.version);
  mkdirSync(folder, { recursive: true });
  for (const [kind, source] of Object.entries(sources)) {
    const input = resolve(source.origin === 'public' ? resolve(root, 'public') : generated, source.file);
    const { width, height } = imageDimensions(input);
    if (width * manifest.height !== height * manifest.width) throw new Error(`Outpaint to 3:2 first: ${input} (${width} × ${height})`);
    const mask = kind === 'mask';
    const output = resolve(folder, `${kind}.${mask ? 'png' : 'webp'}`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-frames:v', '1',
      '-vf', `scale=${manifest.width}:${manifest.height}:flags=${mask ? 'neighbor' : 'lanczos'}`,
      ...(mask ? [] : ['-c:v', 'libwebp', '-quality', '93', '-compression_level', '6']), output]);
    console.log(`${level}/${kind}: ${width} × ${height} → ${manifest.width} × ${manifest.height}`);
  }
}
