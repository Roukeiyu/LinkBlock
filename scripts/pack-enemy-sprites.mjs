/** Package the generated 3 × 2 atlases into the game's six transparent sprites.
 * Run: node scripts/pack-enemy-sprites.mjs (requires ffmpeg and ffprobe).
 * Add --early for the five redrawn small enemies in chapters 1 and 4.
 * Each cell is cropped only to its alpha bounds, keeping the generated pixels.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Atlas reading order is three straight looks, orbit, zigzag, then boss.
// The renderer's legacy look keys differ from that reading order.
const names = ['mist', 'spore', 'crow', 'thorn', 'ghost', 'boss'];

const early = process.argv.includes('--early');
const jobs = early
  ? [1, 4].map(level => ({ level, version: 'v3', count: 5, source: `art/early/${level}-sprites-v3.webp` }))
  : [6, 7, 8, 9, 10].map(level => ({ level, version: 'v2', count: 6, source: `art/expansion/${level}-sprites.webp` }));

for (const { level, version, count, source } of jobs) {
  const atlas = resolve(root, source);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', atlas], { encoding: 'utf8' }));
  const { width, height } = probe.streams[0];
  if (width % 3 || height % 2) throw new Error(`Invalid atlas grid: ${atlas}`);
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', atlas, '-f', 'rawvideo',
    '-pix_fmt', 'rgba', '-frames:v', '1', 'pipe:1'], { maxBuffer: 32 * 1024 * 1024 });
  const cw = width / 3, ch = height / 2;
  const folder = resolve(root, 'public/levels', String(level), version);
  mkdirSync(folder, { recursive: true });
  for (let cell = 0; cell < count; cell++) {
    const ox = cell % 3 * cw, oy = Math.floor(cell / 3) * ch;
    let left = cw, right = -1, top = ch, bottom = -1, filled = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (pixels[((oy + y) * width + ox + x) * 4 + 3] <= 16) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y); filled++;
    }
    if (filled < 100 || filled > cw * ch * .9) throw new Error(`Missing transparency/creature: ${level}/${cell}`);
    if (left < 2 || top < 2 || right > cw - 3 || bottom > ch - 3) throw new Error(`Creature touches cell edge: ${level}/${cell}`);
    left = Math.max(0, left - 4); top = Math.max(0, top - 4);
    right = Math.min(cw - 1, right + 4); bottom = Math.min(ch - 1, bottom + 4);
    const crop = `crop=${right - left + 1}:${bottom - top + 1}:${ox + left}:${oy + top},scale=256:256:force_original_aspect_ratio=decrease`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', atlas, '-vf', crop, '-frames:v', '1',
      '-c:v', 'libwebp', '-quality', '90', '-compression_level', '6', resolve(folder, `${names[cell]}.webp`)]);
    console.log(`${level}/${names[cell]}: ${right - left + 1} × ${bottom - top + 1} source pixels`);
  }
}
