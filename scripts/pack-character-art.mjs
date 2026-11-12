/** Encode generated character plates and normalize their authored masks.
 * Usage: node scripts/pack-character-art.mjs /path/to/generated_images [manifest.json]
 * Creative artwork is generated separately; this only packages its pixels.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Supply the directory containing the generated source PNGs.');
const manifestPath = process.argv[3] ?? 'art/expansion/v3-sources.json';
const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
const { width, height, version } = manifest;

for (const [level, sources] of Object.entries(manifest.levels)) {
  const folder = resolve(root, 'public/levels', level, version);
  mkdirSync(folder, { recursive: true });
  for (const [name, source] of Object.entries(sources)) {
    const input = resolve(sourceRoot, source);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
      'stream=width,height', '-of', 'json', input], { encoding: 'utf8' })).streams[0];
    if (probe.width !== width || probe.height !== height) throw new Error(`Wrong canvas: ${input}`);
    if (name !== 'mask') {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-frames:v', '1',
        '-c:v', 'libwebp', '-quality', '90', '-compression_level', '6', resolve(folder, `${name}.webp`)]);
      continue;
    }
    const gray = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-frames:v', '1',
      '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { maxBuffer: width * height * 2 });
    const mask = Uint8Array.from(gray, value => value > 127 ? 255 : 0);
    // Generated masks can retain little finger/fabric lines inside the figure.
    // Close only small enclosed black components; real exterior gaps remain.
    const visited = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
    let filled = 0;
    for (let start = 0; start < mask.length; start++) {
      if (mask[start] || visited[start]) continue;
      let head = 0, tail = 1, touchesEdge = false;
      queue[0] = start; visited[start] = 1;
      while (head < tail) {
        const i = queue[head++], x = i % width, y = Math.floor(i / width);
        if (!x || x === width - 1 || !y || y === height - 1) touchesEdge = true;
        for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1,
          y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
          if (next < 0 || mask[next] || visited[next]) continue;
          visited[next] = 1; queue[tail++] = next;
        }
      }
      if (!touchesEdge && tail <= 8192) {
        for (let i = 0; i < tail; i++) mask[queue[i]] = 255;
        filled += tail;
      }
    }
    // A three-pixel guard keeps antialiased character fringes under the veil.
    let guarded = mask;
    for (let pass = 0; pass < 3; pass++) {
      const next = guarded.slice();
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (guarded[i] || guarded[i - 1] || guarded[i + 1] || guarded[i - width] || guarded[i + width]) next[i] = 255;
      }
      guarded = next;
    }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'gray',
      '-video_size', `${width}x${height}`, '-i', 'pipe:0', '-frames:v', '1', resolve(folder, 'mask.png')],
    { input: Buffer.from(guarded) });
    console.log(`${level}: character ${(guarded.filter(v => v > 0).length / guarded.length * 100).toFixed(1)}%, closed ${filled} interior pixels`);
  }
}
