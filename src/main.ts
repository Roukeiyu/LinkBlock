import './style.css';
import { Game, type Direction, type GameEvent } from './engine';
import { lakeTheme, polygonPath, type CaptureEffect } from './effects';

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
            <div class="overlay-card"><p id="overlay-kicker" class="eyebrow">EXPLORE THE UNKNOWN</p><div class="territory-symbol" aria-hidden="true"><span></span><i></i></div><h2 id="overlay-title">每一次连接，<br>都是新的发现。</h2><p id="overlay-copy">从边界出发，画线围住未知区域。<br>占领 75% 的领地，揭开完整风景。</p><button id="primary" class="primary-button">开始探索 ${icon('arrow')}</button><span id="overlay-hint" class="overlay-hint">方向键移动 · 按住空格画线</span></div>
          </div>
          <div id="toast" class="toast" role="status" aria-live="polite"></div>
        </div>
        <div class="board-footer"><span><i id="state-dot" class="state-dot"></i><span id="state-label">准备就绪</span></span><span id="elapsed">00:00</span><span class="footer-note">保持连接，发现更多</span></div>
        <div class="touch-controls" aria-label="触屏操作"><div class="dpad"><button data-dir="up" aria-label="向上">↑</button><button data-dir="left" aria-label="向左">←</button><button data-dir="down" aria-label="向下">↓</button><button data-dir="right" aria-label="向右">→</button></div><button id="touch-draw" aria-pressed="false">画线：关</button></div>
      </div>
      <aside>
        <div class="side-panel field-notes"><div class="panel-heading"><span class="eyebrow">FIELD NOTES</span><span class="tiny-index">/ 001</span></div><h2>小小一步，<br>更大的世界。</h2><p class="panel-copy">安全区是你的起点，<br>勇气决定你的边界。</p><div class="divider"></div><ol class="instructions"><li><span class="step-number">01</span><div><h3>找到你的方向</h3><p>用 <kbd>↑</kbd> <kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd> 或 WASD<br>沿已占领区域的边缘移动。</p></div></li><li><span class="step-number">02</span><div><h3>越过边界</h3><p>按住 <kbd class="space-key">SPACE</kbd> 并移动画线，<br>接回安全区，完成圈地。<br>松开空格，沿原路快速收线。</p></div></li><li><span class="step-number">03</span><div><h3>小心红色访客</h3><p>敌人碰到未闭合的线会扣除生命。<br>避开它，让每次出发都有回响。</p></div></li></ol><div class="legend"><span><i class="legend-safe"></i>安全区</span><span><i class="legend-trail"></i>轨迹</span><span><i class="legend-enemy"></i>敌人</span></div></div>
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
let game = new Game();
let lastPhase = '';
let soundEnabled = false;
let audio: AudioContext | undefined;
let touchDraw = false;
let drawHeld = false;
const theme = lakeTheme;
const effects: CaptureEffect[] = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let hitFlash = 0;
let toastUntil = 0;
const held = new Set<Direction>();
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
  held.clear(); drawHeld = false; touchDraw = false;
  $('#touch-draw').setAttribute('aria-pressed', 'false');
  $('#touch-draw').textContent = '画线：关';
}
function restart() {
  clearInput(); game = new Game(); game.start(); effects.length = 0; hitFlash = 0;
  $('#toast').classList.remove('visible');
  sync(); canvas.focus({ preventScroll: true });
}
function togglePause() {
  game.togglePause(); clearInput(); sync();
  if (game.phase === 'playing') canvas.focus({ preventScroll: true });
}

$('#primary').addEventListener('click', () => {
  if (game.phase === 'paused') togglePause();
  else if (game.phase === 'ready') game.start();
  else restart();
  sync(); canvas.focus({ preventScroll: true });
});
pauseButton.addEventListener('click', togglePause);
$('#restart').addEventListener('click', restart);
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
    held.delete(direction); held.add(direction);
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    drawHeld = false;
    if (!touchDraw) game.beginRetraction();
  }
  if (keyDirections[e.code]) held.delete(keyDirections[e.code]);
});
function backgroundPause() {
  if (game.phase === 'playing') game.togglePause();
  clearInput(); sync();
}
window.addEventListener('blur', backgroundPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundPause(); });

document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach(button => {
  const direction = button.dataset.dir as Direction;
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (game.phase !== 'playing') return;
    button.setPointerCapture(e.pointerId); held.delete(direction); held.add(direction);
  });
  const release = () => held.delete(direction);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});
$('#touch-draw').addEventListener('click', () => {
  if (game.phase !== 'playing') return;
  touchDraw = !touchDraw;
  if (!touchDraw && !drawHeld) game.beginRetraction();
  $('#touch-draw').setAttribute('aria-pressed', String(touchDraw));
  $('#touch-draw').textContent = `画线：${touchDraw ? '开' : '关'}`;
});

