import { area, inside, type Polygon } from './geometry';

export interface CaptureEffect {
  readonly finished: boolean;
  update(seconds: number): void;
  render(context: CanvasRenderingContext2D): void;
}
export interface GameTheme {
  id: string;
  landscape: string;
  danger: string;
  boundary: string;
  trail: string;
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
export const lakeTheme: GameTheme = {
  id: 'quiet-lake', landscape: 'landscape.svg', danger: '#0e202b', boundary: '#79edc9', trail: '#ffcf75',
  createCaptureEffect: lakeDissolve,
};
