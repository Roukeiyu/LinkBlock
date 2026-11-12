import { AlternatingCrossAttack, type BossAttackFactory } from './attacks';
import { lakeBossConfig, type BossConfig, type BossHitVisual } from './boss';
import { ENEMY_STYLES, type DefeatedEnemy } from './enemies';
import { area, inside, type Polygon } from './geometry';

export interface CaptureEffect {
  readonly finished: boolean;
  readonly seal?: boolean;
  /** Remaining opacity of the sealed plate while the rescue plays. */
  cover?: number;
  update(seconds: number): void;
  render(context: CanvasRenderingContext2D): void;
}

export interface GameTheme {
  id: string;
  landscape: string;
  ruinedLandscape?: string;
  danger: string;
  arenaBorder: string;
  boundary: string;
  trail: string;
  createBossAttack?: BossAttackFactory;
  bossConfig?: BossConfig;
  createBossHitEffect?(hit: BossHitVisual, reducedMotion: boolean): CaptureEffect;
  createDefeatEffect?(enemy: DefeatedEnemy, reducedMotion: boolean): CaptureEffect;
  createCaptureEffect?(region: Polygon, reducedMotion: boolean): CaptureEffect;
}

export function polygonPath(ctx: CanvasRenderingContext2D, polygon: Polygon) {
  ctx.beginPath();
  polygon.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
}

export function clipPolygons(ctx: CanvasRenderingContext2D, polygons: Polygon[]) {
  ctx.beginPath();
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    polygon.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
  }
  ctx.clip();
}

// Both plates are drawn into this same world rectangle. Callers must not crop,
// scale, or offset one image differently from the other.
export const landscapeFrame = {
  restored: undefined as HTMLImageElement | undefined,
  ruined: undefined as HTMLImageElement | undefined,
  width: 72,
  height: 48,
};

export function bindLandscapes(restored: HTMLImageElement, ruined: HTMLImageElement, width: number, height: number) {
  landscapeFrame.restored = restored;
  landscapeFrame.ruined = ruined;
  landscapeFrame.width = width;
  landscapeFrame.height = height;
}

export function drawLandscape(ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, width = landscapeFrame.width, height = landscapeFrame.height) {
  if (!image?.complete || !image.naturalWidth || width <= 0 || height <= 0) return false;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.shadowBlur = 0;
  ctx.drawImage(image, 0, 0, width, height);
  ctx.imageSmoothingEnabled = smooth;
  return true;
}

type Mote = { x: number; y: number; vx: number; vy: number; size: number; phase: number; spin: number; kind: 'fly' | 'leaf' | 'petal' };

