import './style.css';
import { Game, type Direction, type GameEvent } from './engine';
import { ENEMY_STYLES } from './enemies';
import { renderEnemy } from './render-enemies';
import { OPENING_SECONDS, openingPercent } from './opening';
import { lakeTheme, polygonPath, enemyCelebration, bossHitPulse, type CaptureEffect } from './effects';

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
    <div class="header-right"><span class="online-dot"></span><span>无需登录，自由探索</span><span class="edition">WEB EDITION</span></div>
  </header>
  <main>
    <section class="intro"><div><p class="eyebrow">A LITTLE COURAGE. A NEW TERRITORY.</p><h1>连接，划出你的领地<span>。</span></h1><p class="intro-copy">越过边界，连接起点。让未知的风景，一点点显现。</p></div><div class="chapter"><span>01 / 01</span><p>初见 · 静谧之湖</p></div></section>
    <section class="game-layout" aria-label="LinkBlock 游戏">
      <div class="game-main">
        <div class="hud">
          <div class="progress-stat"><span class="stat-label">领地进度 <span class="muted">/ TARGET 75%</span></span><div class="progress-row"><strong id="percent">0.0<span>%</span></strong><div class="progress-track" role="progressbar" aria-label="占领进度" aria-valuemin="0" aria-valuemax="75" aria-valuenow="0"><div id="progress-fill"></div><i></i></div></div></div>
          <div class="hud-stat"><span class="stat-label">SCORE</span><strong id="score">000000</strong></div>
          <div class="hud-stat life-stat"><span class="stat-label">LIVES</span><strong id="lives" aria-label="剩余 3 条生命">♥ ♥ ♥</strong></div>
        </div>
        <div class="board-shell">
          <canvas id="board" width="864" height="576" tabindex="0" aria-label="游戏场地。方向键或 WASD 移动，按住空格画线，松开空格快速收线，P 暂停。">请使用支持 Canvas 的浏览器游玩 LinkBlock。</canvas>
          <span class="board-corner top-left" aria-hidden="true"></span><span class="board-corner bottom-right" aria-hidden="true"></span>
          <div id="overlay" class="overlay">
            <div class="overlay-card"><p id="overlay-kicker" class="eyebrow">EXPLORE THE UNKNOWN</p><div class="territory-symbol" aria-hidden="true"><span></span><i></i></div><h2 id="overlay-title">每一次连接，<br>都是新的发现。</h2><p id="overlay-copy">按空格或动作键选定随机起点，5 秒后自动选定。<br>占领 75% 的领地，揭开完整风景。</p><button id="primary" class="primary-button">开始探索 ${icon('arrow')}</button><span id="overlay-hint" class="overlay-hint">方向键移动 · 按住空格画线</span></div>
          </div>
          <div id="toast" class="toast" role="status" aria-live="polite"></div>
          <div id="opening-hint" hidden aria-label="空格或动作键确认起点，5秒后自动选定"></div>
        </div>
        <div class="board-footer"><span><i id="state-dot" class="state-dot"></i><span id="state-label">准备就绪</span></span><span id="elapsed">00:00</span><span class="footer-note">保持连接，发现更多</span></div>
        <div class="mobile-game-status"><span>守卫 <b id="mobile-boss-hp">5 / 5</b></span><button id="mobile-pause" aria-label="暂停游戏">暂停</button><button id="mobile-restart" aria-label="重新开始游戏">重开</button></div>
        <div class="touch-controls" aria-label="手机手柄" data-mode="two-left"><div class="controller-side dpad-side"><div class="dpad"><span class="dpad-hit-area" aria-hidden="true"></span><button data-dir="up" aria-label="向上">↑</button><button data-dir="left" aria-label="向左">←</button><button data-dir="down" aria-label="向下">↓</button><button data-dir="right" aria-label="向右">→</button></div><span>方向</span></div><div class="controller-side draw-side"><button id="touch-draw" aria-label="按住画线，松开收线" aria-pressed="false"><i aria-hidden="true"></i></button><span>按住画线 · 松开收线</span></div><div class="controller-side joystick-side" hidden><button id="joystick" aria-label="单手摇杆，按住拖动画线，松开收线" aria-pressed="false"><span class="joystick-guides" aria-hidden="true">＋</span><i class="joystick-knob" aria-hidden="true"></i></button><span>按住拖动画线 · 松开收线</span></div><button id="control-mode">切换操作方式 <span id="control-mode-name" aria-live="polite">双手 · 方向在左</span></button></div>
      </div>
      <aside>
        <div class="side-panel field-notes"><div class="panel-heading"><span class="eyebrow">FIELD NOTES</span><span class="tiny-index">/ 001</span></div><h2>小小一步，<br>更大的世界。</h2><p class="panel-copy">安全区是你的起点，<br>勇气决定你的边界。</p><div class="divider"></div><ol class="instructions"><li><span class="step-number">01</span><div><h3>找到你的方向</h3><p>用 <kbd>↑</kbd> <kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd> 或 WASD<br>沿已占领区域的边缘移动。</p></div></li><li><span class="step-number">02</span><div><h3>越过边界</h3><p>按住 <kbd class="space-key">SPACE</kbd> 并移动画线，<br>接回安全区，收下较小的一侧。<br>圈住普通访客可击败并得分，<br>圈住守卫可削减一格生命。<br>松开空格，沿原路快速收线。</p></div></li><li><span class="step-number">03</span><div><h3>观察访客的轨迹</h3><p>敌人会击断未闭合的线。<br>Boss 子弹能穿过领地边界，<br>躲开弹道再出发。</p></div></li></ol><div class="legend"><span><i class="legend-safe"></i>安全区</span><span><i class="legend-trail"></i>轨迹</span><span><i class="legend-enemy"></i>敌人</span></div><div class="enemy-roster" aria-label="敌人图鉴">${(['straight', 'orbit', 'zigzag', 'boss'] as const).map(kind => `<div class="enemy-entry" data-kind="${kind}"><i class="enemy-mark ${kind}" style="--enemy-color:${ENEMY_STYLES[kind].color}"></i><span>${ENEMY_STYLES[kind].name}<small>${ENEMY_STYLES[kind].motion}</small></span><em>${kind === 'boss' ? '<span id="boss-status">八向散射</span>' : kind === 'straight' ? 'FAST' : kind === 'orbit' ? 'ORBIT' : 'ZIGZAG'}</em></div>`).join('')}</div><div class="boss-health" role="progressbar" aria-label="Boss 生命" aria-valuemin="0" aria-valuemax="5" aria-valuenow="5"><span id="boss-hearts"></span><small id="boss-hp-text">5 / 5</small><span id="boss-phase" hidden></span></div></div>
        <div class="controls-panel"><button id="pause" disabled>${icon('pause')}<span>暂停</span><kbd>P</kbd></button><button id="restart">${icon('reset')}<span>重新开始</span><kbd>R</kbd></button><button id="sound" aria-pressed="false">${icon('sound')}<span>音效关闭</span><span class="toggle"></span></button></div>
        <div class="side-note"><span>✦</span><p>不必一次占领整个世界。<br>每一小块，都算数。</p></div>
      </aside>
    </section>
    <footer class="site-footer"><span>LINKBLOCK <span class="muted">/</span> 一场关于边界的小游戏</span><span>无需下载 · 即刻探索 <span class="footer-star">✳</span></span></footer>
  </main>`;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const canvas = $<HTMLCanvasElement>('#board');
const ctx = canvas.getContext('2d')!;
const overlay = $('#overlay');
const pauseButton = $<HTMLButtonElement>('#pause');
const theme = lakeTheme;
let game = new Game(72, 48, { opening: true, createBossAttack: theme.createBossAttack, bossConfig: theme.bossConfig });
let lastPhase = '';
let soundEnabled = false;
let audio: AudioContext | undefined;
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
let controlModeIndex = 0;
let joystickPointer: number | undefined;
let joystickCenter = { x: 0, y: 0 };
let joystickRadius = 0;
const joystickKeys = new Set<string>();
const image = new Image();
image.src = `${import.meta.env.BASE_URL}${theme.landscape}`;

function tone(frequency: number, duration = 0.12, delay = 0, type: OscillatorType = 'sine') {
  if (!soundEnabled) return;
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, audio.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + duration);
    osc.connect(gain); gain.connect(audio.destination);
    osc.start(audio.currentTime + delay); osc.stop(audio.currentTime + delay + duration);
  } catch { /* Audio is optional; the game remains playable. */ }
}

function clearInput() {
  held.clear(); keyboardHeld.clear(); pointerDirections.clear(); directionPointers.clear(); drawPointers.clear(); drawHeld = false; touchDraw = false;
  joystickPointer = undefined; joystickKeys.clear(); resetJoystick(); syncTouchDrawing();
  syncDirectionButtons();
}
function restart() {
  clearInput(); game = new Game(72, 48, { opening: true, createBossAttack: theme.createBossAttack, bossConfig: theme.bossConfig }); game.start(); effects.length = 0; hitFlash = 0;
  $('#toast').classList.remove('visible');
  openingFrameAt = performance.now();
  sync(); canvas.focus({ preventScroll: true }); render(performance.now());
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
  else restart();
  openingFrameAt = performance.now();
  sync(); canvas.focus({ preventScroll: true }); render(performance.now());
});
pauseButton.addEventListener('click', togglePause);
$('#restart').addEventListener('click', restart);
$('#mobile-pause').addEventListener('click', togglePause);
$('#mobile-restart').addEventListener('click', restart);
const interactionArea = $('.game-main');
interactionArea.addEventListener('contextmenu', e => e.preventDefault());
interactionArea.addEventListener('selectstart', e => e.preventDefault());
$('#control-mode').addEventListener('click', () => {
  clearInput(); controlModeIndex = (controlModeIndex + 1) % controlModes.length;
  const mode = controlModes[controlModeIndex], single = mode === 'one-hand', panel = $('.touch-controls');
  panel.dataset.mode = mode; panel.classList.toggle('swapped', mode === 'two-right'); panel.classList.toggle('single', single);
  $('.dpad-side').hidden = single; $('.draw-side').hidden = single; $('.joystick-side').hidden = !single;
  const label = single ? '单手 · 拖动摇杆' : mode === 'two-right' ? '双手 · 方向在右' : '双手 · 方向在左';
  $('#control-mode-name').textContent = label; $('#control-mode').setAttribute('aria-label', `切换操作方式，当前${label}`);
});
$('#sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('#sound').setAttribute('aria-pressed', String(soundEnabled));
  $('#sound span').textContent = soundEnabled ? '音效开启' : '音效关闭';
  tone(660);
});

const keyDirections: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
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
  if (e.code === 'Space') drawHeld = true;
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
  touchDraw = drawPointers.size > 0 || joystickKeys.size > 0;
  $('#touch-draw').setAttribute('aria-pressed', String(touchDraw));
  $('#joystick').setAttribute('aria-pressed', String(joystickPointer !== undefined || joystickKeys.size > 0));
}
function resetJoystick() {
  $('#joystick').style.removeProperty('--stick-x'); $('#joystick').style.removeProperty('--stick-y');
}
function cardinalDirection(dx: number, dy: number): Direction | undefined {
  if (Math.hypot(dx, dy) < 12) return undefined;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}
function updateJoystick(e: PointerEvent) {
  if (e.pointerId !== joystickPointer) return;
  const dx = e.clientX - joystickCenter.x, dy = e.clientY - joystickCenter.y;
  const length = Math.hypot(dx, dy), ratio = Math.min(1, joystickRadius / (length || 1));
  joystick.style.setProperty('--stick-x', `${dx * ratio}px`); joystick.style.setProperty('--stick-y', `${dy * ratio}px`);
  const direction = cardinalDirection(dx, dy);
  setPointerDirection(e.pointerId, direction);
}
joystick.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (game.phase === 'opening') { confirmOpening(); return; }
  if (game.phase !== 'playing' || controlModes[controlModeIndex] !== 'one-hand' || joystickPointer !== undefined) return;
  const box = joystick.getBoundingClientRect(), knob = joystick.querySelector<HTMLElement>('.joystick-knob')!;
  joystickCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  joystickRadius = Math.max(0, (box.width - knob.offsetWidth) / 2 - 10);
  joystickPointer = e.pointerId; drawPointers.add(e.pointerId); joystick.setPointerCapture(e.pointerId);
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

function notify(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible'); toastUntil = performance.now() + 2200;
}
function handleEvent(event: GameEvent) {
  if (typeof event === 'object') {
    if (event.type === 'bossHit') {
      effects.push((theme.createBossHitEffect ?? bossHitPulse)(event.hit, reducedMotion.matches));
      notify(`守卫受击 · ${event.hit.health}/${event.hit.maxHealth} HP · +${event.hit.points}`); tone(240, 0.15, 0, 'triangle');
    } else {
      for (const enemy of event.enemies) effects.push((theme.createDefeatEffect ?? enemyCelebration)(enemy, reducedMotion.matches));
      const names = event.enemies.map(enemy => ENEMY_STYLES[enemy.kind].name).join('、');
      const points = event.enemies.reduce((sum, enemy) => sum + enemy.points, 0);
      notify(`圈敌成功 · ${names} +${points}`); tone(660); tone(990, 0.2, 0.08);
    }
  } else if (event === 'capture') {
    for (const region of game.lastCapture) effects.push(theme.createCaptureEffect(region, reducedMotion.matches));
    notify('连接成功 · 新的领地已揭开');
    tone(523); tone(784, 0.18, 0.08);
  } else if (event === 'partition') {
    notify('通路已连接 · 继续围出闭合区域'); tone(440);
  } else if (event === 'bossAttack') {
    tone(180, 0.15, 0, 'triangle');
  } else if (event === 'hit') {
    hitFlash = 0.5; notify(`受到攻击 · 剩余 ${game.lives} 条生命`);
    tone(120, 0.25, 0, 'triangle');
  } else if (event === 'won') {
    tone(523); tone(659, 0.2, 0.15); tone(1046, 0.4, 0.3);
  } else if (event === 'start') tone(440);
}

function sync() {
  const selecting = game.phase === 'opening', waiting = !game.actorsReady;
  $('#opening-hint').hidden = !selecting;
  if (selecting && game.opening) $('#opening-hint').textContent = `${openingPercent(game.opening, game.width, game.height).toFixed(1)}% · 空格 / 动作键确认 · ${Math.max(0, OPENING_SECONDS - game.opening.elapsed).toFixed(1)}s`;
  drawButton.setAttribute('aria-label', selecting ? '确认起点' : '按住画线，松开收线');
  joystick.setAttribute('aria-label', selecting ? '确认起点' : '单手摇杆，按住拖动画线，松开收线');
  $('.draw-side > span').textContent = selecting ? '点击确认起点' : '按住画线 · 松开收线';
  $('.joystick-side > span').textContent = selecting ? '点击确认起点' : '按住拖动画线 · 松开收线';
  const percent = game.percent;
  $('#percent').innerHTML = `${percent.toFixed(1)}<span>%</span>`;
  $('#progress-fill').style.width = `${Math.min(percent / game.target * 100, 100)}%`;
  $('.progress-track').setAttribute('aria-valuenow', String(Math.min(percent, 75)));
  $('#score').textContent = String(game.score).padStart(6, '0');
  $('#lives').innerHTML = Array.from({ length: 3 }, (_, i) => `<span class="${i < game.lives ? '' : 'spent'}">♥</span>`).join(' ');
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
  if (lastPhase === game.phase) return;
  lastPhase = game.phase;
  const labels = { ready: '准备就绪', opening: '选择起点', playing: '探索中', paused: '已暂停', won: '探索完成', lost: '本次探索结束' };
  $('#state-label').textContent = labels[game.phase];
  $('#state-dot').classList.toggle('active', game.phase === 'playing');
  $('#pause span').textContent = game.phase === 'paused' ? '继续' : '暂停';
  $('#overlay-hint').textContent = '方向键移动 · 按住空格画线';
  if (game.phase === 'paused') {
    $('#overlay-kicker').textContent = 'TAKE A BREATH';
    $('#overlay-title').textContent = '风景会等你。';
    $('#overlay-copy').textContent = '休息一下，准备好后继续探索。';
    $('#primary').innerHTML = `继续探索 ${icon('arrow')}`;
  } else if (game.phase === 'won') {
    $('#overlay-kicker').textContent = 'TERRITORY DISCOVERED';
    $('#overlay-title').textContent = '这片风景，属于你。';
    $('#overlay-copy').textContent = `已占领 ${percent.toFixed(1)}% · 得分 ${game.score.toLocaleString()} · 用时 ${$('#elapsed').textContent}`;
    $('#primary').innerHTML = `再探索一次 ${icon('reset')}`;
    $('#overlay-hint').textContent = game.winReason === 'boss' ? '静谧之湖 · 守卫已击败' : '静谧之湖 · 已解锁完整风景';
  } else if (game.phase === 'lost') {
    $('#overlay-kicker').textContent = 'EVERY TRY IS A NEW BEGINNING';
    $('#overlay-title').textContent = '下一次，再远一点。';
    $('#overlay-copy').textContent = `你已揭开 ${percent.toFixed(1)}% 的风景，获得 ${game.score.toLocaleString()} 分。再试一次？`;
    $('#primary').innerHTML = `重新挑战 ${icon('reset')}`;
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
  if (image.complete && image.naturalWidth) ctx.drawImage(image, 0, 0, game.width, game.height);
  if (game.phase !== 'won') {
    ctx.fillStyle = theme.danger;
    for (const region of game.territories) { polygonPath(ctx, region); ctx.fill(); }
  }
  for (const effect of effects) effect.render(ctx);
  if (game.phase === 'opening' && game.opening) {
    ctx.save(); polygonPath(ctx, game.opening.region); ctx.clip();
    if (image.complete && image.naturalWidth) ctx.drawImage(image, 0, 0, game.width, game.height);
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
      ctx.shadowBlur = 18; ctx.shadowColor = theme.boundary;
      ctx.strokeStyle = 'rgba(118,241,206,.4)'; ctx.lineWidth = 1 / scale;
      ctx.beginPath(); ctx.arc(x, y, 0.75, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = game.trail.length ? theme.trail : theme.boundary;
      ctx.beginPath(); ctx.arc(x, y, 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0fff9';
      ctx.beginPath(); ctx.arc(x, y, 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  if (hitFlash > 0) { ctx.fillStyle = `rgba(255,80,100,${hitFlash * 0.35})`; ctx.fillRect(0, 0, width, height); }
}

let previous = performance.now();
let uiClock = 0;
function frame(now: number) {
  const at = performance.now(), rawDt = Math.max(0, (now - previous) / 1000);
  const dt = game.phase === 'opening' ? Math.max(0, (at - openingFrameAt) / 1000) : Math.min(rawDt, 0.05);
  openingFrameAt = at;
  previous = now;
  const wasOpening = game.phase === 'opening';
  const candidateBefore = game.opening?.candidates;
  if (game.update(dt, [...held].at(-1), drawHeld || touchDraw)) held.clear();
  if (wasOpening && game.phase === 'playing') clearInput();
  for (const effect of effects) effect.update(game.phase === 'paused' ? 0 : dt);
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].finished) effects.splice(i, 1);
  for (const event of game.events.splice(0)) handleEvent(event);
  hitFlash = Math.max(0, hitFlash - dt);
  if (now > toastUntil) $('#toast').classList.remove('visible');
  uiClock += dt;
  if (uiClock >= 0.1 || lastPhase !== game.phase || (game.phase === 'opening' && candidateBefore !== game.opening?.candidates)) { sync(); uiClock = 0; }
  render(now);
  requestAnimationFrame(frame);
}
sync();
requestAnimationFrame(frame);
