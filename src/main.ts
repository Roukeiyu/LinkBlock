import './style.css';
import { Game, type Direction, type GameEvent } from './engine';
import { ENEMY_STYLES } from './enemies';
import { renderEnemy, renderWolfSpirit } from './render-enemies';
import { OPENING_SECONDS, openingPercent } from './opening';
import { DragJoystick } from './joystick';
import { bindLandscapes, clipPolygons, drawLandscape, lakeDissolve, lakeTheme, polygonPath, enemyCelebration, bossHitPulse, sealBreak, type CaptureEffect } from './effects';
import { applyUnlocks, readCodex, writeCodex, type Codex, type RewardId } from './rewards';
import { LEVELS, bossConfigFor, levelById, noteClear, readLevelProgress, writeLevelProgress, type LevelDef, type LevelProgress } from './levels';
import { maskFromPixels } from './completion';
import { useSpriteSheet } from './render-enemies';
import { lakeAudio } from './audio';

const art = (file: string) => `${import.meta.env.BASE_URL}${file}`;
document.documentElement.style.setProperty('--wood-panel', `url('${art('sprites/panel_wood.webp')}')`);
const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="LinkBlock 首页"><span class="brand-icon"><i></i><i></i><i></i></span>LINK<span class="brand-light">BLOCK</span><span class="beta">ARCADE / 01</span></a>
    <div class="header-right"><span class="online-dot"></span><span>无需登录，自由探索</span><span class="edition">WEB EDITION</span><div class="audio-dock" role="group" aria-label="声音"><button id="music-hud" type="button" aria-pressed="true" aria-label="音乐">音乐</button><button id="sfx-hud" type="button" aria-pressed="true" aria-label="音效">音效</button></div></div>
  </header>
  <main>
    <section class="intro"><div><p class="eyebrow">封林 · 把阿澈带回来</p><h1>连接，划出你的领地<span>。</span></h1><p class="intro-copy">腐林用黑荆棘把他封在湖边。画线净化领地，揭开被救下的他。</p></div><div class="chapter"><span>01 / 01</span><p>封林 · 阿澈</p></div></section>
    <section class="game-layout" aria-label="LinkBlock 游戏">
      <div class="game-main">
        <div class="hud seal-hud">
          <button id="portrait" class="portrait" type="button" aria-label="阿澈"><img id="portrait-img" class="portrait-face" alt="阿澈闭着眼，仍被荆棘封着" /><img class="portrait-ring" alt="" src="${art('sprites/portrait_ring.png')}" /></button>
          <div class="purity">
            <span id="level-title" class="level-title">第一关 · 月下封林</span>
            <div class="purity-bar progress-track" role="progressbar" aria-label="净化进度" aria-valuemin="0" aria-valuemax="75" aria-valuenow="0">
              <div class="bar-channel">
                <div id="progress-fill" class="bar-fill-window"></div>
                <i class="bar-goal" aria-hidden="true"></i>
              </div>
              <img class="bar-frame" alt="" src="${art('sprites/bar_frame.png')}" />
              <img class="bar-moon" alt="" src="${art('sprites/ornament_moon.png')}" />
              <strong id="percent" class="bar-readout">0.0<span>%</span></strong>
            </div>
            <span class="stat-label purity-caption">净化 <span class="muted">/ 75%</span></span>
          </div>
          <div class="hud-side">
            <strong id="lives" class="lives" aria-label="剩余 3 条生命"></strong>
            <strong id="score" class="score">000000</strong>
          </div>
          <div class="badge-row">
            <img class="side-paw" alt="" src="${art('sprites/btn_round.png')}" />
            <div class="charms" id="charms" aria-label="封林奖励"><button type="button" class="charm" data-reward="clear" aria-label="通关"><img class="charm-img" alt="" /><span>通关</span></button><button type="button" class="charm" data-reward="ninety" aria-label="90%"><img class="charm-img" alt="" /><span>90%</span></button><button type="button" class="charm" data-reward="perfect" aria-label="无伤"><img class="charm-img" alt="" /><span>无伤</span></button></div>
            <img class="side-paw flip" alt="" src="${art('sprites/btn_round.png')}" />
          </div>
        </div>
        <div class="board-stage">
          <div class="frame-fit">
            <div class="frame-row top">
              <div class="edge-fill"><img alt="" src="${art('sprites/frame_side.png')}" /></div>
              <img class="frame-beam top" alt="" src="${art('sprites/frame_top.png')}" />
              <div class="edge-fill flip"><img alt="" src="${art('sprites/frame_side.png')}" /></div>
            </div>
            <div class="frame-row mid">
              <img class="frame-side left" alt="" src="${art('sprites/frame_side.png')}" />
              <div class="board-hole">
        <div class="board-shell">
          <canvas id="board" width="864" height="576" tabindex="0" aria-label="游戏场地。沿小岛岸线移动，按住空格画线并回到岛岸闭合；裸露外框不能靠岸，松开空格收线，P 暂停。">请使用支持 Canvas 的浏览器游玩 LinkBlock。</canvas>
          <span class="board-corner top-left" aria-hidden="true"></span><span class="board-corner bottom-right" aria-hidden="true"></span>
          <div id="overlay" class="overlay">
            <div class="overlay-card"><p id="overlay-kicker" class="eyebrow">封林</p><div class="territory-symbol" aria-hidden="true"><span></span><i></i></div><h2 id="overlay-title">封印还在。<br>他在等你。</h2><p id="overlay-copy">按空格或动作键选定随机起点，5 秒后自动选定。<br>净化 75% 的林地，解开封林。</p><p id="reward-note"></p><button id="primary" class="primary-button">开始探索 ${icon('arrow')}</button><button id="next-level" class="primary-button" type="button" hidden>下一关</button><button id="open-levels" class="ghost-button" type="button">选关</button><button id="open-gallery" class="ghost-button" type="button">图鉴</button><span id="overlay-hint" class="overlay-hint">方向键移动 · 按住空格画线</span></div>
          </div>
          <div id="opening-hint" hidden aria-label="空格或动作键确认起点，5秒后自动选定"></div>
        </div>
              </div>
              <img class="frame-side right" alt="" src="${art('sprites/frame_side.png')}" />
            </div>
            <div class="frame-row bot">
              <div class="edge-fill"><img alt="" src="${art('sprites/frame_side.png')}" /></div>
              <img class="frame-beam bottom" alt="" src="${art('sprites/frame_bottom.png')}" />
              <div class="edge-fill flip"><img alt="" src="${art('sprites/frame_side.png')}" /></div>
            </div>
            <img class="frame-corner tl" alt="" src="${art('sprites/frame_corner.png')}" />
            <img class="frame-corner tr" alt="" src="${art('sprites/frame_corner.png')}" />
            <img class="frame-corner bl" alt="" src="${art('sprites/frame_corner.png')}" />
            <img class="frame-corner br" alt="" src="${art('sprites/frame_corner.png')}" />
            <img class="vine vine-left" alt="" src="${art('sprites/ornament_vine_flower.png')}" />
            <img class="vine vine-right" alt="" src="${art('sprites/ornament_vine_flower.png')}" />
          </div>
        </div>
        <div class="board-footer"><span><i id="state-dot" class="state-dot"></i><span id="state-label">准备就绪</span></span><span id="elapsed">00:00</span><span id="notice-slot"><span id="toast" class="toast" role="status" aria-live="polite"><span class="toast-full"></span><span class="toast-compact" aria-hidden="true"></span></span></span></div>
        <div class="mobile-game-status"><span><b id="mobile-boss-name">蚀根</b> <b id="mobile-boss-hp">5 / 5</b></span><button id="mobile-pause" aria-label="暂停游戏">暂停</button><button id="mobile-restart" aria-label="重新开始游戏">重开</button></div>
        <div class="touch-controls single" aria-label="手机手柄" data-mode="one-hand"><div class="controller-side dpad-side" hidden><div class="dpad"><span class="dpad-hit-area" aria-hidden="true"></span><button data-dir="up" aria-label="向上">↑</button><button data-dir="left" aria-label="向左">←</button><button data-dir="down" aria-label="向下">↓</button><button data-dir="right" aria-label="向右">→</button></div><span>方向</span></div><div class="controller-side draw-side" hidden><button id="touch-draw" aria-label="按住画线，松开收线" aria-pressed="false"><i aria-hidden="true"></i></button><span>按住画线 · 松开收线</span></div><div class="controller-side joystick-side"><button id="joystick" aria-label="单手触控区，任意位置按住滑动画线，松开收线" aria-pressed="false"><span class="joystick-disc" aria-hidden="true"><span class="joystick-guides">＋</span><i class="joystick-knob"></i></span></button><span>区域内任意位置滑动画线 · 松开收线</span></div><button id="control-mode">切换操作方式 <span id="control-mode-name" aria-live="polite">单手 · 自由触控</span></button></div>
      </div>
      <aside>
        <div class="side-panel field-notes"><div class="panel-heading"><span class="eyebrow">FIELD NOTES</span><span class="tiny-index">/ 001</span></div><h2>小小一步，<br>更大的世界。</h2><p class="panel-copy">安全区是你的起点，<br>勇气决定你的边界。</p><div class="divider"></div><ol class="instructions"><li><span class="step-number">01</span><div><h3>找到你的方向</h3><p>用 <kbd>↑</kbd> <kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd> 或 WASD<br>沿已揭示小岛的岸线移动。</p></div></li><li><span class="step-number">02</span><div><h3>越过边界</h3><p>按住 <kbd class="space-key">SPACE</kbd> 并移动画线，<br>回到小岛岸线，净化圈内腐林。<br>碰到自己的线会自动收回，再按画线键可停下；若一直按着方向，回到起点后会立刻再画。<br>圈住普通腐蚀者可击败并得分，<br>圈住蚀根可削减一格生命。<br>裸露外框不能靠岸；碰边可转向。<br>松开空格，沿原路快速收线。</p></div></li><li><span class="step-number">03</span><div><h3>观察腐蚀者的轨迹</h3><p>腐蚀者会击断未闭合的线。<br>蚀根的孢子能穿过领地边界，<br>躲开弹道再出发。</p></div></li></ol><div class="legend"><span><i class="legend-safe"></i>安全区</span><span><i class="legend-trail"></i>轨迹</span><span><i class="legend-enemy"></i>敌人</span></div><div class="enemy-roster" aria-label="敌人图鉴">${(['straight', 'orbit', 'zigzag', 'boss'] as const).map(kind => `<div class="enemy-entry" data-kind="${kind}"><i class="enemy-mark ${kind}" style="--enemy-color:${ENEMY_STYLES[kind].color}"></i><span><b class="enemy-name">${ENEMY_STYLES[kind].name}</b><small>${ENEMY_STYLES[kind].motion}</small></span><em>${kind === 'boss' ? '<span id="boss-status">八向散射</span>' : kind === 'straight' ? 'FAST' : kind === 'orbit' ? 'ORBIT' : 'ZIGZAG'}</em></div>`).join('')}</div><div class="boss-health" role="progressbar" aria-label="Boss 生命" aria-valuemin="0" aria-valuemax="5" aria-valuenow="5"><span id="boss-hearts"></span><small id="boss-hp-text">5 / 5</small><span id="boss-phase" hidden></span></div></div>
        <div class="controls-panel"><button id="pause" disabled>${icon('pause')}<span>暂停</span><kbd>P</kbd></button><button id="restart">${icon('reset')}<span>重新开始</span><kbd>R</kbd></button><button id="music" type="button" aria-pressed="true"><span>音乐开启</span><span class="toggle"></span></button><button id="sound" type="button" aria-pressed="true">${icon('sound')}<span>音效开启</span><span class="toggle"></span></button><label class="audio-slider">音乐音量 <input id="music-volume" type="range" min="0" max="100" value="62" aria-label="音乐音量"></label><label class="audio-slider">音效音量 <input id="sfx-volume" type="range" min="0" max="100" value="78" aria-label="音效音量"></label></div>
        <div class="side-note"><span>✦</span><p>不必一次占领整个世界。<br>每一小块，都算数。</p></div>
      </aside>
    </section>
    <footer class="site-footer"><span>LINKBLOCK <span class="muted">/</span> 封林 · 阿澈</span><span>无需下载 · 即刻探索 <span class="footer-star">✳</span></span></footer>
  </main>
  <div id="gallery" class="gallery" hidden>
    <div class="gallery-card" role="dialog" aria-labelledby="gallery-title">
      <div class="gallery-head"><h2 id="gallery-title">图鉴</h2><button id="gallery-close" type="button">返回</button></div>
      <div id="gallery-grid" class="gallery-grid"></div>
    </div>
    <div id="viewer" class="viewer" hidden><img id="viewer-img" alt="" /><button id="viewer-close" type="button">关闭</button></div>
  </div>
  <div id="level-select" class="gallery" hidden>
    <div class="gallery-card" role="dialog" aria-labelledby="levels-title">
      <div class="gallery-head"><h2 id="levels-title">选关</h2><button id="levels-close" type="button">返回</button></div>
      <div id="level-list" class="level-list"></div>
    </div>
  </div>`;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const canvas = $<HTMLCanvasElement>('#board');
const ctx = canvas.getContext('2d')!;
const overlay = $('#overlay');
const pauseButton = $<HTMLButtonElement>('#pause');
const theme = lakeTheme;
let game = new Game(72, 48, { opening: true, createBossAttack: theme.createBossAttack, bossConfig: theme.bossConfig });
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
let codex: Codex = readCodex();
let freshNote = '';
const rewardNames: Record<RewardId, string> = { clear: '通关', ninety: '90%', perfect: '无伤' };
const galleryItems: { id: RewardId; title: string; src: string; blurb: string }[] = [
  { id: 'clear', title: '阿澈 · 解封', src: 'wolf-restored.webp', blurb: '通关后收下的解封画像' },
  { id: 'ninety', title: '九成净化', src: 'reward-90.webp', blurb: '净化达到 90%' },
  { id: 'perfect', title: '无伤', src: 'reward-perfect.webp', blurb: '一条命都没有失去' },
];
const charmFile: Record<RewardId, [string, string]> = {
  clear: ['sprites/badge_clear.png', 'sprites/badge_clear_locked.png'],
  ninety: ['sprites/badge_90.png', 'sprites/badge_90_locked.png'],
  perfect: ['sprites/badge_perfect.png', 'sprites/badge_perfect_locked.png'],
};
function paintCharms() {
  for (const charm of document.querySelectorAll<HTMLButtonElement>('.charm')) {
    const id = charm.dataset.reward as RewardId;
    const open = codex[id];
    charm.classList.toggle('unlocked', open);
    charm.classList.toggle('locked', !open);
    charm.setAttribute('aria-pressed', String(open));
    charm.title = open ? `${rewardNames[id]}已解锁` : `${rewardNames[id]}未解锁`;
    const image = charm.querySelector('img');
    if (image) image.src = asset(open ? charmFile[id][0] : charmFile[id][1]);
  }
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
  const src = asset(freed ? current.portraitRescued : current.portraitSealed);
  if (portrait.getAttribute('src') !== src) portrait.src = src;
  portrait.alt = freed ? '阿澈睁开了眼' : '阿澈闭着眼，仍被荆棘封着';
}
function renderGallery() {
  $('#gallery-grid').innerHTML = galleryItems.map(item => {
    const open = codex[item.id];
    return `<button type="button" class="gallery-item ${open ? 'unlocked' : 'locked'}" data-reward="${item.id}" ${open ? '' : 'disabled'}><img src="${asset(item.src)}" alt="" /><span>${item.title}</span><small>${open ? item.blurb : '尚未解锁'}</small></button>`;
  }).join('');
}
function openGallery() {
  if (game.phase === 'playing' || game.phase === 'opening') togglePause();
  renderGallery(); $('#viewer').hidden = true; $('#gallery').hidden = false;
}
function closeGallery() { $('#gallery').hidden = true; $('#viewer').hidden = true; }

function paintAudio() {
  const { music, sfx, musicVolume, sfxVolume } = lakeAudio.prefs;
  for (const [id, on, label] of [['music', music, '音乐'], ['music-hud', music, '音乐'], ['sound', sfx, '音效'], ['sfx-hud', sfx, '音效']] as const) {
    const button = document.getElementById(id);
    if (!button) continue;
    button.setAttribute('aria-pressed', String(on));
    const text = button.querySelector('span');
    if (text && id !== 'music-hud' && id !== 'sfx-hud') text.textContent = `${label}${on ? '开启' : '关闭'}`;
  }
  ($('#music-volume') as HTMLInputElement).value = String(Math.round(musicVolume * 100));
  ($('#sfx-volume') as HTMLInputElement).value = String(Math.round(sfxVolume * 100));
}
function followAudio() {
  lakeAudio.setMood(game.phase === 'won' ? 'bright' : game.boss ? 'tense' : 'calm');
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
  const nextRestored = asset(level.restored), nextSealed = asset(level.sealed);
  if (!restored.src.endsWith(level.restored)) restored.src = nextRestored;
  if (!ruined.src.endsWith(level.sealed)) ruined.src = nextSealed;
  useSpriteSheet(level.sprites);
  loadLevelMask(level);
}
let charMaskImage: HTMLImageElement | undefined;
let maskToken = 0;
let motes: { x: number; y: number; vy: number; r: number; gold: boolean; phase: number }[] = [];
function loadLevelMask(level: LevelDef) {
  const token = ++maskToken;
  charMaskImage = undefined;
  motes = [];
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    if (token !== maskToken || !image.naturalWidth) return;
    charMaskImage = image;
    const scratch = document.createElement('canvas');
    scratch.width = image.naturalWidth; scratch.height = image.naturalHeight;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0);
    game.setCompletionMask(maskFromPixels(scratch.width, scratch.height, context.getImageData(0, 0, scratch.width, scratch.height).data, 4));
  };
  image.src = asset(level.mask);
}
function beginLevel(id: number) {
  current = levelById(id);
  closeGallery(); closeLevels(); clearInput(); freshNote = '';
  loadLevelArt(current);
  lakeAudio.useTrack(current.music);
  const first = current.id === 1;
  game = new Game(72, 48, { opening: true, createBossAttack: theme.createBossAttack, bossConfig: first ? theme.bossConfig : bossConfigFor(current), ...(first ? {} : { squad: current.squad, speedScale: current.enemySpeed, bossSpeedScale: current.bossSpeed }) });
  syncScene(); game.start(); effects.length = 0; hitFlash = 0;
  heardRetract = false; lineMark = 0; hadBoss = false; hadJump = false; audioPercent = 0;
  $('#toast').classList.remove('visible');
  openingFrameAt = performance.now();
  refreshCard = true;
  sync(); canvas.focus({ preventScroll: true }); render(performance.now());
}
function restart() { beginLevel(current.id); }
function closeLevels() { $('#level-select').hidden = true; }
function renderLevels() {
  $('#level-list').innerHTML = LEVELS.map(level => {
    const open = level.id <= progress.unlocked;
    return `<button type="button" data-level="${level.id}" ${open ? '' : 'disabled'}><b>${level.title}</b><small>${open ? `${level.theme} · ${level.names.boss}` : '尚未解锁'}</small></button>`;
  }).join('');
}
function openLevels() {
  if (game.phase === 'playing' || game.phase === 'opening') togglePause();
  renderLevels(); $('#level-select').hidden = false;
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
  else if (game.phase === 'won' && current.id === LEVELS.length) beginLevel(1);
  else beginLevel(current.id);
  openingFrameAt = performance.now();
  sync(); canvas.focus({ preventScroll: true }); render(performance.now());
});
pauseButton.addEventListener('click', togglePause);
$('#restart').addEventListener('click', restart);
$('#mobile-pause').addEventListener('click', togglePause);
$('#mobile-restart').addEventListener('click', restart);
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
bindAudioControl('music-hud', 'music');
bindAudioControl('sound', 'sfx');
bindAudioControl('sfx-hud', 'sfx');
$('#music-volume').addEventListener('input', () => {
  lakeAudio.unlock();
  lakeAudio.setMusicVolume(Number(($('#music-volume') as HTMLInputElement).value) / 100);
});
$('#sfx-volume').addEventListener('input', () => {
  lakeAudio.unlock();
  lakeAudio.setSfxVolume(Number(($('#sfx-volume') as HTMLInputElement).value) / 100);
});
paintAudio();
window.addEventListener('pointerdown', () => lakeAudio.unlock(), { capture: true });
window.addEventListener('keydown', () => lakeAudio.unlock(), { capture: true });
$('#app').addEventListener('pointerdown', event => {
  const button = (event.target as Element | null)?.closest('button');
  if (!button || button.closest('.dpad, .audio-dock, .controls-panel') || ['touch-draw', 'joystick', 'primary', 'restart', 'mobile-restart'].includes(button.id)) return;
  lakeAudio.play('click');
}, { capture: true });

const keyDirections: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', e => {
  if (isEditableTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
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
      notify(`蚀根受击 · ${event.hit.health}/${event.hit.maxHealth} HP · +${event.hit.points}`, `蚀根 ${event.hit.health}/${event.hit.maxHealth} · +${event.hit.points}`); lakeAudio.play('boss-hit');
    } else {
      for (const enemy of event.enemies) effects.push((theme.createDefeatEffect ?? enemyCelebration)(enemy, reducedMotion.matches));
      const names = event.enemies.map(enemy => ENEMY_STYLES[enemy.kind].name).join('、');
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
    const result = applyUnlocks(codex, game.percent, game.lives);
    codex = result.codex; writeCodex(codex);
    freshNote = result.fresh.length ? `新解开：${result.fresh.map(id => rewardNames[id]).join('、')}` : '这些纪念都已经在图鉴里了。';
    progress = noteClear(progress, current.id); writeLevelProgress(progress);
    effects.push(sealBreak(reducedMotion.matches));
    lakeAudio.play('seal');
    let fanfare = 1.15;
    if (game.percent >= 90 - 1e-4) { lakeAudio.play('milestone', 1, fanfare); fanfare += 0.62; }
    if (game.lives >= 3) { lakeAudio.play('perfect', 1, fanfare); fanfare += 0.4; }
    if (result.fresh.length) lakeAudio.play('reward', 1, fanfare);
  } else if (event === 'lost') lakeAudio.play('gameover');
  else if (event === 'start') lakeAudio.play('level');
  audioPercent = game.percent;
}

function sync() {
  const selecting = game.phase === 'opening', waiting = !game.actorsReady;
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
  $('#lives').innerHTML = Array.from({ length: 3 }, (_, i) => `<img class="life-paw" alt="" src="${asset(i < game.lives ? 'sprites/life_paw.png' : 'sprites/life_paw_empty.png')}">`).join('');
  paintCharms(); paintPortrait(); paintCast();
  $('#lives').setAttribute('aria-label', `剩余 ${game.lives} 条生命`);
  const seconds = Math.floor(game.elapsed);
  $('#elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  for (const kind of ['straight', 'orbit', 'zigzag', 'boss'] as const) {
    const remaining = kind === 'boss' ? Number(Boolean(game.boss)) : game.enemies.filter(enemy => enemy.kind === kind).length;
    const row = $(`[data-kind="${kind}"]`); row.classList.toggle('defeated', !waiting && remaining === 0);
    if (kind !== 'boss') row.querySelector('em')!.textContent = waiting ? '等待入场' : remaining === 0 ? '已击败' : `${kind === 'straight' ? 'FAST' : kind === 'orbit' ? 'ORBIT' : 'ZIGZAG'} ×${remaining}`;
  }
  $('#boss-status').textContent = waiting ? '等待入场' : !game.boss ? '已击败' : game.bossJump ? (game.bossJump.to ? '跃迁中' : '寻找落点') : game.bossAttack && game.bossAttack.warning > 0 ? '即将释放' : game.bossAttack?.name ?? '普通攻击';
  $('#boss-status').classList.toggle('warning', Boolean(game.boss && !game.bossJump && game.bossAttack && game.bossAttack.warning > 0));
  const hp = game.boss || waiting ? game.bossHealth : 0;
  $('#boss-hearts').innerHTML = Array.from({ length: game.bossMaxHealth }, (_, i) => `<i class="${i < hp ? 'filled' : ''}"></i>`).join('');
  $('#boss-hp-text').textContent = `${hp} / ${game.bossMaxHealth}`;
  $('#mobile-boss-hp').textContent = `${hp} / ${game.bossMaxHealth}`;
  $('#mobile-pause').textContent = game.phase === 'paused' ? '继续' : '暂停';
  ($('#mobile-pause') as HTMLButtonElement).disabled = !['playing', 'opening', 'paused'].includes(game.phase);
  $('.boss-health').setAttribute('aria-valuenow', String(hp)); $('.boss-health').setAttribute('aria-valuemax', String(game.bossMaxHealth));
  $('#boss-phase').hidden = game.bossPhase === '默认'; $('#boss-phase').textContent = game.reinforcementTarget === undefined ? game.bossPhase : `${game.bossPhase} · 访客 ${game.enemies.length}/${game.reinforcementTarget}`;
  pauseButton.disabled = !['playing', 'opening', 'paused'].includes(game.phase);
  overlay.hidden = game.phase === 'playing' || selecting || (game.phase === 'won' && effects.length > 0);
  $('#level-title').textContent = current.title;
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
  if (game.phase === 'paused') {
    $('#overlay-kicker').textContent = 'TAKE A BREATH';
    $('#overlay-title').textContent = '风景会等你。';
    $('#overlay-copy').textContent = '休息一下，准备好后继续探索。';
    $('#reward-note').textContent = '';
    $('#primary').innerHTML = `继续探索 ${icon('arrow')}`;
  } else if (game.phase === 'won') {
    const next = current.id < LEVELS.length ? levelById(current.id + 1) : undefined;
    const clearedAll = !next;
    $('#overlay-kicker').textContent = clearedAll ? 'ALL CLEAR' : 'SEAL BROKEN';
    $('#overlay-title').textContent = clearedAll ? '五关都醒了。' : current.id === 1 ? '阿澈醒了。' : `${current.theme}解开了。`;
    $('#overlay-copy').textContent = clearedAll
      ? `月下封林、沙漠神殿、雷雨实验室、玫瑰古堡和秋夜南瓜谷都已净化。得分 ${game.score.toLocaleString()}。`
      : `封印碎开。已净化 ${percent.toFixed(1)}% · 得分 ${game.score.toLocaleString()} · 用时 ${$('#elapsed').textContent}`;
    $('#reward-note').textContent = freshNote;
    $('#primary').innerHTML = clearedAll ? `从第一关再来 ${icon('reset')}` : `再玩本关 ${icon('reset')}`;
    const nextButton = $<HTMLButtonElement>('#next-level');
    nextButton.hidden = !next;
    if (next) nextButton.textContent = `前往${next.title}`;
    $('#overlay-hint').textContent = clearedAll ? '选关可以重游任意一关' : current.id === 1 ? (game.winReason === 'boss' ? '封林 · 蚀根已净化' : '封林 · 阿澈已解开') : current.title;
  } else if (game.phase === 'lost') {
    $('#overlay-kicker').textContent = 'EVERY TRY IS A NEW BEGINNING';
    $('#overlay-title').textContent = '下一次，再远一点。';
    $('#overlay-copy').textContent = current.id === 1
      ? `你已揭开 ${percent.toFixed(1)}% 的封林，获得 ${game.score.toLocaleString()} 分。再试一次？`
      : `你已揭开 ${percent.toFixed(1)}% 的${current.title}，获得 ${game.score.toLocaleString()} 分。再试一次？`;
    $('#reward-note').textContent = '';
    $('#primary').innerHTML = `重新挑战 ${icon('reset')}`;
  } else if (game.phase === 'opening' || game.phase === 'ready') {
    $('#overlay-kicker').textContent = current.id === 1 ? '封林' : current.title;
    $('#overlay-title').innerHTML = current.id === 1 ? '封印还在。<br>他在等你。' : '封印还在。<br>这一关在等你。';
    $('#overlay-copy').innerHTML = current.id === 1
      ? '按空格或动作键选定随机起点，5 秒后自动选定。<br>净化 75% 的林地，解开封林。'
      : `按空格或动作键选定随机起点，5 秒后自动选定。<br>净化 75% ，解开${current.title}。`;
    $('#reward-note').textContent = '';
    $('#primary').innerHTML = `开始探索 ${icon('arrow')}`;
  }
  if (!['playing', 'ready', 'opening'].includes(game.phase)) {
    clearInput();
    $('#primary').focus({ preventScroll: true });
  }
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
  // A separate, unlit frame marks the arena limit without looking like a shore.
  // The small exterior gap keeps a frame-touching mint island edge legible.
  ctx.save(); ctx.strokeStyle = theme.arenaBorder; ctx.lineWidth = 2 / scale;
  ctx.strokeRect(-4 / scale, -4 / scale, game.width + 8 / scale, game.height + 8 / scale); ctx.restore();
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
    for (const enemy of game.enemies) renderEnemy(ctx, enemy, 0, reducedMotion.matches);
    if (game.boss) renderEnemy(ctx, game.boss, game.bossJump ? 0 : game.bossAttack?.warning ?? 0, reducedMotion.matches, game.bossJump, game.bossFlash, game.bossAttack?.directions, game.bossAttack?.angleOffset);
    for (const hazard of game.hazards) hazard.render(ctx);
    if (game.actorsReady && (!game.protection || Math.floor(now / 100) % 2)) {
      ctx.save();
      const { x, y } = game.player;
      const facing = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[[...held].at(-1) ?? 'left'];
      renderWolfSpirit(ctx, x, y, facing, game.trail.length > 0);
      ctx.restore();
    }
  }
  ctx.restore();
  if (hitFlash > 0) { ctx.fillStyle = `rgba(255,80,100,${hitFlash * 0.35})`; ctx.fillRect(0, 0, width, height); }
}

let previous = performance.now();
let uiClock = 0;
let frameDt = 0;
function drawCharacterAura(ctx: CanvasRenderingContext2D) {
  if (!charMaskImage?.naturalWidth) return;
  const pulse = reducedMotion.matches ? 0.2 : 0.16 + 0.07 * Math.sin(performance.now() / 460);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.shadowColor = '#e7c56a';
  ctx.shadowBlur = 16;
  ctx.drawImage(charMaskImage, 0, 0, game.width, game.height);
  ctx.shadowColor = '#b48cff';
  ctx.shadowBlur = 8;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.drawImage(charMaskImage, 0, 0, game.width, game.height);
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
$('#open-gallery').addEventListener('click', openGallery);
$('#open-levels').addEventListener('click', openLevels);
$('#next-level').addEventListener('click', () => { if (current.id < LEVELS.length) beginLevel(current.id + 1); });
$('#levels-close').addEventListener('click', () => { closeLevels(); if (game.phase === 'paused') togglePause(); });
$('#level-list').addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-level]');
  if (!button || button.disabled) return;
  beginLevel(Number(button.dataset.level));
});
$('#portrait').addEventListener('click', openGallery);
$('#gallery-close').addEventListener('click', closeGallery);
$('#viewer-close').addEventListener('click', () => { $('#viewer').hidden = true; });
$('#charms').addEventListener('click', event => { if ((event.target as Element).closest('.charm')) openGallery(); });
$('#gallery-grid').addEventListener('click', event => {
  const item = (event.target as Element).closest<HTMLButtonElement>('.gallery-item');
  if (!item || item.disabled) return;
  const reward = galleryItems.find(entry => entry.id === item.dataset.reward);
  if (!reward) return;
  const image = $<HTMLImageElement>('#viewer-img');
  image.src = asset(reward.src); image.alt = reward.title; $('#viewer').hidden = false;
});
loadLevelMask(current);
sync();
requestAnimationFrame(frame);
