/** Align the generated 2 × 2 animation by its bright core, then pack four frames.
 * Run: node scripts/pack-player-spirit.mjs (requires ffmpeg and ffprobe).
 * Only translates and uniformly resizes the generated pixels; no per-frame crop.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'art/ui/player-spirit-atlas.webp');
const { streams: [{ width, height }] } = JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', source,
], { encoding: 'utf8' }));
if (width !== height || width % 2) throw new Error('Expected a square 2 × 2 atlas');
const cell = width / 2;
const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-f', 'rawvideo',
  '-pix_fmt', 'rgba', '-frames:v', '1', 'pipe:1'], { maxBuffer: 32 * 1024 * 1024 });
const packed = Buffer.alloc(cell * 4 * cell * 4);
for (let frame = 0; frame < 4; frame++) {
  const ox = frame % 2 * cell, oy = Math.floor(frame / 2) * cell;
  let sx = 0, sy = 0, weight = 0;
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
    const i = ((oy + y) * width + ox + x) * 4;
    if (pixels[i] < 240 || pixels[i + 1] < 235 || pixels[i + 3] < 240) continue;
    const w = Math.max(0, pixels[i + 2] - 190);
    sx += x * w; sy += y * w; weight += w;
  }
  if (weight < 1000) throw new Error(`Missing bright core in frame ${frame + 1}`);
  const dx = Math.round(cell / 2 - sx / weight), dy = Math.round(cell / 2 - sy / weight);
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
    const tx = x + dx, ty = y + dy, from = ((oy + y) * width + ox + x) * 4;
    if (tx < 0 || ty < 0 || tx >= cell || ty >= cell) {
      if (pixels[from + 3] > 16) throw new Error(`Frame ${frame + 1} would clip`);
      continue;
    }
    pixels.copy(packed, (ty * cell * 4 + frame * cell + tx) * 4, from, from + 4);
  }
  console.log(`Frame ${frame + 1}: core (${(sx / weight).toFixed(1)}, ${(sy / weight).toFixed(1)}), shift (${dx}, ${dy})`);
}
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
  '-s', `${cell * 4}x${cell}`, '-i', 'pipe:0', '-vf', 'scale=512:128:flags=lanczos',
  '-frames:v', '1', '-c:v', 'libwebp', '-lossless', '1', '-compression_level', '6',
  resolve(root, 'public/sprites/player-spirit.webp')], { input: packed });
