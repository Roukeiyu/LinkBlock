import { mkdirSync, writeFileSync } from 'node:fs';
import { FACE_REGIONS, FACE_PROTECTION_SCALE, faceProtection } from '../src/faces.ts';

const cards = Object.entries(FACE_REGIONS).map(([path, face], i) => {
  const square = faceProtection(path);
  const x = square.left * face.imageWidth, y = square.top * face.imageHeight;
  const side = (square.right - square.left) * face.imageWidth;
  const image = `<image href="../${path}" width="${face.imageWidth}" height="${face.imageHeight}"/>`;
  return `<figure><h2>第 ${i + 1} 关</h2><svg viewBox="0 0 ${face.imageWidth} ${face.imageHeight}">${image}
    <rect x="${x}" y="${y}" width="${side}" height="${side}" fill="none" stroke="#ff475a" stroke-width="7"/>
    <rect x="${face.x}" y="${face.y}" width="${face.width}" height="${face.height}" fill="none" stroke="#ffe179" stroke-width="4"/>
    </svg><div class="crops"><div><p>提取的头脸区域</p><svg viewBox="${face.x} ${face.y} ${face.width} ${face.height}">${image}</svg></div>
    <div><p>外扩正方形禁区</p><svg viewBox="${x} ${y} ${side} ${side}">${image}</svg></div></div>
    <figcaption>${path}<br>脸部 ${face.width} × ${face.height}px → 禁区 ${side.toFixed(0)} × ${side.toFixed(0)}px</figcaption></figure>`;
}).join('');
mkdirSync('public/review', { recursive: true });
writeFileSync('public/review/faces.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>开场脸部禁区核对</title><style>body{background:#171b24;color:#edf1f7;font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;max-width:1280px}figure{margin:0;padding:16px;background:#252c39;border-radius:12px}h2{margin:0 0 12px}svg{width:100%;display:block}.crops{display:flex;gap:20px;margin:16px 0}.crops>div{width:50%}.crops svg{height:220px}figcaption{font-size:13px;color:#aab6c8;overflow-wrap:anywhere}@media(max-width:700px){main{grid-template-columns:1fr}}</style>
<h1>开场脸部禁区核对</h1><p>黄色：逐张提取的头脸区域。红色：用较长边外扩 ${Math.round((FACE_PROTECTION_SCALE - 1) * 100)}% 得到的正方形禁区。开局岛屿与红框只保留小幅间距，不能接触红框。</p><main>${cards}</main></html>`);
