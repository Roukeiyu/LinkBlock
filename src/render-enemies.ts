import { jumpPose, type BossJump } from './boss';
import { ENEMY_STYLES, type Enemy } from './enemies';

function bodyClock(reducedMotion: boolean) {
  return reducedMotion ? 0 : performance.now() / 1000;
}

export function renderEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, warning = 0, reducedMotion = false, jump?: BossJump, hurt = 0, directions = 4, angleOffset = 0) {
  const color = ENEMY_STYLES[enemy.kind].color;
  const r = enemy.visualRadius;
  const time = bodyClock(reducedMotion);
  ctx.save();
  if (!reducedMotion && !jump && enemy.trace.length > 1) {
    ctx.strokeStyle = color; ctx.globalAlpha = 0.22; ctx.lineWidth = 0.12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); enemy.trace.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  }
  const pose = jump ? jumpPose(jump, reducedMotion) : undefined;
  if (pose) {
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(pose.shadow.x, pose.shadow.y + r * 0.21, r * 1.14, r * 0.41, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = color; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.ellipse(pose.shadow.x, pose.shadow.y + r * 0.21, r * 1.31, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.translate(pose?.x ?? enemy.x, pose?.y ?? enemy.y);
  if (pose) ctx.scale(pose.scale, pose.scale);
  ctx.shadowColor = color; ctx.shadowBlur = enemy.kind === 'boss' ? 18 : 10;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (enemy.kind === 'boss') drawBoss(ctx, color, r, time, hurt, warning, directions, angleOffset);
  else drawCorrupter(ctx, enemy, color, r, time, hurt);
  ctx.restore();
}

function drawCorrupter(ctx: CanvasRenderingContext2D, enemy: Enemy, color: string, r: number, time: number, hurt: number) {
  const baseRadius = ENEMY_STYLES[enemy.kind].visualRadius;
  ctx.scale(r / baseRadius, r / baseRadius);
  ctx.fillStyle = hurt > 0 ? '#ffe8d1' : enemy.kind === 'orbit' ? '#16121c' : enemy.kind === 'zigzag' ? '#101820' : '#1a1218';
  ctx.strokeStyle = color; ctx.lineWidth = 0.07;
  if (enemy.kind === 'straight') {
    ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
    const puff = Math.sin(time * 9) * 0.05;
    ctx.beginPath();
    ctx.moveTo(0.86, 0);
    ctx.bezierCurveTo(0.22, -0.5 - puff, -0.48, -0.38, -0.72, puff * 0.25);
    ctx.bezierCurveTo(-0.55, 0.22, 0.18, 0.5 + puff, 0.86, 0);
    ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#6e3140'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(-0.15, 0.08); ctx.quadraticCurveTo(-0.62, 0.36 + puff, -0.9, 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.1, -0.06); ctx.quadraticCurveTo(-0.58, -0.34, -0.84, 0.02); ctx.stroke();
    ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0.18, 0, 0.15, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (enemy.kind === 'orbit') {
    ctx.beginPath(); ctx.arc(0, 0, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#6a568f'; ctx.lineWidth = 0.06;
    ctx.save(); ctx.rotate(time * 0.8);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 0.36, Math.sin(angle) * 0.36);
      ctx.lineTo(Math.cos(angle) * 0.66, Math.sin(angle) * 0.66);
      ctx.stroke();
    }
    ctx.restore();
    ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, 0.15, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const flick = Math.sin(time * 7) * 0.07;
  ctx.beginPath();
  ctx.moveTo(0, -0.7 - flick);
  ctx.quadraticCurveTo(0.52, -0.12, 0.08, 0.62);
  ctx.quadraticCurveTo(0, 0.28, -0.08, 0.62);
  ctx.quadraticCurveTo(-0.52, -0.08, 0, -0.7 - flick);
  ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#3d7590'; ctx.lineWidth = 0.045;
  ctx.beginPath(); ctx.moveTo(0, -0.28); ctx.lineTo(0.1, 0.02); ctx.lineTo(-0.08, 0.26); ctx.stroke();
  ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, -0.08, 0.15, 0, Math.PI * 2); ctx.fill();
}

function drawBoss(ctx: CanvasRenderingContext2D, color: string, r: number, time: number, hurt: number, warning: number, directions: number, angleOffset: number) {
  const sway = Math.sin(time * 1.4) * 0.05;
  ctx.fillStyle = hurt > 0 ? '#ffe8d1' : '#121614';
  ctx.beginPath();
  ctx.moveTo(-0.32, 1.05);
  ctx.lineTo(-0.18, 0.2);
  ctx.lineTo(-1.25, -0.05);
  ctx.lineTo(-0.55, -0.28);
  ctx.lineTo(-1.45, -0.9);
  ctx.lineTo(-0.35, -0.62 + sway);
  ctx.lineTo(-0.9, -1.65);
  ctx.lineTo(0.05, -0.95);
  ctx.lineTo(0.95, -1.6);
  ctx.lineTo(0.42, -0.58);
  ctx.lineTo(1.5, -0.72);
  ctx.lineTo(0.62, -0.18);
  ctx.lineTo(1.28, 0.12);
  ctx.lineTo(0.28, 0.28);
  ctx.lineTo(0.38, 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#3c463c'; ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(-0.22, 0.72); ctx.quadraticCurveTo(-0.95, 1.15, -1.35, 0.82);
  ctx.moveTo(0.24, 0.78); ctx.quadraticCurveTo(1.05, 1.2, 1.4, 0.78);
  ctx.stroke();
  ctx.strokeStyle = '#5c4038'; ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.7, -1.15); ctx.quadraticCurveTo(-1.15, -1.45, -0.95, -1.7);
  ctx.moveTo(0.75, -1.1); ctx.quadraticCurveTo(1.2, -1.4, 1.05, -1.68);
  ctx.stroke();
  ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = color; ctx.lineWidth = 0.07;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3 - Math.PI / 6, x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.stroke(); ctx.restore();
  ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, -0.15, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff5eb';
  ctx.beginPath(); ctx.arc(-0.06, -0.2, r * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 0.06; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  if (warning > 0) {
    ctx.globalAlpha = 0.3 + warning * 0.7;
    ctx.strokeStyle = '#ffe0c6'; ctx.lineWidth = 0.14;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.53, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * warning); ctx.stroke();
    for (let i = 0; i < directions; i++) {
      const angle = angleOffset + i * Math.PI * 2 / directions;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * r * 1.78, Math.sin(angle) * r * 1.78);
      ctx.lineTo(Math.cos(angle) * r * 2.37, Math.sin(angle) * r * 2.37); ctx.stroke();
    }
  }
}
