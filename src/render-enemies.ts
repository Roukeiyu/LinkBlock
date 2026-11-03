import { ENEMY_STYLES, type Enemy } from './enemies';

export function renderEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, warning = 0, reducedMotion = false) {
  const color = ENEMY_STYLES[enemy.kind].color;
  ctx.save();
  if (!reducedMotion && enemy.trace.length > 1) {
    ctx.strokeStyle = color; ctx.globalAlpha = 0.22; ctx.lineWidth = 0.12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); enemy.trace.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.translate(enemy.x, enemy.y);
  ctx.shadowColor = color; ctx.shadowBlur = enemy.kind === 'boss' ? 20 : 10;
  ctx.strokeStyle = color; ctx.fillStyle = '#14232e'; ctx.lineWidth = 0.1;
  if (enemy.kind === 'boss') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 - Math.PI / 6, x = Math.cos(angle) * 1.18, y = Math.sin(angle) * 1.18;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 0.065;
    ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.stroke();
    if (warning > 0) {
      ctx.globalAlpha = 0.3 + warning * 0.7;
      ctx.strokeStyle = '#ffe0c6'; ctx.lineWidth = 0.14;
      ctx.beginPath(); ctx.arc(0, 0, 1.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * warning); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 2.1, Math.sin(angle) * 2.1);
        ctx.lineTo(Math.cos(angle) * 2.8, Math.sin(angle) * 2.8); ctx.stroke();
      }
    }
  } else {
    if (enemy.kind === 'straight') {
      ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
      ctx.beginPath(); ctx.moveTo(0.85, 0); ctx.lineTo(-0.5, -0.55); ctx.lineTo(-0.23, 0); ctx.lineTo(-0.5, 0.55); ctx.closePath();
    } else if (enemy.kind === 'orbit') {
      ctx.beginPath(); ctx.arc(0, 0, 0.67, 0, Math.PI * 2);
    } else {
      ctx.beginPath(); ctx.moveTo(0, -0.78); ctx.lineTo(0.7, 0); ctx.lineTo(0, 0.78); ctx.lineTo(-0.7, 0); ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 0.2, 0, Math.PI * 2); ctx.fill();
    if (enemy.kind === 'zigzag') {
      ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(-0.3, -0.1); ctx.lineTo(0.1, -0.3); ctx.lineTo(-0.1, 0.3); ctx.lineTo(0.3, 0.1); ctx.stroke();
    }
  }
  ctx.restore();
}
