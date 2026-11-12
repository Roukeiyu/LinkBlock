/** Standalone art experiment. The game's LEVELS and reward catalog stay authoritative. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageDimensions } from './image-dimensions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(resolve(root, 'art/canvas/level-2-layered-preview.json'), 'utf8'));
const asset = name => `../${config.directory}/${name}`;
const tiers = Object.entries(config.tiers).map(([key, tier]) => ({
  key, label: tier.label, composite: asset(`${key}.webp`),
  character: asset(`character-${key}.webp`), alpha: asset(`alpha-${key}.png`),
}));
for (const file of ['background.webp', ...tiers.flatMap(t => [`${t.key}.webp`, `character-${t.key}.webp`, `alpha-${t.key}.png`])]) {
  const { width, height } = imageDimensions(resolve(root, 'public', config.directory, file));
  if (width !== config.width || height !== config.height) throw new Error(`Layered preview canvas mismatch: ${file}`);
}
const stage = prefix => `<div class="stage checker" id="${prefix}-stage" aria-label="拆分效果预览">
  <img class="plate" src="${asset('background.webp')}" alt="三档共用的沙漠神殿背景">
  <img class="character" src="${tiers[0].character}" alt="通关角色透明图层">
  <img class="alpha" src="${tiers[0].alpha}" alt="从角色透明度直接导出的轮廓" hidden>
</div>`;
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第二关 · 拆分试作</title><style>
*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#19191d;color:#eee8dd;font:15px/1.6 system-ui,sans-serif}main{max-width:1480px;padding:28px;margin:auto}h1{font-size:clamp(26px,4vw,38px);margin:8px 0}h2{font-size:20px;margin:0}p{color:#bfb8ac;margin:8px 0}a{color:#e7c386}button,select{font:inherit;color:inherit;background:#2c2924;border:1px solid #645a48;border-radius:7px;padding:8px 14px;cursor:pointer}button:hover{background:#41392e}button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid #eccc88;outline-offset:4px}button[aria-pressed=true]{border-color:#e8c782;background:#483c29;color:#fff2d5}.badge{display:inline-block;color:#edcc8b;border:1px solid #6c5b3e;border-radius:99px;padding:3px 12px;font-size:13px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.toolbar{justify-content:space-between;margin:20px 0 12px}.modes{display:flex;gap:8px;flex-wrap:wrap}.stage{width:100%;aspect-ratio:3/2;position:relative;overflow:hidden;border:1px solid #4a4240;border-radius:10px}.checker{background-color:#3d3d43;background-image:linear-gradient(45deg,#29292e 25%,transparent 25%),linear-gradient(-45deg,#29292e 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#29292e 75%),linear-gradient(-45deg,transparent 75%,#29292e 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}.stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.stage .alpha{background:#000}.preview{max-width:1100px;margin:auto}.caption{justify-content:space-between;margin:12px 0}.caption strong{font-size:17px}.caption small{color:#bfb8ac}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:22px 0 32px}.card{padding:0;overflow:hidden;border-radius:10px;background:#232329;text-align:left}.card img{display:block;width:100%;aspect-ratio:3/2}.card span{display:block;padding:10px 12px}.note{background:#242329;border:1px solid #3b3735;border-radius:10px;padding:15px 18px;margin-top:22px}.note p{margin:4px 0}.files{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:13px}.navbtn{font-size:18px;padding:5px 16px}dialog{padding:12px;background:#19191d;color:#eee8dd;border:1px solid #756445;border-radius:12px;width:min(96vw,1500px);max-height:96dvh;overflow:auto}dialog::backdrop{background:#000d}dialog .stage{max-width:min(100%,calc(78dvh * 1.5));margin:auto}dialog footer{justify-content:space-between;padding:12px 0 0}[hidden]{display:none!important}@media(max-width:650px){main{padding:18px 12px}.grid{gap:8px}.card span{padding:8px;font-size:12px}.toolbar{gap:14px}.modes{gap:5px}.modes button{padding:7px 10px}.caption{gap:8px}.caption strong{font-size:15px}.note{padding:12px}dialog{padding:8px}}
</style></head><body><main>
<a href="rewards.html">← 全关卡奖励合集</a>
<h1>第二关 · 拆分试作</h1><span class="badge">独立预览 · 尚未替换游戏素材</span>
<p>同一张神殿背景，端坐、盘坐、侧坐三种动作。先看人物与场景是否贴合，再决定是否采用。</p>
<div class="grid" aria-label="三档合成效果">${tiers.map((t, i) => `<button class="card" data-tier="${i}" aria-pressed="${i === 0}"><img src="${t.composite}" alt="${t.label}合成效果"><span>${t.label}</span></button>`).join('')}</div>
<div class="preview">
<div class="toolbar row"><div class="modes" aria-label="查看图层"><button data-mode="composite" aria-pressed="true">合成效果</button><button data-mode="background" aria-pressed="false">仅背景</button><button data-mode="character" aria-pressed="false">透明角色</button><button data-mode="alpha" aria-pressed="false">Alpha 轮廓</button></div><button id="enlarge">放大查看</button></div>
${stage('main')}
<div class="caption row"><div><strong id="caption" aria-live="polite"></strong><br><small id="mode-note"></small></div><div class="row"><button class="navbtn previous" aria-label="上一张">‹</button><span class="position"></span><button class="navbtn next" aria-label="下一张">›</button></div></div>
<div class="files"><a id="download-composite" download>保存合成图</a><a id="download-character" download>保存透明角色</a><a href="${asset('background.webp')}" download>保存共用背景</a><a id="download-alpha" download>保存 Alpha</a></div>
</div>
<div class="note"><h2>这次主要看什么</h2><p>三张图的建筑、河流与远景位置完全一致；坐姿改变时，手掌和臀部应自然落在石座上。</p><p>「透明角色」用方格底检查边缘，「Alpha 轮廓」直接读取同一角色的透明度，便于核对封印边界。背景保留前、中、远景，减少碎纹和颗粒。</p><p>本页仅试作第二关。当前游戏及原有 30 张奖励图均保留。</p></div>
</main><dialog id="viewer" aria-label="拆分效果放大预览">${stage('full')}<footer class="row"><span id="full-caption"></span><div class="row"><button class="previous" aria-label="上一张">‹</button><span class="position"></span><button class="next" aria-label="下一张">›</button><button id="close" autofocus>关闭</button></div></footer></dialog>
<script>
const tiers=${JSON.stringify(tiers)};
let current=0,mode='composite';
const viewer=document.querySelector('#viewer');
const names={composite:'同一张背景 + 当前角色 · 1536 × 1024',background:'三档共用这一张背景 · 1536 × 1024',character:'方格表示透明区域 · 1536 × 1024',alpha:'白色为角色，黑色为透明背景 · 从角色 Alpha 直接导出'};
function update(){
 const tier=tiers[current];
 document.querySelectorAll('.stage').forEach(stage=>{
  stage.querySelector('.plate').hidden=mode!=='composite'&&mode!=='background';
  const character=stage.querySelector('.character');character.src=tier.character;character.alt=tier.label+'透明角色';character.hidden=mode!=='composite'&&mode!=='character';
  const alpha=stage.querySelector('.alpha');alpha.src=tier.alpha;alpha.hidden=mode!=='alpha';
 });
 document.querySelectorAll('[data-tier]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.tier)===current)));
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 document.querySelector('#caption').textContent=tier.label;
 document.querySelector('#full-caption').textContent=tier.label+' / '+names[mode];
 document.querySelector('#mode-note').textContent=names[mode];
 document.querySelectorAll('.position').forEach(el=>el.textContent=(current+1)+' / 3');
 for(const key of ['composite','character','alpha']){const a=document.querySelector('#download-'+key);a.href=tier[key];a.download='level-2-'+tier.key+'-'+key+(key==='alpha'?'.png':'.webp');}
}
function step(delta){current=(current+delta+tiers.length)%tiers.length;update();}
document.querySelectorAll('[data-tier]').forEach(b=>b.onclick=()=>{current=Number(b.dataset.tier);update();});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;update();});
document.querySelectorAll('.previous').forEach(b=>b.onclick=()=>step(-1));document.querySelectorAll('.next').forEach(b=>b.onclick=()=>step(1));
document.querySelector('#enlarge').onclick=()=>viewer.showModal();document.querySelector('#close').onclick=()=>viewer.close();viewer.onclick=e=>{if(e.target===viewer)viewer.close();};
document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}});
document.querySelectorAll('.stage').forEach(stage=>{let start=null;stage.addEventListener('touchstart',e=>{start=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});stage.addEventListener('touchmove',e=>{if(e.touches.length!==1)start=null;},{passive:true});stage.addEventListener('touchend',e=>{const s=start;start=null;if(!s||e.touches.length||e.changedTouches.length!==1)return;const dx=e.changedTouches[0].clientX-s.x,dy=e.changedTouches[0].clientY-s.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1);},{passive:true});stage.addEventListener('touchcancel',()=>{start=null;},{passive:true});});
update();
</script></body></html>`;
const folder = resolve(root, 'public/review');
mkdirSync(folder, { recursive: true });
writeFileSync(resolve(folder, 'level-2-layers.html'), html);
console.log('Layered art preview: chapter 2 only; game artwork unchanged.');