export function lakeDissolve(region: Polygon, reducedMotion: boolean, random = Math.random): CaptureEffect {
  const minX = Math.min(...region.map(p => p.x)), maxX = Math.max(...region.map(p => p.x));
  const minY = Math.min(...region.map(p => p.y)), maxY = Math.max(...region.map(p => p.y));
  const particles: Mote[] = [];
  const count = reducedMotion ? 0 : Math.min(96, Math.max(14, Math.round(area(region) / 12)));
  const kinds: Mote['kind'][] = ['fly', 'leaf', 'petal'];
  for (let attempt = 0; attempt < count * 30 && particles.length < count; attempt++) {
    const x = minX + random() * (maxX - minX), y = minY + random() * (maxY - minY);
    if (!inside({ x, y }, region)) continue;
    const kind = kinds[Math.floor(random() * kinds.length)];
      particles.push({
      x, y, vx: (random() - 0.5) * 1.4, vy: -0.7 - random() * 1.6,
      size: kind === 'fly' ? 0.045 + random() * 0.05 : 0.07 + random() * 0.08,
      phase: random() * Math.PI * 2, spin: (random() - 0.5) * 2.4, kind,
    });
  }
  if (!reducedMotion && particles.every(mote => mote.kind !== 'fly')) {
    particles.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, vx: 0, vy: -1, size: 0.06, phase: 0, spin: 0, kind: 'fly' });
  }
  const duration = reducedMotion ? 0.28 : 0.78;
  let age = 0;
  return {
    get finished() { return age >= duration; },
    update(seconds) { age += seconds; },
    render(ctx) {
      if (age >= duration) return;
      const t = age / duration;
      ctx.save();
      clipPolygons(ctx, [region]);
      ctx.shadowBlur = 0;
      if (!reducedMotion && landscapeFrame.ruined) {
        const horizontal = maxX - minX >= maxY - minY;
        const span = Math.max(0.001, horizontal ? maxX - minX : maxY - minY);
        const ease = 1 - (1 - Math.min(1, t / 0.72)) ** 2;
        const front = (horizontal ? minX : minY) - 0.2 + ease * (span + 1.1);
        const remain = (horizontal ? maxX : maxY) - front;
        if (remain > 0) {
          ctx.save();
          ctx.beginPath();
          if (horizontal) ctx.rect(front, minY - 1, remain + 1, maxY - minY + 2);
          else ctx.rect(minX - 1, front, maxX - minX + 2, remain + 1);
          ctx.clip();
          drawLandscape(ctx, landscapeFrame.ruined);
          ctx.restore();
        }
        const band = horizontal
          ? ctx.createLinearGradient(front - 0.85, 0, front + 0.35, 0)
          : ctx.createLinearGradient(0, front - 0.85, 0, front + 0.35);
        band.addColorStop(0, 'rgba(255,255,255,0)');
        band.addColorStop(0.42, 'rgba(255, 236, 170, 0.95)');
        band.addColorStop(0.68, 'rgba(121, 237, 201, 0.45)');
        band.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = band;
        ctx.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
        ctx.shadowColor = '#fff1b0'; ctx.shadowBlur = 10; ctx.strokeStyle = '#fff6cf'; ctx.lineWidth = 0.12;
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(front, minY); ctx.lineTo(front, maxY); }
        else { ctx.moveTo(minX, front); ctx.lineTo(maxX, front); }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      const bloom = Math.max(0, 1 - age / (reducedMotion ? 0.28 : 0.2));
      if (bloom > 0) {
        ctx.globalAlpha = bloom * (reducedMotion ? 0.32 : 0.98);
        ctx.fillStyle = '#ffffff';
        polygonPath(ctx, region); ctx.fill();
      }
      if (!reducedMotion && age > 0.04) {
        const progress = Math.min(1, (age - 0.04) / 0.74);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = Math.sin(Math.PI * progress) * (1 - progress * 0.35);
        for (const p of particles) {
          const x = p.x + p.vx * progress + Math.sin(p.phase + progress * 5) * 0.22;
          const y = p.y + p.vy * progress;
          ctx.fillStyle = p.kind === 'fly' ? '#d9fff1' : p.kind === 'leaf' ? '#8ee0a4' : '#ffc0d4';
          ctx.beginPath();
          ctx.ellipse(x, y, p.size * (p.kind === 'fly' ? 1 : 1.7), p.size * (p.kind === 'fly' ? 1 : 0.55), p.phase + p.spin * progress, 0, Math.PI * 2);
          ctx.fill();
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
      ctx.fillText(`-1 HP · +${hit.points}`, 0, -1.8); ctx.restore();
    },
  };
}

export function sealBreak(reducedMotion: boolean): CaptureEffect {
  let age = 0;
  const duration = reducedMotion ? 0.4 : 1.15;
  const cracks = reducedMotion ? [] : Array.from({ length: 14 }, (_, i) => {
    const angle = -Math.PI / 2 + i * 0.45;
    return { angle, bend: (i % 2 === 0 ? 1 : -1) * 0.35 };
  });
  return {
    seal: true,
    get cover() { return Math.max(0, 1 - age / (duration * 0.72)); },
    get finished() { return age >= duration; },
    update(seconds) { age += seconds; },
    render(ctx) {
      if (age >= duration || reducedMotion) return;
      const t = Math.min(1, age / (duration * 0.7));
      ctx.save();
      ctx.translate(36, 22);
      ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, age / duration)) * 0.9;
      ctx.strokeStyle = '#f2d48a'; ctx.lineWidth = 0.12; ctx.lineCap = 'round';
      ctx.shadowColor = '#c9a6ff'; ctx.shadowBlur = 8;
      for (const crack of cracks) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(crack.angle + crack.bend) * 8 * t, Math.sin(crack.angle + crack.bend) * 6 * t, Math.cos(crack.angle) * 26 * t, Math.sin(crack.angle) * 18 * t);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

export const lakeTheme: GameTheme = {
  id: 'quiet-lake', landscape: 'levels/1/v9/restored.webp', ruinedLandscape: 'levels/1/v9/sealed.webp', danger: '#09131c', arenaBorder: '#63869c', boundary: '#79edc9', trail: '#ffcf75',
  createCaptureEffect: lakeDissolve, createDefeatEffect: enemyCelebration, createBossHitEffect: bossHitPulse, createBossAttack: () => new AlternatingCrossAttack(),
  bossConfig: lakeBossConfig,
};
