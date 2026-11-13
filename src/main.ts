import './style.css';
import { Game, type Direction, type GameEvent } from './engine';
import { ENEMY_STYLES } from './enemies';
import { renderEnemy, renderPlayerSpirit } from './render-enemies';
import { OPENING_SECONDS, openingPercent } from './opening';
import { DragJoystick } from './joystick';
import { bindLandscapes, clipPolygons, drawLandscape, lakeDissolve, lakeTheme, polygonPath, enemyCelebration, bossHitPulse, sealBreak, type CaptureEffect } from './effects';
import { codexForProgress, applyUnlocks, readCodex, rewardsFor, writeCodex, type Codex, type RewardId } from './rewards';
import { LEVELS, bossConfigFor, gameOptionsFor, levelById, noteClear, readLevelProgress, writeLevelProgress, type LevelDef, type LevelProgress } from './levels';
import { maskFromPixels } from './completion';
import { useSpriteSheet } from './render-enemies';
import { lakeAudio, MENU_MUSIC } from './audio';
import { POWER_UP_KINDS, POWER_UP_LABELS, POWER_UP_RADIUS, type PowerUp } from './powerups';

const ui = (name: string) => `${import.meta.env.BASE_URL}ui/${name}`;
const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    levels: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
    gallery: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
    guide: '<path d="M12 5v16M3 3c4-1 6 0 9 2 3-2 5-3 9-2v16c-4-1-6 0-9 2-3-2-5-3-9-2V3Z"/>',
    settings: '<path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="title-screen" class="title-screen">
    <div class="candle-glow" aria-hidden="true"></div>
    <div class="dust" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="left:${6 + (i * 7) % 88}%;animation-delay:-${i * 0.8}s;animation-duration:${9 + (i % 5)}s"></i>`).join('')}</div>
    <div class="menu-layout">
    <div class="menu-hero">
      <div class="menu-brandmark"><img class="menu-logo" src="${ui('logo.png')}" alt="LinkBlock 解封" /></div>
      <p class="menu-tagline">沿岸而行，以线解封。</p>
      <img class="ink-rule" src="${ui('ink_divider.png')}" alt="" />
    </div>
    <div class="menu-page" aria-label="主菜单">
      <p class="menu-invitation">翻开新的一页</p>
      <button id="menu-start" class="menu-btn menu-primary is-selected" type="button" aria-current="true"><img src="${ui('wax_seal_red.png')}" alt="" /><span>开始游戏</span>${icon('arrow')}</button>
      <nav class="menu-links" aria-label="探索选项">
        <button id="menu-levels" class="menu-btn" type="button">${icon('levels')}<span>选择关卡<small aria-hidden="true">十处秘境</small></span></button>
        <button id="menu-gallery" class="menu-btn" type="button">${icon('gallery')}<span>图鉴<small aria-hidden="true">珍藏画像</small></span></button>
        <button id="menu-guide" class="menu-btn" type="button">${icon('guide')}<span>关卡攻略<small aria-hidden="true">探索指引</small></span></button>
        <button id="menu-settings" class="menu-btn" type="button" aria-expanded="false" aria-controls="menu-settings-panel">${icon('settings')}<span>设置<small aria-hidden="true">音乐、音效与形态</small></span></button>
      </nav>
      <div id="menu-settings-panel" class="menu-settings" hidden>
        <button id="menu-music" class="ink-tab audio-toggle" type="button" aria-pressed="true"><span>音乐开启</span><span class="toggle" aria-hidden="true"></span></button>
        <button id="menu-sfx" class="ink-tab audio-toggle" type="button" aria-pressed="true"><span>音效开启</span><span class="toggle" aria-hidden="true"></span></button>
        <label class="audio-slider">音乐音量 <input id="menu-music-volume" type="range" min="0" max="100" value="62" aria-label="音乐音量"></label>
        <label class="audio-slider">音效音量 <input id="menu-sfx-volume" type="range" min="0" max="100" value="78" aria-label="音效音量"></label>
        <button id="menu-form" class="ink-tab form-setting" type="button" aria-pressed="false">角色形态：人形</button>
        <button id="clear-progress" class="ink-tab clear-progress-button" type="button">清空进度</button>
      </div>
      <div class="menu-progress"><div class="menu-progress-heading"><span>封印进度</span><p id="seal-count" class="seal-count"></p></div><div id="seal-row" class="seal-row"></div></div>
    </div>
    </div>
  </div>
  <header class="site-header">
    <button id="home" class="brand" type="button" aria-label="返回主界面"><img class="brand-logo" src="${ui('logo.png')}" alt="LinkBlock 解封" /></button>
    <div class="top-controls" role="toolbar" aria-label="游戏控制"><button id="combat-help" class="ink-tab" type="button">攻略</button><button id="pause" class="ink-tab" type="button" disabled>${icon('pause')}<span>暂停</span><kbd>P</kbd></button><button id="restart" class="ink-tab" type="button">${icon('reset')}<span>重新开始</span><kbd>R</kbd></button><button id="music" class="ink-tab audio-toggle" type="button" aria-pressed="true" aria-label="音乐"><span>音乐</span><span class="toggle" aria-hidden="true"></span></button><button id="sound" class="ink-tab audio-toggle" type="button" aria-pressed="true" aria-label="音效">${icon('sound')}<span>音效</span><span class="toggle" aria-hidden="true"></span></button><label class="audio-slider"><span>音乐音量</span><input id="music-volume" type="range" min="0" max="100" value="62" aria-label="音乐音量"></label><label class="audio-slider"><span>音效音量</span><input id="sfx-volume" type="range" min="0" max="100" value="78" aria-label="音效音量"></label></div>
  </header>
  <main>
    <section class="intro"><div><p class="eyebrow">解封</p><h1>连接，划出你的领地<span>。</span></h1><p class="intro-copy">画线净化被封住的区域，揭开这一关的封印。</p></div><div class="chapter"><span></span><p>解封</p></div></section>
    <section class="game-layout" aria-label="LinkBlock 游戏">
      <div class="game-main">
        <div class="hud seal-hud">
          <button id="portrait" class="portrait" type="button" aria-label="封印"><img id="portrait-img" class="portrait-face" alt="封印中" /><span class="portrait-ring" aria-hidden="true"></span></button>
          <div class="purity">
            <span id="level-title" class="level-title"></span>
            <div class="purity-bar progress-track" role="progressbar" aria-label="净化进度" aria-valuemin="0" aria-valuemax="75" aria-valuenow="0">
              <span class="sigil bar-sigil" aria-hidden="true"></span>
              <div class="bar-channel">
                <div id="progress-fill" class="bar-fill-window"></div>
                <i class="bar-goal" aria-hidden="true"></i>
              </div>
              <strong id="percent" class="bar-readout">0.0<span>%</span></strong>
            </div>
            <span class="stat-label purity-caption">净化 <span class="muted">/ 75%</span></span>
          </div>
          <div class="hud-side">
            <strong id="lives" class="lives" aria-label="剩余 3 条生命"></strong>
            <strong id="score" class="score">000000</strong>
          </div>
          <div class="badge-row">
            <div class="charms" id="charms" aria-label="本关纪念"><button type="button" class="charm" data-reward="clear" aria-label="通关"><img alt="" /><span>通关</span></button><button type="button" class="charm" data-reward="ninety" aria-label="满血"><img alt="" /><span>满血</span></button><button type="button" class="charm" data-reward="perfect" aria-label="击破"><img alt="" /><span>击破</span></button></div>
          </div>
        </div>
        <div class="board-stage">
          <div class="frame-fit">
            <div class="frame-row top"><div class="rail"></div><span class="sigil clasp" aria-hidden="true"></span></div>
            <div class="frame-row mid">
              <div class="frame-side left"></div>
              <div class="board-hole">
        <div class="board-shell">
          <canvas id="board" width="864" height="576" tabindex="0" aria-label="游戏场地。沿小岛岸线移动，按住空格画线并回到岛岸闭合；裸露外框不能靠岸，松开空格收线，P 暂停。">请使用支持 Canvas 的浏览器游玩 LinkBlock。</canvas>
          <span class="board-corner top-left" aria-hidden="true"></span><span class="board-corner bottom-right" aria-hidden="true"></span>
          <div id="powerup-status" class="powerup-status" role="status" aria-live="off" hidden></div>
          <div id="opening-hint" hidden aria-label="空格或动作键确认起点，5秒后自动选定"></div>
        </div>
              </div>
              <div class="frame-side right"></div>
            </div>
            <div class="frame-row bot"><div class="rail"></div></div>
          </div>
        </div>
        <div class="board-footer"><span><i id="state-dot" class="state-dot"></i><span id="state-label">准备就绪</span></span><span id="elapsed">00:00</span><span id="notice-slot"><span id="toast" class="toast" role="status" aria-live="polite"><span class="toast-full"></span><span class="toast-compact" aria-hidden="true"></span></span></span></div>
        <div class="mobile-game-status"><span><b id="mobile-boss-name">首领</b> <b id="mobile-boss-hp">5 / 5</b></span></div>
        <div class="touch-controls single" aria-label="手机手柄" data-mode="one-hand"><div class="controller-side dpad-side" hidden><div class="dpad"><span class="dpad-hit-area" aria-hidden="true"></span><button data-dir="up" aria-label="向上">↑</button><button data-dir="left" aria-label="向左">←</button><button data-dir="down" aria-label="向下">↓</button><button data-dir="right" aria-label="向右">→</button></div><span>方向</span></div><div class="controller-side draw-side" hidden><button id="touch-draw" aria-label="按住画线，松开收线" aria-pressed="false"><i aria-hidden="true"></i></button><span>按住画线 · 松开收线</span></div><div class="controller-side joystick-side"><button id="joystick" aria-label="单手触控区，任意位置按住滑动画线，松开收线" aria-pressed="false"><span class="joystick-disc" aria-hidden="true"><span class="joystick-guides">＋</span><i class="joystick-knob"></i></span></button><span>区域内任意位置滑动画线 · 松开收线</span></div><button id="control-mode">切换操作方式 <span id="control-mode-name" aria-live="polite">单手 · 自由触控</span></button></div>
      </div>
    </section>
    <footer class="site-footer"><img class="footer-logo" src="${ui('logo.png')}" alt="LinkBlock 解封" /><span>无需下载 · 即刻探索</span></footer>
  </main>
  <div id="modal-shade" hidden></div>
  <div id="overlay" class="overlay" hidden>
    <div class="overlay-card"><p id="overlay-kicker" class="eyebrow">解封</p><div class="territory-symbol" aria-hidden="true"><img id="overlay-seal" class="overlay-seal" alt="" src="${ui('wax_seal_red.png')}" /></div><h2 id="overlay-title">封印还在。<br>这一关在等你。</h2><p id="overlay-copy">按空格或动作键选定随机起点，5 秒后自动选定。<br>净化 75%，解开这一关的封印。</p><p id="reward-note"></p><button id="primary" class="primary-button">开始探索 ${icon('arrow')}</button><button id="next-level" class="primary-button" type="button" hidden>下一关</button><button id="open-levels" class="ghost-button ink-tab" type="button">选关</button><button id="open-gallery" class="ghost-button ink-tab" type="button">图鉴</button><button id="back-menu" class="ghost-button ink-tab" type="button">返回主界面</button><span id="overlay-hint" class="overlay-hint">方向键移动 · 按住空格画线</span></div>
  </div>
  <div id="gallery" class="gallery" hidden>
    <div class="gallery-card" role="dialog" aria-labelledby="gallery-title">
      <div class="gallery-head"><h2 id="gallery-title">图鉴</h2><button id="gallery-form" class="ink-tab form-preview" type="button">按住查看魔物</button><button id="gallery-close" class="ink-tab" type="button">返回</button></div>
      <div id="gallery-grid" class="gallery-sections"></div>
    </div>
  </div>
  <div id="combat-guide" class="gallery" hidden>
    <div class="gallery-card combat-guide-card" role="dialog" aria-labelledby="combat-guide-title">
      <div class="gallery-head"><h2 id="combat-guide-title">关卡攻略</h2><button id="combat-guide-close" class="ink-tab" type="button">返回</button></div>
      ${LEVELS.map(level => {
        const rule = bossConfigFor(level).phases?.at(-1)?.reinforcements;
        const population = rule?.batchSize === 1 ? `<p>场上最多 ${rule.targetCount} 只小怪；首领二阶段起每 ${rule.interval} 秒最多补 1 只，残血不增加数量上限。</p>` : '';
        return `<section><h3>${level.title} · ${level.difficulty}</h3><p>${level.tactic}</p>${population}</section>`;
      }).join('')}
      <p>所有弹幕都能击中角色和未闭合的线。首领 3 血、1 血时强化攻击并补怪；预警方向就是本轮射击方向。</p>
      <p>场上会出现一枚道具，圈入新领地即可获得：沙漏减速让敌人移动速度降低 30%（10 秒，不影响子弹）；雪花止步冻结敌人和子弹（3 秒）；闪电加速让角色速度提高 50%（10 秒）。获得后 10–20 秒出现下一枚。</p>
    </div>
  </div>
  <div id="viewer" class="viewer" hidden><img id="viewer-img" alt="" /><button id="viewer-form" class="ink-tab form-preview" type="button">按住查看魔物</button><button id="viewer-close" class="ink-tab" type="button">关闭</button></div>
  <div id="level-select" class="gallery level-select" hidden>
    <div class="gallery-card" role="dialog" aria-labelledby="levels-title">
      <div class="gallery-head"><h2 id="levels-title">选关</h2><button id="levels-close" class="ink-tab" type="button">返回</button></div>
      <div id="level-list" class="level-list"></div>
    </div>
  </div>
  <div id="clear-progress-dialog" class="gallery confirm-progress" hidden>
    <div class="gallery-card" role="alertdialog" aria-modal="true" aria-labelledby="clear-progress-title" aria-describedby="clear-progress-copy">
      <h2 id="clear-progress-title">清空所有进度？</h2>
      <p id="clear-progress-copy">关卡进度和图鉴奖励将被清空，无法恢复。音乐、音效和角色形态设置会保留。</p>
      <p id="clear-progress-error" role="alert" hidden></p>
      <div class="confirm-actions"><button id="cancel-clear-progress" class="ink-tab" type="button">取消</button><button id="confirm-clear-progress" class="ink-tab" type="button">确认清空</button></div>
    </div>
  </div>`;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
