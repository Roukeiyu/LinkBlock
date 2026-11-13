import './export-face-review.mjs';
/** Export the active artwork catalog. Optional: --offline /absolute/output/folder */
import { build } from 'esbuild';
import sharp from 'sharp';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ entryPoints: [resolve(root, 'src/levels.ts')], bundle: true,
  platform: 'node', format: 'esm', write: false });
const { LEVELS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
// The manifest also records which human artwork each monster variant follows.
const monsterForms = JSON.parse(readFileSync(resolve(root, 'art/review/monster-forms.json'), 'utf8'));
const monsterFolder = resolve(root, 'public/review/monster-forms');
mkdirSync(monsterFolder, { recursive: true });
for (const level of LEVELS) {
  const variant = monsterForms.levels[level.id];
  for (const [kind, source] of [['restored', level.restored], ['ninety', level.rewardNinety], ['perfect', level.rewardPerfect]]) {
    const image = kind === 'restored' ? variant : variant?.rewards?.[kind];
    if (!image || image.source !== source) throw new Error(`Stale monster review for level ${level.id}: ${kind}`);
    const name = kind === 'restored' ? `${level.id}.png` : `${level.id}-${kind}.png`;
    copyFileSync(resolve(root, 'art/review', image.file), resolve(monsterFolder, name));
  }
}
// Thumbnails are generated from the active originals so review cards never download
// the full-size files. The originals remain available to the viewer and downloads.
const previewFolder = resolve(root, 'public/review/previews');
mkdirSync(previewFolder, { recursive: true });
for (const level of LEVELS) {
  for (const [kind, human] of [['restored', level.restored], ['ninety', level.rewardNinety], ['perfect', level.rewardPerfect]]) {
    const monster = `review/monster-forms/${level.id}${kind === 'restored' ? '' : '-' + kind}.png`;
    for (const [form, source] of [['human', human], ['monster', monster]]) {
      await sharp(resolve(root, 'public', source)).resize(768, 512).webp({ quality: 80 })
        .toFile(resolve(previewFolder, `${level.id}-${kind}-${form}.webp`));
    }
  }
}
const offlineAt = process.argv.indexOf('--offline');
if (offlineAt >= 0 && !process.argv[offlineAt + 1]) throw new Error('--offline requires an output folder');
const destinations = [{ folder: resolve(root, 'public/review'), offline: false }];
if (offlineAt >= 0) destinations.push({ folder: resolve(process.argv[offlineAt + 1]), offline: true });

for (const { folder, offline } of destinations) for (const kind of ['rewards', 'enemies']) {
  const sources = {};
  function ref(file) {
    if (!(file in sources)) {
      const bytes = readFileSync(resolve(root, 'public', file));
      sources[file] = offline ? `data:image/${file.endsWith('.png') ? 'png' : 'webp'};base64,${bytes.toString('base64')}` : `../${file}`;
    }
    return file;
  }
  const levels = LEVELS.map(level => ({ id: level.id, title: level.title, theme: level.theme,
    items: kind === 'rewards' ? [
      { label: '完整成图 · 通关解封', file: ref(level.restored), monster: ref(`review/monster-forms/${level.id}.png`), preview: ref(`review/previews/${level.id}-restored-human.webp`), monsterPreview: ref(`review/previews/${level.id}-restored-monster.webp`), mask: ref(level.mask), monsterMask: ref(`monster/${level.id}/mask.png`), ...(monsterForms.levels[level.id].file !== `monster-forms/${level.id}.png` ? { monsterMaskBase: ref(`monster/${level.id}/restored.webp`) } : {}) },
      { label: '满血通关', file: ref(level.rewardNinety), monster: ref(`review/monster-forms/${level.id}-ninety.png`), preview: ref(`review/previews/${level.id}-ninety-human.webp`), monsterPreview: ref(`review/previews/${level.id}-ninety-monster.webp`) },
      { label: '击败 Boss', file: ref(level.rewardPerfect), monster: ref(`review/monster-forms/${level.id}-perfect.png`), preview: ref(`review/previews/${level.id}-perfect-human.webp`), monsterPreview: ref(`review/previews/${level.id}-perfect-monster.webp`) },
    ] : [
      { label: `Boss · ${level.names.boss}`, file: ref(level.sprites.tree) },
      ...['mist', 'spore', 'crow'].map((key, i) => ({ label: `直行小怪 · ${level.names.straight[i]}`, file: ref(level.sprites[key]) })),
      { label: `环绕小怪 · ${level.names.orbit}`, file: ref(level.sprites.thorn) },
      { label: `折线小怪 · ${level.names.zigzag}`, file: ref(level.sprites.ghost) },
    ],
  }));
  if (kind === 'enemies') ref('sprites/player-spirit.webp');
  const title = kind === 'rewards' ? '全关卡奖励图片' : 'Boss、小怪与玩家标记';
  const description = kind === 'rewards' ? '10 个关卡 · 每关依次为完整成图、满血通关、击败 Boss · 统一 1536 × 1024（3:2）。右侧按钮一键切换全部图片的人形／魔物形态。游戏设置中也可切换角色形态。' : '10 个 Boss · 50 个小怪。保留图片原色，透明素材展示在深色底板上。';
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>封林 · ${title}</title><style>
*{box-sizing:border-box}html{color-scheme:dark;scroll-behavior:smooth}body{margin:0;background:#19191d;color:#eee8dd;font:15px/1.65 system-ui,sans-serif}header,main{max-width:1560px;margin:auto;padding:28px}header{padding-bottom:8px}h1{font-size:clamp(25px,3vw,34px);letter-spacing:.05em;margin:4px 0 10px}h2{font-size:21px;margin:0 0 12px}h2 small{font-size:14px;color:#c3b292;font-weight:400;margin-left:12px}p{margin:6px 0;color:#bfb8ac}a{color:#ebcb8e}nav{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0}nav a{text-decoration:none}button,select{font:inherit;border:1px solid #645a48;background:#2c2924;color:#f0e7d9;border-radius:6px;padding:7px 12px;cursor:pointer}button:hover,nav a:hover{color:#fff2d5}button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid #f4cd7c;outline-offset:4px}section{margin:0 0 36px;scroll-margin:16px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.enemies .grid{grid-template-columns:repeat(6,minmax(0,1fr))}figure{margin:0;background:#232329;border:1px solid #3a3740;border-radius:10px;overflow:hidden;min-width:0}figure button{display:block;width:100%;padding:0;border:0;border-radius:0;background:#121319;cursor:zoom-in}figure img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:contain}.enemies figure img{height:180px;aspect-ratio:auto;padding:14px}.enemies figure:first-child{border-color:#8c7149}figcaption{padding:10px 12px;color:#ddd3c2;font-size:14px}.file{display:block;color:#8e8b94;font:10px/1.5 monospace;overflow-wrap:anywhere;margin-top:4px}dialog{padding:0;border:1px solid #695c48;border-radius:10px;background:#15151a;color:#f5ebd9;max-width:96vw;max-height:96dvh;overflow:auto}dialog::backdrop{background:#000d}dialog img{display:block;max-width:94vw;max-height:80dvh;width:auto;height:auto;object-fit:contain;margin:auto}dialog footer{padding:12px 16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}dialog footer span{flex:1}#player-preview{padding:20px;border:1px solid #65543a;border-radius:12px;background:#242127}.spirit-row{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:18px 0}.spirit-stage{display:flex;align-items:center;justify-content:center;width:224px;height:176px;border-radius:8px;background:#14171e}.spirit-stage.light{background:#d8be8b}.frames{display:flex;gap:10px;flex-wrap:wrap}.frames figure{text-align:center}.frames canvas{display:block;width:96px;height:96px}.frames figcaption{font-size:12px;padding:4px}.note{font-size:13px;color:#b7a98f}[hidden]{display:none!important}@media(max-width:950px){.enemies .grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:650px){header,main{padding:18px 14px}.grid{grid-template-columns:1fr}.enemies .grid{grid-template-columns:repeat(2,minmax(0,1fr))}.enemies figure img{height:140px}h2{font-size:18px}h2 small{display:block;margin:0}.spirit-stage{width:calc(50% - 8px);height:128px}.frames canvas{width:64px;height:64px}#player-preview{padding:14px}}
#form-dock{position:fixed;right:0;bottom:max(24px,env(safe-area-inset-bottom));z-index:50;display:flex;align-items:stretch;border:1px solid #bd9b61;border-right:0;border-radius:12px 0 0 12px;background:#30291ff5;box-shadow:0 4px 18px #0008;overflow:hidden}#form-dock button{display:grid;place-items:center;border:0;border-radius:0;background:transparent;color:#f0e7d9;padding:0;min-height:48px}#form-dock button:hover{background:#584024}#dock-toggle{width:36px}#form-toggle{width:58px;border-left:1px solid #645a48!important}#form-toggle svg{width:36px;height:36px;stroke-width:2}#form-toggle[aria-pressed="true"]{background:#584024;color:#fff0cf}#form-dock svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}#form-dock[data-collapsed="true"] #form-toggle{display:none}#form-dock[data-collapsed="true"] #dock-chevron{transform:rotate(180deg)}#form-status{color:#ebcb8e}#viewer-form-toggle{flex:0 0 auto}
.rewards figcaption{position:relative}.rewards figure:has(.mask-button) figcaption{padding-right:105px}.rewards figure .mask-button{position:absolute;right:10px;top:8px;width:auto;padding:4px 8px;border:1px solid #8b795b;border-radius:5px;background:#332d25;color:#f0e7d9;font-size:12px;cursor:pointer}.rewards figure .mask-button:hover{background:#574933}#mask-viewer{width:min(96vw,1200px)}#mask-stage{position:relative;background:#111;line-height:0}#mask-stage img{width:100%;height:auto;max-width:none;max-height:none}#mask-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#mask-viewer footer{gap:10px}#mask-viewer footer button[aria-pressed="true"]{background:#584024;border-color:#bd9b61}#mask-note{padding:0 16px 12px;color:#b7a98f;font-size:13px}

.viewer-stage{position:relative;min-width:160px}#full{touch-action:pan-y pinch-zoom}.viewer-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:52px;padding:0;background:#15151acc;border-color:#b99b6b;color:#fff4dc;font-size:32px;line-height:1;box-shadow:0 2px 10px #0008}.viewer-nav:hover{background:#493c2ee6}#previous{left:8px}#next{right:8px}#position{flex:0 0 auto;color:#c9b68f;font-variant-numeric:tabular-nums}#caption{min-width:120px}.viewer-help{margin:0;padding:0 16px 12px;font-size:12px;color:#b7a98f}
</style></head><body class="${kind}">${kind === 'rewards' ? '<div id="form-dock" data-collapsed="false"><button id="dock-toggle" type="button" aria-label="收起形态切换" aria-expanded="true" aria-controls="form-toggle" title="收起"><svg id="dock-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button><button id="form-toggle" type="button" data-form-toggle aria-pressed="false" aria-controls="levels" aria-label="切换魔物形态" title="切换魔物形态"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3.5 18v-3.2a5.5 5.5 0 0 1 11 0V18M23 5h3c4.5 0 7 2.5 7 7v2m-3-3 3 3 3-3M30 23l-3-2 .7 4a6 6 0 1 0 10.6 0l.7-4-3 2a6 6 0 0 0-6 0ZM17 35h-3c-4.5 0-7-2.5-7-7v-2m-3 3 3-3 3 3"/></svg></button></div>' : ''}<header><p>封林 / 美术审阅</p><h1>${title}</h1><p>${description}</p>${kind === 'rewards' ? '<p id="form-status" role="status">当前：人形</p>' : ''}<p>点击图片放大，用左右按钮、键盘方向键或左右滑动切图；筛选关卡后只切换该关图片。“保存原图”可下载当前图片。</p><nav><a href="rewards.html">奖励图片</a><a href="enemies.html">Boss / 小怪 / 玩家</a><label>关卡 <select id="level-filter"><option value="all">全部 10 关</option>${levels.map(l => `<option value="${l.id}">${l.title}</option>`).join('')}</select></label></nav></header><main>
${kind === 'enemies' ? `<section id="player-preview"><h2>玩家标记 · 金色灵火</h2><p>亮芯固定，短尾轻轻跳动，四帧循环；游戏中随移动方向转动。</p><div class="spirit-row"><div class="spirit-stage"><canvas class="spirit-loop" width="160" height="160" aria-label="灵火循环动画，深色背景"></canvas></div><div class="spirit-stage light"><canvas class="spirit-loop" width="160" height="160" aria-label="灵火循环动画，浅色背景"></canvas></div><button id="animation-toggle" aria-pressed="true">暂停预览</button></div><div class="frames">${[0,1,2,3].map(i => `<figure><canvas data-frame="${i}" width="128" height="128" aria-label="第 ${i + 1} 帧"></canvas><figcaption>第 ${i + 1} 帧</figcaption></figure>`).join('')}</div><p class="note">上方为放大预览，游戏内以小尺寸显示。<a id="spirit-download" download="player-spirit.webp">保存四帧图集</a></p></section>` : ''}
<div id="levels"></div></main><dialog id="viewer" aria-label="图片放大预览"><div class="viewer-stage"><img id="full" alt=""><button id="previous" class="viewer-nav" aria-label="上一张">‹</button><button id="next" class="viewer-nav" aria-label="下一张">›</button></div><footer><span id="caption" aria-live="polite"></span><span id="position" aria-label="图片位置"></span><a id="download" download>保存原图</a>${kind === 'rewards' ? '<button id="viewer-form-toggle" data-form-toggle aria-pressed="false">切换魔物</button>' : ''}<button id="close" autofocus>关闭</button></footer><p class="viewer-help">← → 切图 · 左右滑动 · Esc 关闭</p></dialog>${kind === 'rewards' ? '<dialog id="mask-viewer" aria-label="Alpha 遮罩审阅"><div id="mask-stage"><img id="mask-base" alt=""><img id="mask-raw" alt="" hidden><canvas id="mask-overlay" width="1536" height="1024"></canvas></div><footer><span id="mask-caption"></span><button id="mask-show-overlay" aria-pressed="true">叠加查看</button><button id="mask-show-raw" aria-pressed="false">黑白遮罩</button><a id="mask-download" download>保存遮罩</a><button id="mask-close" autofocus>关闭</button></footer><p id="mask-note">红色区域为角色遮罩，可对照原图检查边缘；黑白视图显示实际遮罩文件。</p></dialog>' : ''}<script>
const levels=${JSON.stringify(levels)},sources=${JSON.stringify(sources)};
const container=document.querySelector('#levels'),viewer=document.querySelector('#viewer');
const filter=document.querySelector('#level-filter'),full=document.querySelector('#full');
const catalog=levels.flatMap(level=>level.items.map(item=>({...item,levelId:level.id,title:level.title})));
let currentItems=[],currentIndex=0,monsterMode=false;
try{monsterMode=localStorage.getItem('linkblock.review.monster-form')==='true';}catch{}
const cardUpdates=[];
const maskViewer=document.querySelector('#mask-viewer');
let maskRequest=0;
function maskView(raw){
  document.querySelector('#mask-base').hidden=raw;
  document.querySelector('#mask-overlay').hidden=raw;
  document.querySelector('#mask-raw').hidden=!raw;
  document.querySelector('#mask-show-overlay').setAttribute('aria-pressed',String(!raw));
  document.querySelector('#mask-show-raw').setAttribute('aria-pressed',String(raw));
}
async function openMask(level,item){
  const request=++maskRequest,form=monsterMode?'魔物形态':'人形',mask=monsterMode?item.monsterMask:item.mask;
  const base=document.querySelector('#mask-base'),raw=document.querySelector('#mask-raw'),canvas=document.querySelector('#mask-overlay');
  const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);
  const gameMonster=monsterMode&&item.monsterMaskBase;
  base.src=sources[gameMonster||activeFile(item)];base.alt=level.title+' / '+form+(gameMonster?' 游戏中完整成图':' 完整成图');
  raw.src=sources[mask];raw.alt=level.title+' / '+form+' Alpha 遮罩';
  document.querySelector('#mask-caption').textContent=level.title+' / '+form+(gameMonster?' · 游戏中成图与 Alpha 遮罩':' · Alpha 遮罩');
  document.querySelector('#mask-note').textContent='正在加载遮罩…';
  const download=document.querySelector('#mask-download');download.href=sources[mask];download.download='level-'+level.id+'-'+(monsterMode?'monster':'human')+'-mask.png';
  maskView(false);maskViewer.showModal();
  try{
    await raw.decode();if(request!==maskRequest||!maskViewer.open)return;
    if(raw.naturalWidth!==canvas.width||raw.naturalHeight!==canvas.height)throw new Error('遮罩尺寸不匹配');
    context.drawImage(raw,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){
      const a=pixels.data[i+3],coverage=Math.max(pixels.data[i],pixels.data[i+1],pixels.data[i+2],a<255?a:0);
      pixels.data[i]=255;pixels.data[i+1]=45;pixels.data[i+2]=35;pixels.data[i+3]=a>127&&coverage>127?110:0;
    }
    context.putImageData(pixels,0,0);
    document.querySelector('#mask-note').textContent=(gameMonster?'当前叠加的是游戏中使用的魔物成图；审阅图为另一个版本。':'')+'红色区域为角色遮罩，可对照原图检查边缘；黑白视图显示实际遮罩文件。';
  }catch{if(request===maskRequest)document.querySelector('#mask-note').textContent='遮罩加载失败，请关闭后重试。';}
}
if(maskViewer){
  document.querySelector('#mask-show-overlay').onclick=()=>maskView(false);
  document.querySelector('#mask-show-raw').onclick=()=>maskView(true);
  document.querySelector('#mask-close').onclick=()=>maskViewer.close();
  maskViewer.addEventListener('close',()=>{maskRequest++;});
  maskViewer.onclick=e=>{if(e.target===maskViewer)maskViewer.close();};
}
function activeFile(item){return monsterMode&&item.monster?item.monster:item.file;}
function activePreview(item){return monsterMode&&item.monsterPreview?item.monsterPreview:(item.preview||item.file);}
function activeLabel(item){return item.label+(item.monster?' · '+(monsterMode?'魔物形态':'人形'):'');}
function syncForm(){
  document.querySelectorAll('[data-form-toggle]').forEach(button=>{
    const action=monsterMode?'切换人形':'切换魔物形态';
    if(button.id==='form-toggle'){button.setAttribute('aria-label',action);button.title=action;}
    else button.textContent=action;
    button.setAttribute('aria-pressed',String(monsterMode));
  });
  const status=document.querySelector('#form-status');
  if(status)status.textContent='当前：'+(monsterMode?'魔物形态':'人形');
  cardUpdates.forEach(update=>update());
  if(viewer.open)showImage(currentIndex);
}
const dock=document.querySelector('#form-dock'),dockToggle=document.querySelector('#dock-toggle');
if(dockToggle)dockToggle.onclick=()=>{
  const collapsed=dock.dataset.collapsed!=='true';
  dock.dataset.collapsed=String(collapsed);
  dockToggle.setAttribute('aria-expanded',String(!collapsed));
  dockToggle.setAttribute('aria-label',collapsed?'展开形态切换':'收起形态切换');
  dockToggle.title=collapsed?'展开':'收起';
};
document.querySelectorAll('[data-form-toggle]').forEach(button=>button.onclick=()=>{
  monsterMode=!monsterMode;
  try{localStorage.setItem('linkblock.review.monster-form',String(monsterMode));}catch{}
  syncForm();
});
function showImage(index){
  currentIndex=(index+currentItems.length)%currentItems.length;
  const item=currentItems[currentIndex],file=activeFile(item),label=item.title+' / '+activeLabel(item);
  full.src=sources[file];full.alt=label;
  document.querySelector('#caption').textContent=label;
  document.querySelector('#position').textContent=(currentIndex+1)+' / '+currentItems.length;
  const download=document.querySelector('#download');download.href=full.src;
  download.download='level-'+item.levelId+'-'+file.split('/').pop();
}
function openImage(levelId,file){
  currentItems=catalog.filter(item=>filter.value==='all'||String(item.levelId)===filter.value);
  showImage(currentItems.findIndex(item=>item.levelId===levelId&&item.file===file));
  viewer.showModal();
}
document.querySelector('#previous').onclick=()=>showImage(currentIndex-1);
document.querySelector('#next').onclick=()=>showImage(currentIndex+1);
viewer.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
    event.preventDefault();showImage(currentIndex+(event.key==='ArrowLeft'?-1:1));
  }
});
let swipeStart=null;
full.addEventListener('touchstart',event=>{
  swipeStart=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
},{passive:true});
full.addEventListener('touchmove',event=>{if(event.touches.length!==1)swipeStart=null;},{passive:true});
full.addEventListener('touchend',event=>{
  const start=swipeStart;swipeStart=null;
  if(!start||event.touches.length||event.changedTouches.length!==1)return;
  const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;
  if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.5)showImage(currentIndex+(dx<0?1:-1));
},{passive:true});
full.addEventListener('touchcancel',()=>{swipeStart=null;},{passive:true});
viewer.addEventListener('close',()=>{swipeStart=null;});
// Retain decoded preview images for the life of the page. Limit concurrent work
// and prioritize visible cards before progressively filling the rest of the cache.
const previewCache=new Map(),previewCards=[];
let activePreloads=0,preloadsStarted=false,backgroundAllowed=false;
function pumpPreviews(){
  if(!preloadsStarted)return;
  while(activePreloads<4){
    const jobs=[...previewCache.values()];
    const job=jobs.find(job=>job.state==='queued'&&job.priority)||
      (backgroundAllowed&&jobs.find(job=>job.state==='queued'));
    if(!job)break;
    job.state='loading';activePreloads++;
    const image=new Image();image.src=sources[job.path];
    image.decode().then(()=>{job.state='ready';job.image=image;job.resolve(image);},()=>{
      previewCache.delete(job.path);job.resolve(null);
    }).finally(()=>{activePreloads--;pumpPreviews();});
  }
}
function preparePreview(path,priority=false){
  let job=previewCache.get(path);
  if(!job){
    job={path,priority,state:'queued'};
    job.promise=new Promise(resolve=>{job.resolve=resolve;});
    previewCache.set(path,job);
  }else if(priority)job.priority=true;
  pumpPreviews();
  return job.promise;
}
function inViewport(figure){
  const rect=figure.getBoundingClientRect();
  return rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;
}
const preloadObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.updatePreload(entry.isIntersecting)),{rootMargin:'400px'}):null;
for(const level of levels){
  const section=document.createElement('section');section.dataset.level=String(level.id);
  const h=document.createElement('h2');h.textContent=level.title;
  const small=document.createElement('small');small.textContent=level.theme;h.append(small);
  const grid=document.createElement('div');grid.className='grid';
  for(const item of level.items){
    const figure=document.createElement('figure'),button=document.createElement('button'),img=document.createElement('img');
    const cap=document.createElement('figcaption'),label=document.createElement('span'),file=document.createElement('span'),size=document.createElement('span');
    img.loading='lazy';img.decoding='async';
    img.onload=()=>{size.textContent=item.preview?'1536 × 1024':img.naturalWidth+' × '+img.naturalHeight;};
    button.append(img);button.onclick=()=>openImage(level.id,item.file);
    file.className='file';size.className='dimensions';size.style.display='block';size.style.minHeight='1.65em';
    let nearby=false, generation=0;
    function preloadBoth(priority){return [preparePreview(item.preview,priority),preparePreview(item.monsterPreview,priority)];}
    figure.updatePreload=visible=>{nearby=visible;if(visible)preloadBoth(true);};
    if(item.preview){previewCards.push({figure,preloadBoth});if(preloadObserver)preloadObserver.observe(figure);}
    cardUpdates.push(()=>{
      const path=activeFile(item),preview=activePreview(item),caption=activeLabel(item),token=++generation;
      const apply=()=>{img.src=sources[preview];img.alt=level.title+' / '+caption;
        label.textContent=caption;file.textContent=path;size.textContent='';
        if(img.complete&&img.naturalWidth)img.onload();};
      if(item.preview&&(nearby||inViewport(figure))&&img.getAttribute('src')){
        preloadBoth(true);preparePreview(preview,true).then(image=>{if(image&&token===generation)apply();});
      }else apply();
    });
    cap.append(label,size,file);
    if(item.mask){const maskButton=document.createElement('button');maskButton.className='mask-button';maskButton.textContent='查看 Alpha';maskButton.setAttribute('aria-label',level.title+' 查看 Alpha 遮罩');maskButton.onclick=()=>openMask(level,item);cap.append(maskButton);}
    figure.append(button,cap);grid.append(figure);
  }
  section.append(h,grid);container.append(section);
}
syncForm();
const initialPreviews=previewCards.filter(card=>inViewport(card.figure)).flatMap(card=>card.preloadBoth(true));
previewCards.forEach(card=>card.preloadBoth(false));
preloadsStarted=true;pumpPreviews();
Promise.all(initialPreviews).then(()=>{backgroundAllowed=true;pumpPreviews();});
document.querySelector('#level-filter').onchange=e=>{for(const s of container.children)s.hidden=e.target.value!=='all'&&s.dataset.level!==e.target.value;};
document.querySelector('#close').onclick=()=>viewer.close();viewer.onclick=e=>{if(e.target===viewer)viewer.close();};
if(document.querySelector('#player-preview')){const sheet=new Image();sheet.src=sources['sprites/player-spirit.webp'];document.querySelector('#spirit-download').href=sheet.src;const reduced=matchMedia('(prefers-reduced-motion: reduce)');let playing=!reduced.matches,frame=0,previous=0,elapsed=0;const toggle=document.querySelector('#animation-toggle');function sync(){toggle.textContent=playing?'暂停预览':'播放预览';toggle.setAttribute('aria-pressed',String(playing));}toggle.onclick=()=>{playing=!playing;sync();};reduced.onchange=()=>{playing=!reduced.matches;frame=0;elapsed=0;sync();};function draw(canvas,f){const c=canvas.getContext('2d'),cell=sheet.naturalWidth/4;c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(sheet,f*cell,0,cell,sheet.naturalHeight,0,0,canvas.width,canvas.height);}sheet.onload=()=>{document.querySelectorAll('[data-frame]').forEach(c=>draw(c,Number(c.dataset.frame)));function animate(now){if(playing)elapsed+=Math.min(50,now-previous);previous=now;frame=Math.floor(elapsed*6/1000)%4;document.querySelectorAll('.spirit-loop').forEach(c=>draw(c,frame));requestAnimationFrame(animate);}sync();requestAnimationFrame(animate);};}
</script></body></html>`;
  mkdirSync(folder, { recursive: true });
  const output = resolve(folder, `${kind}.html`);
  writeFileSync(output, html);
  console.log(`${output}: ${levels.reduce((sum, l) => sum + l.items.length, 0)} cards, ${Object.keys(sources).length} image assets, ${Buffer.byteLength(html)} bytes${offline ? ', self-contained' : ''}`);
}
