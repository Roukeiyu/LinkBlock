import { AlternatingCrossAttack, type BossAttackFactory } from './attacks';
import { lakeBossConfig, type BossConfig, type BossHitVisual } from './boss';
import { ENEMY_STYLES, type DefeatedEnemy } from './enemies';
import { area, inside, type Polygon } from './geometry';

export interface CaptureEffect {
  readonly finished: boolean;
  update(seconds: number): void;
  render(context: CanvasRenderingContext2D): void;
}
export interface GameTheme {
  id: string;
  landscape: string;
  /** Solid positive shape accumulated by captures, independent of the backdrop. */
  territory: string;
  backdropShade: string;
  danger: string;
  boundary: string;
  trail: string;
  createBossAttack?: BossAttackFactory;
  bossConfig?: BossConfig;
  createBossHitEffect?(hit: BossHitVisual, reducedMotion: boolean): CaptureEffect;
  createDefeatEffect?(enemy: DefeatedEnemy, reducedMotion: boolean): CaptureEffect;
  createCaptureEffect(region: Polygon, reducedMotion: boolean): CaptureEffect;
}
export function polygonPath(ctx: CanvasRenderingContext2D, polygon: Polygon) {
  ctx.beginPath();
  polygon.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
}

// The theme owns the entire effect, so future themes can replace its particles,
// palette and timing without changing input, capture rules, or the game loop.
export function lakeDissolve(region: Polygon, reducedMotion: boolean, random = Math.random): CaptureEffect {
  const minX = Math.min(...region.map(p => p.x)), maxX = Math.max(...region.map(p => p.x));
  const minY = Math.min(...region.map(p => p.y)), maxY = Math.max(...region.map(p => p.y));
  const particles: { x: number; y: number; vx: number; vy: number; size: number; phase: number }[] = [];
  const count = reducedMotion ? 0 : Math.min(180, Math.max(16, Math.round(area(region) / 8)));
  // Bounded rejection sampling works for concave and very thin regions too.
  for (let attempt = 0; attempt < count * 30 && particles.length < count; attempt++) {
    const x = minX + random() * (maxX - minX), y = minY + random() * (maxY - minY);
    if (inside({ x, y }, region)) particles.push({ x, y, vx: (random() - 0.5) * 1.8, vy: -0.8 - random() * 1.7, size: 0.05 + random() * 0.12, phase: random() * Math.PI * 2 });
  }
  let age = 0;
  return {
    get finished() { return age >= (reducedMotion ? 0.24 : 1.1); },
    update(seconds) { age += seconds; },
    render(ctx) {
      ctx.save();
      const white = Math.max(0, 1 - age / (reducedMotion ? 0.24 : 0.23));
      if (white > 0) {
        ctx.globalAlpha = white * (reducedMotion ? 0.28 : 0.96);
        ctx.fillStyle = '#ffffff'; polygonPath(ctx, region); ctx.fill();
      }
      if (age > 0.08 && !reducedMotion) {
        const progress = Math.min(1, (age - 0.08) / 1.02);
        ctx.globalAlpha = Math.sin(Math.PI * progress) * (1 - progress);
        ctx.fillStyle = '#d9fff1'; ctx.shadowColor = '#79edc9'; ctx.shadowBlur = 8;
        for (const p of particles) {
          const x = p.x + p.vx * progress + Math.sin(p.phase + progress * 5) * 0.28;
          const y = p.y + p.vy * progress;
          ctx.beginPath(); ctx.ellipse(x, y, p.size * (1 - progress * 0.6), p.size * 0.55, -0.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    },
  };
}
export function enemyCelebration(enemy: DefeatedEnemy, reducedMotion: boolean, random = Math.random): CaptureEffect {
  const { x, y, kind, points } = enemy;
  const color = ENEMY_STYLES[kind].color;
  const count = reducedMotion ? 0 : kind === 'boss' ? 56 : 32;
  const sparks = Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2 + (random() - 0.5) * 0.16;
    const speed = (2.8 + random() * 3.6) * (kind === 'boss' ? 1.3 : 1);
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 0.09 + random() * 0.07 };
  });
  let age = 0;
  const duration = reducedMotion ? 0.45 : 1.05;
  return {
    get finished() { return age >= duration; },
    update(seconds) { age += seconds; },
    render(ctx) {
      if (age >= duration) return;
      const progress = age / duration;
      ctx.save(); ctx.translate(x, y);
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.lineWidth = 0.1; ctx.beginPath();
      ctx.arc(0, 0, reducedMotion ? 0.9 : 0.4 + progress * 3.2, 0, Math.PI * 2); ctx.stroke();
      for (const spark of sparks) {
        const sx = spark.vx * age, sy = spark.vy * age + age * age * 1.8;
        ctx.lineWidth = spark.size; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx - spark.vx * 0.035, sy - spark.vy * 0.035);
        ctx.lineTo(sx, sy); ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.font = `${kind === 'boss' ? 1.8 : 1.4}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`+${points}`, 0, -1.5 - (reducedMotion ? 0 : age * 1.2));
      ctx.restore();
    },
  };
}

export function bossHitPulse(hit: BossHitVisual, reducedMotion: boolean): CaptureEffect {
  let age = 0;
  return {
    get finished() { return age >= 0.5; },
    update(seconds) { age += seconds; },
    render(ctx) {
      if (age >= 0.5) return;
      ctx.save(); ctx.translate(hit.x, hit.y); ctx.globalAlpha = 1 - age / 0.5;
      ctx.strokeStyle = '#ffa56e'; ctx.lineWidth = 0.14;
      ctx.beginPath(); ctx.arc(0, 0, reducedMotion ? 1.4 : 1 + age * 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd7b9'; ctx.font = '1.4px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`−1 HP · +${hit.points}`, 0, -1.8); ctx.restore();
    },
  };
}

export const lakeTheme: GameTheme = {
  id: 'quiet-lake', landscape: 'landscape.svg', territory: '#163c3c', backdropShade: '#07141a66', danger: '#0e202b', boundary: '#79edc9', trail: '#ffcf75',
  createCaptureEffect: lakeDissolve, createDefeatEffect: enemyCelebration, createBossHitEffect: bossHitPulse, createBossAttack: () => new AlternatingCrossAttack(),
  bossConfig: lakeBossConfig,
};