for (const [name, file] of [['--menu-art', 'main_menu.webp'], ['--page-frame', 'page_frame.webp'], ['--parchment', 'parchment_tile.webp'], ['--ink-divider', 'ink_divider.png'], ['--ribbon', 'ribbon_bookmark.png'], ['--wax-red', 'wax_seal_red.png']] as const) {
  document.documentElement.style.setProperty(name, `url('${new URL(ui(file), document.baseURI).href}')`);
}
const canvas = $<HTMLCanvasElement>('#board');
const ctx = canvas.getContext('2d')!;
const overlay = $('#overlay');
const pauseButton = $<HTMLButtonElement>('#pause');
const theme = lakeTheme;
let game = new Game(72, 48, gameOptionsFor(LEVELS[0]));
let current: LevelDef = LEVELS[0];
let progress: LevelProgress = readLevelProgress();
let refreshCard = false;
let lastPhase = '';
let heardRetract = false;
let lineMark = 0;
let hadBoss = false;
let hadJump = false;
let audioPercent = 0;
let touchDraw = false;
let drawHeld = false;
const effects: CaptureEffect[] = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let hitFlash = 0;
let toastUntil = 0;
let openingFrameAt = performance.now();
const held = new Set<Direction>();
const keyboardHeld = new Set<Direction>();
const pointerDirections = new Map<number, Direction>();
const directionPointers = new Set<number>();
const drawPointers = new Set<number>();
const controlModes = ['two-left', 'two-right', 'one-hand'] as const;
let controlModeIndex = 2;
let joystickPointer: number | undefined;
let joystickPoint: { x: number; y: number } | undefined;
let joystickOrigin: { x: number; y: number } | undefined;
let playerFacing = Math.PI;
const joystickInput = new DragJoystick();
const joystickKeys = new Set<string>();
const restored = new Image();
const ruined = new Image();
restored.decoding = 'async';
ruined.decoding = 'async';
restored.src = `${import.meta.env.BASE_URL}${theme.landscape}`;
if (theme.ruinedLandscape) ruined.src = `${import.meta.env.BASE_URL}${theme.ruinedLandscape}`;
function syncScene() { bindLandscapes(restored, ruined, game.width, game.height); }
syncScene();
const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`;
const FORM_KEY = 'linkblock.fenglin.character-form';
let monsterForm = false;
try { monsterForm = localStorage.getItem(FORM_KEY) === 'monster'; } catch { /* Storage may be unavailable. */ }
let previewOtherForm = false;
let viewerCard: GalleryCard | undefined;
const monsterAsset = (level: number, kind: 'restored' | 'ninety' | 'perfect' | 'sealed' | 'mask' | 'portrait' | 'portrait-sealed') =>
  `monster/${level}/${kind}.${kind === 'mask' ? 'png' : 'webp'}`;
const rewardArt = (card: GalleryCard, monster: boolean) => monster
  ? monsterAsset(card.level, card.id === 'clear' ? 'restored' : card.id) : card.src;
function paintFormControls() {
  $('#menu-form').textContent = `角色形态：${monsterForm ? '魔物' : '人形'}`;
  $('#menu-form').setAttribute('aria-pressed', String(monsterForm));
  for (const button of document.querySelectorAll<HTMLButtonElement>('.form-preview')) {
    button.textContent = `按住查看${monsterForm ? '人形' : '魔物'}`;
    button.setAttribute('aria-label', `${button.textContent}，松开还原`);
    button.setAttribute('aria-pressed', String(previewOtherForm));
  }
}
function paintGalleryForm() {
  const form = monsterForm !== previewOtherForm;
  for (const image of document.querySelectorAll<HTMLImageElement>('#gallery-grid .gallery-item img[data-level]')) {
    const card = galleryCards().find(item => item.level === Number(image.dataset.level) && item.id === image.dataset.reward);
    if (card) image.src = asset(rewardArt(card, form));
  }
  if (viewerCard) $<HTMLImageElement>('#viewer-img').src = asset(rewardArt(viewerCard, form));
  paintFormControls();
}
function resetGalleryPreview() { previewOtherForm = false; paintGalleryForm(); }

let codex: Codex = codexForProgress(readCodex(), progress.cleared);
let freshNote = '';
const rewardNames: Record<RewardId, string> = { clear: '通关', ninety: '满血', perfect: '击破' };
interface GalleryCard { level: number; id: RewardId; title: string; src: string; blurb: string; locked: string }
function galleryCards(): GalleryCard[] {
  const first: GalleryCard[] = [
    { level: 1, id: 'clear', title: '阿澈 · 解封', src: LEVELS[0].restored, blurb: '通关后收下的解封画像', locked: '未解锁 · 通关本关' },
    { level: 1, id: 'ninety', title: '满血通关', src: LEVELS[0].rewardNinety, blurb: '通关时生命全满', locked: '未解锁 · 通关时生命全满' },
    { level: 1, id: 'perfect', title: '击败 Boss', src: LEVELS[0].rewardPerfect, blurb: '击败 Boss 通关', locked: '未解锁 · 击败 Boss 通关' },
  ];
  const later = LEVELS.slice(1).flatMap(level => (['clear', 'ninety', 'perfect'] as const).map((id): GalleryCard => ({
    level: level.id,
    id,
    title: `${level.theme} · ${id === 'clear' ? '解封' : id === 'ninety' ? '满血通关' : '击败 Boss'}`,
    src: id === 'clear' ? level.restored : id === 'ninety' ? level.rewardNinety! : level.rewardPerfect!,
    blurb: id === 'clear' ? '通关后收下的解封画像' : id === 'ninety' ? '通关时生命全满' : '击败 Boss 通关',
    locked: id === 'clear' ? '未解锁 · 通关本关' : id === 'ninety' ? '未解锁 · 通关时生命全满' : '未解锁 · 击败 Boss 通关',
  })));
  return [...first, ...later];
}
function paintCharms() {
  for (const charm of document.querySelectorAll<HTMLButtonElement>('.charm')) {
    const id = charm.dataset.reward as RewardId;
    const open = rewardOpen(current.id, id);
    charm.classList.toggle('unlocked', open);
    charm.classList.toggle('locked', !open);
    charm.setAttribute('aria-pressed', String(open));
    charm.title = open ? `${rewardNames[id]}已解锁` : `${rewardNames[id]}未解锁`;
    const image = charm.querySelector('img');
    if (image) image.src = asset(open ? 'ui/wax_seal_gold.png' : 'ui/wax_seal_red.png');
  }
}
function applyAccent(level: LevelDef = current) {
  document.documentElement.style.setProperty('--seal', level.accent);
  const index = document.querySelector('.chapter > span');
  const name = document.querySelector('.chapter p');
  if (index) index.textContent = `${String(level.id).padStart(2, '0')} / ${String(LEVELS.length).padStart(2, '0')}`;
  if (name) name.textContent = level.title;
}
function paintCast() {
  $('#mobile-boss-name').textContent = current.names.boss;
  for (const kind of ['straight', 'orbit', 'zigzag', 'boss'] as const) {
    const name = kind === 'straight' ? current.names.straight.join(' / ') : current.names[kind];
    const node = document.querySelector(`[data-kind="${kind}"] .enemy-name`);
    if (node) node.textContent = name;
  }
}
function paintPortrait() {
  const portrait = $<HTMLImageElement>('#portrait-img');
  const freed = game.phase === 'won';
  const src = asset(monsterForm ? monsterAsset(current.id, freed ? 'portrait' : 'portrait-sealed') : freed ? current.portraitRescued : current.portraitSealed);
  if (portrait.getAttribute('src') !== src) portrait.src = src;
  portrait.alt = freed ? `${current.theme}已解开` : `${current.theme}仍被封印`;
  $('#portrait').setAttribute('aria-label', current.theme);
}
function rewardOpen(levelId: number, id: RewardId) {
  return rewardsFor(codex, levelId)[id] === true;
}
function renderGallery() {
  const cards = galleryCards();
  $('#gallery-grid').innerHTML = LEVELS.map(level => {
    const items = cards.filter(card => card.level === level.id).map(item => {
      const open = rewardOpen(level.id, item.id);
      const picture = open
        ? `<img src="${asset(rewardArt(item, monsterForm !== previewOtherForm))}" data-level="${item.level}" data-reward="${item.id}" alt="" loading="lazy" decoding="async" />`
        : `<span class="sealed-plate" aria-hidden="true"><img src="${asset('ui/wax_seal_red.png')}" alt="" /></span>`;
      const note = open ? item.blurb : item.locked;
      return `<button type="button" class="gallery-item ${open ? 'unlocked' : 'locked'}" data-level="${level.id}" data-reward="${item.id}" ${open ? '' : 'disabled'} aria-label="${item.title}，${note}">${picture}<span>${item.title}</span><small>${note}</small></button>`;
    }).join('');
    return `<section class="gallery-level"><h3>${level.title}</h3><div class="gallery-grid">${items}</div></section>`;
  }).join('');
}
function openGallery() {
  if (game.phase === 'playing' || game.phase === 'opening') togglePause();
  previewOtherForm = false; viewerCard = undefined; renderGallery(); paintFormControls(); $('#viewer').hidden = true; $('#gallery').hidden = false; placeShade();
}
function closeGallery() { resetGalleryPreview(); viewerCard = undefined; $('#gallery').hidden = true; $('#viewer').hidden = true; placeShade(); }

function paintAudio() {
  const { music, sfx, musicVolume, sfxVolume } = lakeAudio.prefs;
  for (const [id, on, label] of [['music', music, '音乐'], ['menu-music', music, '音乐'], ['sound', sfx, '音效'], ['menu-sfx', sfx, '音效']] as const) {
    const button = document.getElementById(id);
    if (!button) continue;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', `${label}${on ? '开启' : '关闭'}`);
    const text = button.querySelector('span');
    if (text) text.textContent = id.startsWith('menu-') ? `${label}${on ? '开启' : '关闭'}` : label;
  }
  ($('#music-volume') as HTMLInputElement).value = String(Math.round(musicVolume * 100));
  ($('#sfx-volume') as HTMLInputElement).value = String(Math.round(sfxVolume * 100));
  ($('#menu-music-volume') as HTMLInputElement).value = String(Math.round(musicVolume * 100));
  ($('#menu-sfx-volume') as HTMLInputElement).value = String(Math.round(sfxVolume * 100));
}
const menuItems = () => [...document.querySelectorAll<HTMLButtonElement>('.menu-page .menu-btn')];
const menuConsumed = new Set<string>();
function paintMenu(index?: number) {
  const buttons = menuItems();
  if (!buttons.length) return;
  const current = index ?? Math.max(0, buttons.findIndex(button => button.classList.contains('is-selected')));
  const selected = ((current % buttons.length) + buttons.length) % buttons.length;
  buttons.forEach((button, i) => {
    const on = i === selected;
    button.classList.toggle('is-selected', on);
    if (on) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}
function paintSealRow() {
  const cleared = progress.cleared.length;
  $('#seal-count').textContent = `已解封 ${cleared}/${LEVELS.length}`;
  $('#seal-row').setAttribute('aria-label', `已解封 ${cleared}/${LEVELS.length}`);
  $('#seal-row').innerHTML = LEVELS.map(level => `<img class="menu-seal" alt="" src="${asset(progress.cleared.includes(level.id) ? 'ui/wax_seal_broken.png' : 'ui/wax_seal_red.png')}" />`).join('');
}
function placeShade() {
  const shade = $('#modal-shade');
  const open = ['#overlay', '#level-select', '#gallery', '#viewer', '#combat-guide', '#clear-progress-dialog'].map(selector => $(selector)).filter(el => !el.hidden);
  if (!open.length) { shade.hidden = true; return; }
  open.forEach((el, index) => { el.style.zIndex = String(40 + index * 2); });
  shade.style.zIndex = String(40 + (open.length - 1) * 2 - 1);
  shade.hidden = false;
}
function hideMenu() {
  $('#title-screen').hidden = true;
  lakeAudio.useTrack(current.music);
}
function showMenu() {
  paintSealRow();
  paintMenu(0);
  lakeAudio.useTrack(MENU_MUSIC);
  $('#title-screen').hidden = false;
  if (game.phase === 'playing' || game.phase === 'opening') togglePause();
  else { overlay.hidden = true; placeShade(); }
}
function followAudio() {
  lakeAudio.setMood(!$('#title-screen').hidden ? 'calm' : game.phase === 'won' ? 'bright' : game.boss ? 'tense' : 'calm');
  const drawing = (drawHeld || touchDraw) && game.phase === 'playing';
  if (game.retracting && !heardRetract && drawing) lakeAudio.play('rebound');
  if (game.retracting) lakeAudio.play('rewind');
  heardRetract = game.retracting;
  const drawingLine = drawing && !game.retracting && game.trail.length > 1;
  lakeAudio.drawHum(drawingLine);
  if (drawingLine && game.trail.length !== lineMark) {
    if (lineMark <= 1) lakeAudio.play('draw-start');
    else lakeAudio.play('draw-tick');
  }
  lineMark = game.trail.length;
  const jumping = Boolean(game.bossJump);
  if (jumping && !hadJump) lakeAudio.play('boss-jump');
  hadJump = jumping;
  if (game.actorsReady && game.boss && !hadBoss) lakeAudio.play('boss');
  hadBoss = Boolean(game.boss);
}

function clearInput() {
  held.clear(); keyboardHeld.clear(); pointerDirections.clear(); directionPointers.clear(); drawPointers.clear(); drawHeld = false; touchDraw = false;
  joystickPointer = undefined; joystickKeys.clear(); resetJoystick(); syncTouchDrawing();
  syncDirectionButtons();
}
function loadLevelArt(level: LevelDef) {
  const restoredPath = monsterForm ? monsterAsset(level.id, 'restored') : level.restored;
  const sealedPath = monsterForm ? monsterAsset(level.id, 'sealed') : level.sealed;
  if (!restored.src.endsWith(restoredPath)) restored.src = asset(restoredPath);
  if (!ruined.src.endsWith(sealedPath)) ruined.src = asset(sealedPath);
  useSpriteSheet(level.sprites);
  loadLevelMask(level);
}
let charMaskImage: HTMLImageElement | undefined;
let auraCanvas: HTMLCanvasElement | undefined;
let maskToken = 0;
let motes: { x: number; y: number; vy: number; r: number; gold: boolean; phase: number }[] = [];
function loadLevelMask(level: LevelDef) {
  const token = ++maskToken;
  charMaskImage = undefined;
  auraCanvas = undefined;
  motes = [];
  game.setCompletionMask(undefined);
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    if (token !== maskToken || !image.naturalWidth) return;
    charMaskImage = image;
    auraCanvas = characterAura(image);
    const scratch = document.createElement('canvas');
    scratch.width = image.naturalWidth; scratch.height = image.naturalHeight;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0);
    game.setCompletionMask(maskFromPixels(scratch.width, scratch.height, context.getImageData(0, 0, scratch.width, scratch.height).data, 4));
  };
  image.src = asset(monsterForm ? monsterAsset(level.id, 'mask') : level.mask);
}
function beginLevel(id: number) {
  current = levelById(id);
  hideMenu(); $('#combat-guide').hidden = true;
  closeGallery(); closeLevels(); clearInput(); freshNote = '';
  loadLevelArt(current);
  applyAccent(current);
  game = new Game(72, 48, gameOptionsFor(current, monsterForm));
  syncScene(); game.start(); effects.length = 0; hitFlash = 0;
  heardRetract = false; lineMark = 0; hadBoss = false; hadJump = false; audioPercent = 0;
  $('#toast').classList.remove('visible');
  openingFrameAt = performance.now();
  refreshCard = true;
  sync(); canvas.focus({ preventScroll: true }); render(performance.now());
}
function restart() { beginLevel(current.id); }
function closeLevels() { $('#level-select').hidden = true; placeShade(); }
function renderLevels() {
  $('#level-list').innerHTML = LEVELS.map(level => {
    const open = level.id <= progress.unlocked;
    const cleared = progress.cleared.includes(level.id);
    return `<button type="button" data-level="${level.id}" title="${level.tactic}" aria-label="${level.title} · ${level.difficulty}。${level.tactic}${open ? '' : ' 尚未解锁'}" style="--seal:${level.accent}" ${open ? '' : 'disabled'}><img class="level-seal" alt="" src="${asset(cleared ? 'ui/wax_seal_broken.png' : 'ui/wax_seal_red.png')}" /><span class="level-copy"><b>${level.title}</b><small>${open ? `${level.difficulty} · ${level.names.boss}` : '尚未解锁'}</small></span></button>`;
  }).join('');
}
function openLevels() {
  if (game.phase === 'playing' || game.phase === 'opening') togglePause();
  renderLevels(); $('#level-select').hidden = false; placeShade();
}
function accountOpeningTime() {
  if (game.phase !== 'opening') return;
  const at = performance.now(); game.update(Math.max(0, (at - openingFrameAt) / 1000)); openingFrameAt = at;
}
function togglePause() {
  accountOpeningTime();
  game.togglePause(); clearInput(); sync();
  openingFrameAt = performance.now();
  if (game.phase === 'playing' || game.phase === 'opening') canvas.focus({ preventScroll: true });
}
function confirmOpening() {
  if (!game.confirmOpening()) return false;
  clearInput(); sync(); canvas.focus({ preventScroll: true }); render(performance.now()); return true;
}

$('#primary').addEventListener('click', () => {
  if (game.phase === 'paused') togglePause();
  else if (game.phase === 'ready') game.start();
  else if (game.phase === 'won' && current.id === LEVELS.length && LEVELS.every(level => progress.cleared.includes(level.id))) beginLevel(1);
  else beginLevel(current.id);
  openingFrameAt = performance.now();
  sync(); canvas.focus({ preventScroll: true }); render(performance.now());
});
pauseButton.addEventListener('click', togglePause);
$('#restart').addEventListener('click', restart);
// Safari's text selection and link/image callouts also apply to the header and
// instructions. Block only native selection/menu/drag defaults, never touches;
// real form fields and editable content retain their normal editing behavior.
function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(element?.closest('input, textarea, select') || element?.closest<HTMLElement>('[contenteditable]')?.isContentEditable);
}
for (const type of ['contextmenu', 'selectstart', 'dragstart']) $('#app').addEventListener(type, event => {
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
}, { capture: true });
$('#control-mode').addEventListener('click', () => {
  clearInput(); controlModeIndex = (controlModeIndex + 1) % controlModes.length;
  const mode = controlModes[controlModeIndex], single = mode === 'one-hand', panel = $('.touch-controls');
  panel.dataset.mode = mode; panel.classList.toggle('swapped', mode === 'two-right'); panel.classList.toggle('single', single);
  $('.dpad-side').hidden = single; $('.draw-side').hidden = single; $('.joystick-side').hidden = !single;
  const label = single ? '单手 · 自由触控' : mode === 'two-right' ? '双手 · 方向在右' : '双手 · 方向在左';
  $('#control-mode-name').textContent = label; $('#control-mode').setAttribute('aria-label', `切换操作方式，当前${label}`);
});
function bindAudioControl(id: string, kind: 'music' | 'sfx') {
  document.getElementById(id)?.addEventListener('click', () => {
    lakeAudio.unlock();
    if (kind === 'music') lakeAudio.setMusic(!lakeAudio.prefs.music);
    else lakeAudio.setSfx(!lakeAudio.prefs.sfx);
    paintAudio();
    lakeAudio.play('click');
  });
}
bindAudioControl('music', 'music');
bindAudioControl('menu-music', 'music');
bindAudioControl('sound', 'sfx');
bindAudioControl('menu-sfx', 'sfx');
function bindVolume(id: string, kind: 'music' | 'sfx') {
  document.getElementById(id)?.addEventListener('input', () => {
    lakeAudio.unlock();
    const value = Number((document.getElementById(id) as HTMLInputElement).value) / 100;
    if (kind === 'music') lakeAudio.setMusicVolume(value);
    else lakeAudio.setSfxVolume(value);
    paintAudio();
  });
}
bindVolume('music-volume', 'music');
bindVolume('sfx-volume', 'sfx');
bindVolume('menu-music-volume', 'music');
bindVolume('menu-sfx-volume', 'sfx');
paintAudio();
window.addEventListener('pointerdown', () => lakeAudio.unlock(), { capture: true });
window.addEventListener('keydown', () => lakeAudio.unlock(), { capture: true });
$('#app').addEventListener('pointerdown', event => {
  const button = (event.target as Element | null)?.closest('button');
  if (!button || button.closest('.dpad, .top-controls, .menu-settings') || ['touch-draw', 'joystick', 'primary', 'restart'].includes(button.id)) return;
  lakeAudio.play('click');
}, { capture: true });

const keyDirections: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
function menuOpen() {
  return $('#clear-progress-dialog').hidden && $('#combat-guide').hidden && !$('#title-screen').hidden && $('#gallery').hidden && $('#level-select').hidden && $('#viewer').hidden;
}
window.addEventListener('keydown', e => {
  if (isEditableTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('#combat-guide').hidden || !$('#title-screen').hidden || !$('#gallery').hidden || !$('#level-select').hidden || !$('#viewer').hidden) return;
  if (e.code === 'Space' && game.phase === 'opening') {
    if (e.target instanceof HTMLButtonElement && !e.target.matches('#touch-draw, #joystick')) return;
    e.preventDefault(); if (!e.repeat) confirmOpening(); return;
  }
  if (keyDirections[e.code] || e.code === 'Space') {
    // Buttons retain normal Space activation; drawing starts from the board.
    if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
  }
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (e.code === 'KeyR') { restart(); return; }
  if (e.code === 'Space') { drawHeld = true; game.resumeDrawing(); }
  const direction = keyDirections[e.code];
  if (direction && game.phase === 'playing') {
    keyboardHeld.add(direction); held.delete(direction); held.add(direction);
  }
});
window.addEventListener('keyup', e => {
  if (menuConsumed.delete(e.code)) return;
  if (e.code === 'Space') {
    drawHeld = false;
    if (!touchDraw) game.beginRetraction();
  }
  const direction = keyDirections[e.code];
  if (direction) { keyboardHeld.delete(direction); releaseDirection(direction); }
});
function backgroundPause() {
  accountOpeningTime();
  if (game.phase === 'playing' || game.phase === 'opening') game.togglePause();
  clearInput(); sync();
}
window.addEventListener('blur', backgroundPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundPause(); });

function releaseDirection(direction: Direction) {
  if (!keyboardHeld.has(direction) && ![...pointerDirections.values()].includes(direction)) held.delete(direction);
}
const dpad = $('.dpad');
const directionButtons = [...dpad.querySelectorAll<HTMLButtonElement>('[data-dir]')];
function syncDirectionButtons() {
  for (const button of directionButtons) button.classList.toggle('is-held', [...pointerDirections.values()].includes(button.dataset.dir as Direction));
}
function updatePointerDirection(e: PointerEvent) {
  if (!directionPointers.has(e.pointerId)) return;
  // Four 90-degree sectors cover the visual pad plus its invisible margin.
  // Coordinates remain valid under pointer capture and after layout changes.
  const box = dpad.getBoundingClientRect();
  const dx = e.clientX - box.x - box.width / 2, dy = e.clientY - box.y - box.height / 2;
  const radius = Math.max(box.width, box.height) / 2 + 18;
  const direction = Math.hypot(dx, dy) > radius ? undefined : cardinalDirection(dx, dy);
  setPointerDirection(e.pointerId, direction);
}
function setPointerDirection(pointerId: number, direction: Direction | undefined) {
  const previous = pointerDirections.get(pointerId);
  if (direction === previous) return;
  pointerDirections.delete(pointerId);
  if (previous) releaseDirection(previous);
  if (direction) {
    pointerDirections.set(pointerId, direction); held.delete(direction); held.add(direction);
  }
  syncDirectionButtons();
}
dpad.addEventListener('pointerdown', e => {
  if (game.phase !== 'playing' || controlModes[controlModeIndex] === 'one-hand') return;
  e.preventDefault(); directionPointers.add(e.pointerId); dpad.setPointerCapture(e.pointerId);
  updatePointerDirection(e);
});
dpad.addEventListener('pointermove', e => {
  if (!directionPointers.has(e.pointerId)) return;
  e.preventDefault(); updatePointerDirection(e);
});
function releaseDirectionPointer(e: PointerEvent) {
  if (e.type === 'lostpointercapture' && e.target !== dpad) return;
  directionPointers.delete(e.pointerId);
  const previous = pointerDirections.get(e.pointerId); pointerDirections.delete(e.pointerId);
  if (previous) releaseDirection(previous);
  syncDirectionButtons();
}
dpad.addEventListener('pointerup', releaseDirectionPointer); dpad.addEventListener('pointercancel', releaseDirectionPointer); dpad.addEventListener('lostpointercapture', releaseDirectionPointer);
const drawButton = $<HTMLButtonElement>('#touch-draw');
drawButton.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (game.phase === 'opening') { confirmOpening(); return; }
  if (game.phase !== 'playing' || controlModes[controlModeIndex] === 'one-hand') return;
  drawButton.setPointerCapture(e.pointerId); drawPointers.add(e.pointerId); syncTouchDrawing();
});
drawButton.addEventListener('click', () => { if (game.phase === 'opening') confirmOpening(); });
function releaseDrawPointer(e: PointerEvent) {
  if (!drawPointers.delete(e.pointerId)) return;
  syncTouchDrawing();
  if (!touchDraw && !drawHeld) game.beginRetraction();
}
drawButton.addEventListener('pointerup', releaseDrawPointer); drawButton.addEventListener('pointercancel', releaseDrawPointer); drawButton.addEventListener('lostpointercapture', releaseDrawPointer);
const joystick = $<HTMLButtonElement>('#joystick');
function syncTouchDrawing() {
  const wasDrawing = touchDraw;
  touchDraw = drawPointers.size > 0 || joystickKeys.size > 0;
  if (touchDraw && !wasDrawing) game.resumeDrawing();
  $('#touch-draw').setAttribute('aria-pressed', String(touchDraw));
  $('#joystick').setAttribute('aria-pressed', String(joystickPointer !== undefined || joystickKeys.size > 0));
}
function resetJoystick() {
  joystickPoint = undefined; joystickOrigin = undefined; joystickInput.reset();
  $('#joystick').style.removeProperty('--stick-x'); $('#joystick').style.removeProperty('--stick-y');
  $('#joystick').style.removeProperty('--origin-x'); $('#joystick').style.removeProperty('--origin-y');
}
function cardinalDirection(dx: number, dy: number): Direction | undefined {
  if (Math.hypot(dx, dy) < 12) return undefined;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}
function updateJoystick(e: PointerEvent) {
  if (e.pointerId !== joystickPointer) return;
  const events = e.getCoalescedEvents?.();
  let changed = false;
  for (const point of events?.length ? events : [e]) {
    changed = joystickInput.move(point.clientX, point.clientY) || changed;
    joystickPoint = { x: point.clientX, y: point.clientY };
  }
  sampleJoystick();
  // A fresh swipe can re-arm movement after a hit or completed retraction.
  if (changed && joystickInput.direction) { held.delete(joystickInput.direction); held.add(joystickInput.direction); }
}
function sampleJoystick() {
  if (joystickPointer === undefined || !joystickPoint || !joystickOrigin) return;
  const box = joystick.getBoundingClientRect(), disc = joystick.querySelector<HTMLElement>('.joystick-disc')!, knob = joystick.querySelector<HTMLElement>('.joystick-knob')!;
  const radius = Math.max(0, (disc.offsetWidth - knob.offsetWidth) / 2 - 10);
  // The ring follows this gesture's touchdown; both visual offsets and movement
  // are independent of the pad's fixed center. Only movement uses local deltas.
  joystick.style.setProperty('--origin-x', `${joystickOrigin.x - box.x}px`); joystick.style.setProperty('--origin-y', `${joystickOrigin.y - box.y}px`);
  const dx = joystickPoint.x - joystickOrigin.x, dy = joystickPoint.y - joystickOrigin.y;
  const ratio = Math.min(1, radius / (Math.hypot(dx, dy) || 1));
  joystick.style.setProperty('--stick-x', `${dx * ratio}px`); joystick.style.setProperty('--stick-y', `${dy * ratio}px`);
  setPointerDirection(joystickPointer, joystickInput.direction);
}
joystick.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (game.phase === 'opening') { confirmOpening(); return; }
  if (game.phase !== 'playing' || controlModes[controlModeIndex] !== 'one-hand' || joystickPointer !== undefined) return;
  joystickPointer = e.pointerId; joystickOrigin = { x: e.clientX, y: e.clientY }; joystickInput.start(e.clientX, e.clientY);
  drawPointers.add(e.pointerId); joystick.setPointerCapture(e.pointerId);
  syncTouchDrawing(); updateJoystick(e);
});
joystick.addEventListener('click', () => { if (game.phase === 'opening') confirmOpening(); });
joystick.addEventListener('pointermove', e => {
  if (e.pointerId !== joystickPointer) return;
  e.preventDefault(); updateJoystick(e);
});
function releaseJoystick(e: PointerEvent) {
  if (e.pointerId !== joystickPointer) return;
  setPointerDirection(e.pointerId, undefined); joystickPointer = undefined; resetJoystick(); releaseDrawPointer(e);
}
joystick.addEventListener('pointerup', releaseJoystick); joystick.addEventListener('pointercancel', releaseJoystick); joystick.addEventListener('lostpointercapture', releaseJoystick);
joystick.addEventListener('keydown', e => {
  if (!['Space', 'Enter'].includes(e.code) || game.phase !== 'playing') return;
  e.preventDefault(); e.stopPropagation(); joystickKeys.add(e.code); syncTouchDrawing();
});
joystick.addEventListener('keyup', e => {
  if (!joystickKeys.delete(e.code)) return;
  e.preventDefault(); e.stopPropagation(); syncTouchDrawing();
  if (!touchDraw && !drawHeld) game.beginRetraction();
});
joystick.addEventListener('blur', () => {
  if (!joystickKeys.size) return;
  joystickKeys.clear(); syncTouchDrawing();
  if (!touchDraw && !drawHeld) game.beginRetraction();
});
window.matchMedia('(max-width: 620px) and (orientation: portrait)').addEventListener('change', () => { clearInput(); });

function notify(message: string, compact = message) {
  $('.toast-full').textContent = message; $('.toast-compact').textContent = compact;
  $('#toast').classList.add('visible'); toastUntil = performance.now() + 2200;
}
function pulseHud(selector: string) {
  const element = $(selector);
  element.classList.remove('hud-pulse');
  void element.offsetWidth;
  element.classList.add('hud-pulse');
}
function handleEvent(event: GameEvent) {
  if (typeof event === 'object') {
    if (event.type === 'bossHit') {
      effects.push((theme.createBossHitEffect ?? bossHitPulse)(event.hit, reducedMotion.matches));
      notify(`${current.names.boss}受击 · ${event.hit.health}/${event.hit.maxHealth} HP · +${event.hit.points}`, `${current.names.boss} ${event.hit.health}/${event.hit.maxHealth} · +${event.hit.points}`); lakeAudio.play('boss-hit');
    } else if (event.type === 'powerup') {
      const descriptions = { slow: '敌人减速 10 秒', stop: '敌人和子弹止步 3 秒', speed: '角色加速 10 秒' };
      notify(`获得${POWER_UP_LABELS[event.kind]} · ${descriptions[event.kind]}`, descriptions[event.kind]); lakeAudio.play('reward');
    } else {
      for (const enemy of event.enemies) effects.push((theme.createDefeatEffect ?? enemyCelebration)(enemy, reducedMotion.matches));
      const names = event.enemies.map(enemy => enemy.kind === 'straight' ? current.names.straight[0] : enemy.kind === 'boss' ? current.names.boss : current.names[enemy.kind]).join('、');
      const points = event.enemies.reduce((sum, enemy) => sum + enemy.points, 0);
      notify(`圈敌成功 · ${names} +${points}`, `击败${event.enemies.length}敌 · +${points}`); lakeAudio.play('defeat');
    }
  } else if (event === 'characterComplete') {
    notify('封印松动', '封印松动');
    lakeAudio.play('milestone');
  } else if (event === 'capture') {
    for (const region of game.lastCapture) effects.push((theme.createCaptureEffect ?? lakeDissolve)(region, reducedMotion.matches));
    if (game.lastCaptureBonus > 0) {
      const bonus = `大圈加成 +${game.lastCaptureBonus}`;
      const text = game.lastCaptureHeal ? `${bonus} · 大圈回血` : bonus;
      notify(text, text);
      pulseHud('#score');
      if (game.lastCaptureHeal) { pulseHud('#lives'); lakeAudio.play('respawn'); }
      lakeAudio.play('reward');
    } else notify('连接成功 · 新的领地已揭开', '领地已扩大');
    lakeAudio.play('capture', Math.max(0.2, game.percent - audioPercent));
  } else if (event === 'partition') {
    notify('通路已连接 · 继续围出闭合区域', '通路已连接，继续圈地'); lakeAudio.play('partition');
  } else if (event === 'hit') {
    hitFlash = 0.5; notify(`受到攻击 · 剩余 ${game.lives} 条生命`, `受击 · 剩余${game.lives}命`);
    lakeAudio.play('hurt');
    if (game.lives > 0) lakeAudio.play('respawn');
  } else if (event === 'won') {
    const result = applyUnlocks(codex, game, current.id);
    codex = result.codex; writeCodex(codex);
    const unlocked = result.fresh.map(id => current.id === 1 ? rewardNames[id] : `${current.theme}·${rewardNames[id]}`);
    freshNote = unlocked.length ? `新解开：${unlocked.join('、')}` : '这些纪念都已经在图鉴里了。';
    progress = noteClear(progress, current.id); writeLevelProgress(progress);
    effects.push(sealBreak(reducedMotion.matches));
    lakeAudio.play('seal');
    let fanfare = 1.15;
    if (game.lives >= game.maxLives) { lakeAudio.play('milestone', 1, fanfare); fanfare += 0.62; }
    if (game.winReason === 'boss') { lakeAudio.play('perfect', 1, fanfare); fanfare += 0.4; }
    if (result.fresh.length) lakeAudio.play('reward', 1, fanfare);
  } else if (event === 'lost') lakeAudio.play('gameover');
  else if (event === 'start') lakeAudio.play('level');
  audioPercent = game.percent;
}

function sync() {
  const selecting = game.phase === 'opening', waiting = !game.actorsReady;
  const status = $('#powerup-status');
  const activeEffects = POWER_UP_KINDS.filter(kind => game.powerUpEffects[kind] > 0)
    .map(kind => `${POWER_UP_LABELS[kind]} ${Math.ceil(game.powerUpEffects[kind])}s`).join(' · ');
  status.hidden = !activeEffects; if (status.textContent !== activeEffects) status.textContent = activeEffects;
  $('#opening-hint').hidden = !selecting;
  if (selecting && game.opening) $('#opening-hint').textContent = `${openingPercent(game.opening, game.width, game.height).toFixed(1)}% · 空格 / 动作键确认 · ${Math.max(0, OPENING_SECONDS - game.opening.elapsed).toFixed(1)}s`;
  drawButton.setAttribute('aria-label', selecting ? '确认起点' : '按住画线，松开收线');
  joystick.setAttribute('aria-label', selecting ? '确认起点' : '单手触控区，任意位置按住滑动画线，松开收线');
  $('.draw-side > span').textContent = selecting ? '点击确认起点' : '按住画线 · 松开收线';
  $('.joystick-side > span').textContent = selecting ? '区域内轻触确认起点' : '任意位置滑动画线 · 松开收线';
  const percent = game.percent;
  $('#percent').innerHTML = `${percent.toFixed(1)}<span>%</span>`;
  $('#progress-fill').style.width = `${Math.min(percent / game.target * 100, 100)}%`;
  $('.progress-track').setAttribute('aria-valuenow', String(Math.min(percent, 75)));
  $('#score').textContent = String(game.score).padStart(6, '0');
  $('#lives').innerHTML = Array.from({ length: 3 }, (_, i) => `<img class="life-wax${i < game.lives ? '' : ' spent'}" alt="" src="${asset('ui/wax_seal_red.png')}">`).join('');
  paintCharms(); paintPortrait(); paintCast();
  $('#lives').setAttribute('aria-label', `剩余 ${game.lives} 条生命`);
  const seconds = Math.floor(game.elapsed);
  $('#elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const hp = game.boss || waiting ? game.bossHealth : 0;
  const mobileHp = document.getElementById('mobile-boss-hp');
  if (mobileHp) mobileHp.textContent = `${hp} / ${game.bossMaxHealth}`;
  pauseButton.disabled = !['playing', 'opening', 'paused'].includes(game.phase);
  overlay.hidden = !$('#title-screen').hidden || game.phase === 'playing' || selecting || (game.phase === 'won' && effects.length > 0);
  placeShade();
  $('#level-title').textContent = current.title;
  $('#combat-help').title = `${current.difficulty} · ${game.bossAttack?.name ?? current.names.boss}：${current.tactic}`;
  const showCard = refreshCard || lastPhase !== game.phase;
  if (lastPhase === game.phase && !refreshCard) return;
  refreshCard = false;
  lastPhase = game.phase;
  if (!showCard) return;
  const labels = { ready: '准备就绪', opening: '选择起点', playing: '探索中', paused: '已暂停', won: '探索完成', lost: '本次探索结束' };
  $('#state-label').textContent = labels[game.phase];
  $('#state-dot').classList.toggle('active', game.phase === 'playing');
  $('#pause span').textContent = game.phase === 'paused' ? '继续' : '暂停';
  $('#overlay-hint').textContent = '方向键移动 · 按住空格画线';
  $<HTMLButtonElement>('#next-level').hidden = true;
  const seal = $<HTMLImageElement>('#overlay-seal');
  const broken = game.phase === 'won';
  seal.src = asset(broken ? 'ui/wax_seal_broken.png' : 'ui/wax_seal_red.png');
  seal.classList.toggle('breaking', broken);
  if (game.phase === 'paused') {
    $('#overlay-kicker').textContent = 'TAKE A BREATH';
    $('#overlay-title').textContent = '风景会等你。';
    $('#overlay-copy').textContent = '休息一下，准备好后继续探索。';
    $('#reward-note').textContent = '';
    $('#primary').innerHTML = `继续探索 ${icon('arrow')}`;
  } else if (game.phase === 'won') {
    const next = current.id < LEVELS.length ? levelById(current.id + 1) : undefined;
    const clearedAll = !next && LEVELS.every(level => progress.cleared.includes(level.id));
    $('#overlay-kicker').textContent = clearedAll ? 'ALL CLEAR' : 'SEAL BROKEN';
    $('#overlay-title').textContent = clearedAll ? `${LEVELS.length} 关都解开了。` : '封印解开了。';
    $('#overlay-copy').textContent = clearedAll
      ? `${LEVELS.map(level => level.title.replace(/^第.+?关 · /, '')).join('、')}都已解开。得分 ${game.score.toLocaleString()}。`
      : `这一关的封印碎开。已净化 ${percent.toFixed(1)}% · 得分 ${game.score.toLocaleString()} · 用时 ${$('#elapsed').textContent}`;
    $('#reward-note').textContent = freshNote;
    $('#primary').innerHTML = clearedAll ? `从第一关再来 ${icon('reset')}` : `再玩本关 ${icon('reset')}`;
    const nextButton = $<HTMLButtonElement>('#next-level');
    nextButton.hidden = !next;
    if (next) nextButton.textContent = `前往${next.title}`;
    $('#overlay-hint').textContent = clearedAll ? '选关可以重游任意一关' : (game.winReason === 'boss' ? `${current.names.boss}已净化` : current.title);
  } else if (game.phase === 'lost') {
    $('#overlay-kicker').textContent = 'EVERY TRY IS A NEW BEGINNING';
    $('#overlay-title').textContent = '下一次，再远一点。';
    $('#overlay-copy').textContent = `你已揭开 ${percent.toFixed(1)}% ，获得 ${game.score.toLocaleString()} 分。再试一次？`;
    $('#reward-note').textContent = '';
    $('#primary').innerHTML = `重新挑战 ${icon('reset')}`;
  } else if (game.phase === 'opening' || game.phase === 'ready') {
    $('#overlay-kicker').textContent = current.title;
    $('#overlay-title').innerHTML = '封印还在。<br>这一关在等你。';
    $('#overlay-copy').innerHTML = '按空格或动作键选定随机起点，5 秒后自动选定。<br>净化 75%，解开这一关的封印。';
    $('#reward-note').textContent = '';
    $('#primary').innerHTML = `开始探索 ${icon('arrow')}`;
  }
  if (!['playing', 'ready', 'opening'].includes(game.phase)) {
    clearInput();
    $('#primary').focus({ preventScroll: true });
  }
}

function drawPowerUp(context: CanvasRenderingContext2D, item: PowerUp, elapsed: number) {
  const appearance = {
    slow: '#9ee8bb',
    stop: '#a8d9ff',
    speed: '#ffd783',
  }[item.kind];
  context.save(); context.translate(item.x, item.y);
  const pulse = reducedMotion.matches ? 1 : 1 + 0.06 * Math.sin(elapsed * 4);
  context.scale(pulse, pulse); context.shadowColor = appearance; context.shadowBlur = 5;
  context.fillStyle = '#17252b'; context.strokeStyle = appearance; context.lineWidth = 0.15;
  context.beginPath(); context.arc(0, 0, POWER_UP_RADIUS, 0, Math.PI * 2); context.fill(); context.stroke();
  context.shadowBlur = 0; context.strokeStyle = appearance; context.fillStyle = appearance;
  context.lineWidth = 0.18; context.lineCap = 'round'; context.lineJoin = 'round';
  context.beginPath();
  if (item.kind === 'slow') {
    // Hourglass: the two chambers meet in the middle.
    context.moveTo(-0.52, -0.66); context.lineTo(0.52, -0.66);
    context.lineTo(0, 0); context.lineTo(0.52, 0.66); context.lineTo(-0.52, 0.66);
    context.lineTo(0, 0); context.closePath(); context.stroke();
  } else if (item.kind === 'stop') {
    // Snowflake: three crossed axes remain legible on a small screen.
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI / 3, x = Math.cos(angle) * 0.68, y = Math.sin(angle) * 0.68;
      context.moveTo(-x, -y); context.lineTo(x, y);
    }
    context.stroke();
  } else {
    // Lightning bolt for the player speed boost.
    context.moveTo(0.16, -0.78); context.lineTo(-0.52, 0.08); context.lineTo(-0.08, 0.08);
    context.lineTo(-0.18, 0.78); context.lineTo(0.52, -0.18); context.lineTo(0.08, -0.18);
    context.closePath(); context.fill();
  }
  context.restore();
}

function render(now: number) {
  const width = canvas.width, height = canvas.height;
  const scale = Math.min((width - 24) / game.width, (height - 24) / game.height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0e202b'; ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate((width - game.width * scale) / 2, (height - game.height * scale) / 2);
  ctx.scale(scale, scale);
  // Restored forest underneath, ruined forest clipped to land that is still corrupted.
  // Both plates use the same world rectangle so a capture reveals the matching pixels.
  ctx.shadowBlur = 0;
  if (!drawLandscape(ctx, restored, game.width, game.height)) {
    ctx.fillStyle = '#12343a'; ctx.fillRect(0, 0, game.width, game.height);
  }
  if (game.characterComplete) drawCharacterAura(ctx);
  const rescue = effects.find(effect => effect.seal);
  if (game.phase !== 'won' && game.territories.length) {
    ctx.save();
    clipPolygons(ctx, game.territories);
    if (!drawLandscape(ctx, ruined, game.width, game.height)) {
      ctx.fillStyle = theme.danger; ctx.fillRect(0, 0, game.width, game.height);
    }
    ctx.restore();
  } else if (rescue && (rescue.cover ?? 0) > 0) {
    ctx.save(); ctx.globalAlpha = rescue.cover ?? 0;
    drawLandscape(ctx, ruined, game.width, game.height); ctx.restore();
  }
  // A faint guide sits on the actual arena limit. The bright, walkable shore
  // is drawn over it, so reaching the edge never leaves a second offset line.
  ctx.save(); ctx.strokeStyle = theme.arenaBorder; ctx.lineWidth = 1 / scale;
  ctx.globalAlpha = 0.25; ctx.shadowBlur = 0;
  ctx.strokeRect(0, 0, game.width, game.height); ctx.restore();
  for (const effect of effects) effect.render(ctx);
  if (game.phase === 'opening' && game.opening) {
    ctx.save(); polygonPath(ctx, game.opening.region); ctx.clip();
    drawLandscape(ctx, restored, game.width, game.height);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(0, 0, game.width, game.height); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#ffcf75'; ctx.lineWidth = 0.18; ctx.shadowColor = '#ffcf75'; ctx.shadowBlur = 12;
    polygonPath(ctx, game.opening.region); ctx.stroke(); ctx.restore();
  }
  ctx.save();
  ctx.lineWidth = 1.4 / scale; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = theme.boundary; ctx.shadowColor = theme.boundary; ctx.shadowBlur = 5;
  if (game.phase !== 'won') {
    ctx.beginPath();
    for (const [a, b] of game.boundarySegments) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
  }
  ctx.restore();
  if (game.characterComplete) drawSealMotes(ctx, frameDt);
  if (game.phase !== 'won') {
    if (game.trail.length) {
      ctx.save(); ctx.shadowColor = theme.trail; ctx.shadowBlur = 10;
      ctx.strokeStyle = theme.trail; ctx.lineWidth = 2.6 / scale; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      game.trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke(); ctx.restore();
    }
    if (game.powerUp) drawPowerUp(ctx, game.powerUp, game.elapsed);
    for (const enemy of game.enemies) renderEnemy(ctx, enemy, 0, reducedMotion.matches);
    if (game.boss) renderEnemy(ctx, game.boss, game.bossJump ? 0 : game.bossAttack?.warning ?? 0, reducedMotion.matches, game.bossJump, game.bossFlash, game.bossAttack?.directions, game.bossAttack?.angleOffset, game.bossAttack?.warningAngles);
    for (const hazard of game.hazards) hazard.render(ctx);
    if (game.actorsReady && (!game.protection || Math.floor(now / 100) % 2)) {
      ctx.save();
      const { x, y } = game.player;
      const direction = [...held].at(-1);
      if (direction) playerFacing = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[direction];
      renderPlayerSpirit(ctx, x, y, playerFacing, game.trail.length > 0, game.elapsed, reducedMotion.matches);
      ctx.restore();
    }
  }
  ctx.restore();
  if (hitFlash > 0) { ctx.fillStyle = `rgba(255,80,100,${hitFlash * 0.35})`; ctx.fillRect(0, 0, width, height); }
}

let previous = performance.now();
let uiClock = 0;
let frameDt = 0;
function characterAura(image: HTMLImageElement) {
  const silhouette = document.createElement('canvas');
  silhouette.width = image.naturalWidth; silhouette.height = image.naturalHeight;
  const source = silhouette.getContext('2d');
  if (!source) return undefined;
  source.drawImage(image, 0, 0);
  const pixels = source.getImageData(0, 0, silhouette.width, silhouette.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const coverage = Math.max(data[i], data[i + 1], data[i + 2]);
    const solid = data[i + 3] > 127 && coverage > 127;
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = solid ? 255 : 0;
  }
  source.putImageData(pixels, 0, 0);
  const aura = document.createElement('canvas');
  aura.width = silhouette.width; aura.height = silhouette.height;
  const glow = aura.getContext('2d');
  if (!glow) return undefined;
  glow.shadowColor = '#c9a6ff'; glow.shadowBlur = 24; glow.drawImage(silhouette, 0, 0);
  glow.shadowColor = '#e7c56a'; glow.shadowBlur = 12; glow.drawImage(silhouette, 0, 0);
  glow.shadowBlur = 0; glow.globalCompositeOperation = 'destination-out'; glow.drawImage(silhouette, 0, 0);
  return aura;
}
function drawCharacterAura(ctx: CanvasRenderingContext2D) {
  if (!auraCanvas) return;
  const pulse = reducedMotion.matches ? 0.55 : 0.45 + 0.2 * Math.sin(performance.now() / 460);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = pulse;
  ctx.drawImage(auraCanvas, 0, 0, game.width, game.height);
  ctx.restore();
}
function drawSealMotes(ctx: CanvasRenderingContext2D, dt: number) {
  if (reducedMotion.matches) return;
  while (motes.length < 20) motes.push({ x: Math.random() * game.width, y: Math.random() * game.height, vy: 1.4 + Math.random() * 1.6, r: 0.08 + Math.random() * 0.1, gold: Math.random() < 0.5, phase: Math.random() * Math.PI * 2 });
  ctx.save();
  for (const mote of motes) {
    mote.y -= mote.vy * dt;
    mote.x += Math.sin(mote.phase + mote.y) * 0.35 * dt;
    if (mote.y < -0.4) { mote.y = game.height + 0.4; mote.x = Math.random() * game.width; }
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = mote.gold ? '#f0d48a' : '#d2b0ff';
    ctx.beginPath(); ctx.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function frame(now: number) {
  const at = performance.now(), rawDt = Math.max(0, (now - previous) / 1000);
  const dt = game.phase === 'opening' ? Math.max(0, (at - openingFrameAt) / 1000) : Math.min(rawDt, 0.05);
  frameDt = dt;
  openingFrameAt = at;
  previous = now;
  const wasOpening = game.phase === 'opening';
  const candidateBefore = game.opening?.candidates;
  sampleJoystick();
  if (game.update(dt, [...held].at(-1), drawHeld || touchDraw)) held.clear();
  if (wasOpening && game.phase === 'playing') clearInput();
  for (const effect of effects) effect.update(game.phase === 'paused' ? 0 : dt);
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].finished) effects.splice(i, 1);
  for (const event of game.events.splice(0)) handleEvent(event);
  followAudio();
  hitFlash = Math.max(0, hitFlash - dt);
  if (now > toastUntil) $('#toast').classList.remove('visible');
  uiClock += dt;
  if (uiClock >= 0.1 || lastPhase !== game.phase || (game.phase === 'opening' && candidateBefore !== game.opening?.candidates)) { sync(); uiClock = 0; }
  render(now);
  requestAnimationFrame(frame);
}
function openCombatGuide() {
  if (game.phase === 'playing' || game.phase === 'opening') togglePause();
  clearInput(); $('#combat-guide').hidden = false; placeShade();
  $('#combat-guide-close').focus();
}
$('#menu-guide').addEventListener('click', openCombatGuide);
$('#combat-help').addEventListener('click', openCombatGuide);
function closeCombatGuide() {
  $('#combat-guide').hidden = true; placeShade();
  ($('#title-screen').hidden ? $('#primary') : $('#menu-guide')).focus();
}
$('#combat-guide-close').addEventListener('click', closeCombatGuide);
window.addEventListener('keydown', event => {
  if (!$('#combat-guide').hidden && event.code === 'Escape') { event.preventDefault(); closeCombatGuide(); }
});
$('#open-gallery').addEventListener('click', openGallery);
$('#open-levels').addEventListener('click', openLevels);
$('#next-level').addEventListener('click', () => { if (current.id < LEVELS.length) beginLevel(current.id + 1); });
$('#levels-close').addEventListener('click', () => {
  closeLevels();
  if (!$('#title-screen').hidden) return;
  if (game.phase === 'paused') togglePause();
});
$('#menu-start').addEventListener('click', () => {
  const id = progress.unlocked;
  if (game.phase === 'paused' && current.id === id) { hideMenu(); togglePause(); return; }
  if (game.phase === 'ready' && current.id === id) {
    hideMenu();
    game.start();
    openingFrameAt = performance.now();
    sync(); canvas.focus({ preventScroll: true }); render(performance.now());
    return;
  }
  beginLevel(id);
});
$('#menu-levels').addEventListener('click', openLevels);
$('#menu-gallery').addEventListener('click', openGallery);
$('#menu-form').addEventListener('click', () => {
  monsterForm = !monsterForm;
  try { localStorage.setItem(FORM_KEY, monsterForm ? 'monster' : 'human'); } catch { /* Storage may be unavailable. */ }
  game.setOpeningFace(gameOptionsFor(current, monsterForm).openingFace);
  loadLevelArt(current); paintFormControls(); sync();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('.form-preview')) {
  const setPreview = (on: boolean) => { previewOtherForm = on; paintGalleryForm(); };
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId); setPreview(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, () => setPreview(false));
  button.addEventListener('keydown', event => { if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) { event.preventDefault(); setPreview(true); } });
  button.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); setPreview(false); } });
  button.addEventListener('blur', () => setPreview(false));
}
window.addEventListener('blur', resetGalleryPreview);
document.addEventListener('visibilitychange', () => { if (document.hidden) resetGalleryPreview(); });
paintFormControls();
$('#menu-settings').addEventListener('click', () => {
  const panel = $('#menu-settings-panel');
  panel.hidden = !panel.hidden;
  $('#menu-settings').setAttribute('aria-expanded', String(!panel.hidden));
});
function closeClearProgress() {
  $('#clear-progress-dialog').hidden = true; placeShade();
  $('#clear-progress').focus({ preventScroll: true });
}
$('#clear-progress').addEventListener('click', () => {
  $('#clear-progress-error').hidden = true;
  $('#clear-progress-dialog').hidden = false; placeShade();
  $('#cancel-clear-progress').focus({ preventScroll: true });
});
$('#cancel-clear-progress').addEventListener('click', closeClearProgress);
$('#confirm-clear-progress').addEventListener('click', () => {
  const keys = ['linkblock.fenglin.levels', 'linkblock.fenglin.codex'];
  let previous: (string | null)[] = [];
  try {
    previous = keys.map(key => localStorage.getItem(key));
    for (const key of keys) localStorage.removeItem(key);
    if (keys.some(key => localStorage.getItem(key) !== null)) throw new Error('Progress could not be removed');
  } catch {
    try { keys.forEach((key, i) => { if (previous[i] !== undefined && previous[i] !== null) localStorage.setItem(key, previous[i]!); }); } catch { /* Keep the warning visible when storage is unavailable. */ }
    const error = $('#clear-progress-error'); error.textContent = '无法清空进度，请检查浏览器存储设置。'; error.hidden = false; return;
  }
  progress = readLevelProgress(); codex = codexForProgress(readCodex(), progress.cleared);
  current = LEVELS[0]; game = new Game(72, 48, gameOptionsFor(current, monsterForm));
  clearInput(); freshNote = ''; effects.length = 0; hitFlash = 0;
  heardRetract = false; lineMark = 0; hadBoss = false; hadJump = false; audioPercent = 0;
  loadLevelArt(current); applyAccent(current); syncScene(); paintSealRow(); renderLevels();
  refreshCard = true; closeClearProgress(); sync(); render(performance.now());
});
window.addEventListener('keydown', event => {
  if ($('#clear-progress-dialog').hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeClearProgress(); }
  if (event.key === 'Tab') {
    event.preventDefault();
    const cancel = $('#cancel-clear-progress'), confirm = $('#confirm-clear-progress');
    (document.activeElement === cancel && !event.shiftKey || document.activeElement !== confirm && event.shiftKey ? confirm : cancel).focus();
  }
}, { capture: true });
$('#home').addEventListener('click', showMenu);
$('#back-menu').addEventListener('click', showMenu);
paintSealRow();
paintMenu(0);
$('.menu-page').addEventListener('pointerover', event => {
  if (!menuOpen()) return;
  const button = (event.target as Element | null)?.closest('button');
  if (!button?.classList.contains('menu-btn')) return;
  const index = menuItems().indexOf(button as HTMLButtonElement);
  if (index >= 0) paintMenu(index);
});
$('.menu-page').addEventListener('focusin', event => {
  const index = menuItems().indexOf(event.target as HTMLButtonElement);
  if (index >= 0) paintMenu(index);
});
window.addEventListener('keydown', event => {
  if (!menuOpen() || isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.target instanceof Element && event.target.closest('#menu-settings-panel')) return;
  const buttons = menuItems();
  const focused = buttons.indexOf(event.target as HTMLButtonElement);
  const index = focused >= 0 ? focused : Math.max(0, buttons.findIndex(button => button.classList.contains('is-selected')));
  const moves: Record<string, number[]> = { ArrowUp: [3, 0, 0, 1, 2], ArrowDown: [1, 3, 4, 0, 0], ArrowLeft: [0, 2, 1, 4, 3], ArrowRight: [0, 2, 1, 4, 3] };
  const key = ({ KeyW: 'ArrowUp', KeyS: 'ArrowDown', KeyA: 'ArrowLeft', KeyD: 'ArrowRight' } as Record<string, string>)[event.code] ?? event.code;
  if (moves[key]) {
    event.preventDefault();
    const next = moves[key][index]; paintMenu(next);
    buttons[next]?.focus({ preventScroll: true }); buttons[next]?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
    event.preventDefault();
    menuConsumed.add(event.code);
    buttons[index]?.click();
  }
});
$('#level-list').addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-level]');
  if (!button || button.disabled) return;
  beginLevel(Number(button.dataset.level));
});
$('#portrait').addEventListener('click', openGallery);
$('#gallery-close').addEventListener('click', closeGallery);
$('#viewer-close').addEventListener('click', () => { resetGalleryPreview(); viewerCard = undefined; $('#viewer').hidden = true; placeShade(); });
$('#charms').addEventListener('click', event => { if ((event.target as Element).closest('.charm')) openGallery(); });
$('#gallery-grid').addEventListener('click', event => {
  const item = (event.target as Element).closest<HTMLButtonElement>('.gallery-item');
  if (!item || item.disabled) return;
  const reward = galleryCards().find(entry => String(entry.level) === item.dataset.level && entry.id === item.dataset.reward);
  if (!reward) return;
  const image = $<HTMLImageElement>('#viewer-img');
  viewerCard = reward; image.src = asset(rewardArt(reward, monsterForm !== previewOtherForm)); image.alt = reward.title; $('#viewer').hidden = false; placeShade();
});
game.setOpeningFace(gameOptionsFor(current, monsterForm).openingFace);
loadLevelArt(current);
applyAccent();
sync();
requestAnimationFrame(frame);