function notify(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible'); toastUntil = performance.now() + 2200;
}
function handleEvent(event: GameEvent) {
  if (event === 'capture') {
    effects.push(theme.createCaptureEffect(game.captured.at(-1)!, reducedMotion.matches)); notify('连接成功 · 新的领地已揭开');
    tone(523); tone(784, 0.18, 0.08);
  } else if (event === 'hit') {
    hitFlash = 0.5; notify(`轨迹被击中 · 剩余 ${game.lives} 条生命`);
    tone(120, 0.25, 0, 'triangle');
  } else if (event === 'won') {
    tone(523); tone(659, 0.2, 0.15); tone(1046, 0.4, 0.3);
  } else if (event === 'start') tone(440);
}

function sync() {
  const percent = game.percent;
  $('#percent').innerHTML = `${percent.toFixed(1)}<span>%</span>`;
  $('#progress-fill').style.width = `${Math.min(percent / game.target * 100, 100)}%`;
  $('.progress-track').setAttribute('aria-valuenow', String(Math.min(percent, 75)));
  $('#score').textContent = String(game.score).padStart(6, '0');
  $('#lives').innerHTML = Array.from({ length: 3 }, (_, i) => `<span class="${i < game.lives ? '' : 'spent'}">♥</span>`).join(' ');
  $('#lives').setAttribute('aria-label', `剩余 ${game.lives} 条生命`);
  const seconds = Math.floor(game.elapsed);
  $('#elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  pauseButton.disabled = !['playing', 'paused'].includes(game.phase);
  overlay.hidden = game.phase === 'playing' || (game.phase === 'won' && effects.length > 0);
  if (lastPhase === game.phase) return;
  lastPhase = game.phase;
  const labels = { ready: '准备就绪', playing: '探索中', paused: '已暂停', won: '探索完成', lost: '本次探索结束' };
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
    $('#overlay-hint').textContent = '静谧之湖 · 已解锁完整风景';
  } else if (game.phase === 'lost') {
    $('#overlay-kicker').textContent = 'EVERY TRY IS A NEW BEGINNING';
    $('#overlay-title').textContent = '下一次，再远一点。';
    $('#overlay-copy').textContent = `你已揭开 ${percent.toFixed(1)}% 的风景，获得 ${game.score.toLocaleString()} 分。再试一次？`;
    $('#primary').innerHTML = `重新挑战 ${icon('reset')}`;
  }
  if (game.phase !== 'playing' && game.phase !== 'ready') {
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
    ctx.fillStyle = theme.danger; polygonPath(ctx, game.territory); ctx.fill();
  }
  for (const effect of effects) effect.render(ctx);
  ctx.save();
  ctx.lineWidth = 1.4 / scale; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = theme.boundary; ctx.shadowColor = theme.boundary; ctx.shadowBlur = 5;
  polygonPath(ctx, game.outline); ctx.stroke();
  if (game.phase !== 'won') { polygonPath(ctx, game.territory); ctx.stroke(); }
  ctx.restore();
  if (game.phase !== 'won') {
    if (game.trail.length) {
      ctx.save(); ctx.shadowColor = theme.trail; ctx.shadowBlur = 10;
      ctx.strokeStyle = theme.trail; ctx.lineWidth = 2.6 / scale; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      game.trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke(); ctx.restore();
    }
    ctx.save();
    ctx.translate(game.enemy.x, game.enemy.y); ctx.rotate(now / 550);
    ctx.strokeStyle = 'rgba(255,111,119,.5)'; ctx.lineWidth = 1 / scale;
    ctx.strokeRect(-0.8, -0.8, 1.6, 1.6);
    ctx.shadowBlur = 24; ctx.shadowColor = '#ff6f77'; ctx.fillStyle = '#ff6f77';
    ctx.fillRect(-0.4, -0.4, 0.8, 0.8);
    ctx.fillStyle = '#ffe6e1'; ctx.fillRect(-0.16, -0.16, 0.32, 0.32);
    ctx.restore();
    if (!game.protection || Math.floor(now / 100) % 2) {
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
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (game.update(dt, [...held].at(-1), drawHeld || touchDraw)) held.clear();
  for (const effect of effects) effect.update(game.phase === 'paused' ? 0 : dt);
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].finished) effects.splice(i, 1);
  for (const event of game.events.splice(0)) handleEvent(event);
  hitFlash = Math.max(0, hitFlash - dt);
  if (now > toastUntil) $('#toast').classList.remove('visible');
  uiClock += dt;
  if (uiClock >= 0.1 || lastPhase !== game.phase) { sync(); uiClock = 0; }
  render(now);
  requestAnimationFrame(frame);
}
sync();
requestAnimationFrame(frame);
