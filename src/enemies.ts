import { distance, EPS, inside, type Point, type Polygon } from './geometry';

export type EnemyKind = 'straight' | 'orbit' | 'zigzag' | 'boss';
export interface DefeatedEnemy extends Point { kind: EnemyKind; points: number }
export const DEFEAT_POINTS: Record<EnemyKind, number> = { straight: 500, orbit: 500, zigzag: 500, boss: 2000 };
export interface Enemy extends Point {
  kind: EnemyKind;
  vx: number;
  vy: number;
  radius: number;
  // Gameplay hit circle and visible body size are deliberately independent.
  visualRadius: number;
  previous: Point;
  turnClock: number;
  turnSign: number;
  traceClock: number;
  trace: Point[];
}
export const ENEMY_STYLES = {
  straight: { name: '疾行', motion: '快速直线', color: '#ff727d', speed: 14.3, radius: 0.55, visualRadius: 0.85 },
  orbit: { name: '环游', motion: '缓速环绕', color: '#bda4ff', speed: 5.2, radius: 0.55, visualRadius: 0.67 },
  zigzag: { name: '折光', motion: '折线巡游', color: '#72cfff', speed: 9, radius: 0.55, visualRadius: 0.78 },
  boss: { name: '湖心守卫', motion: '缓慢移动', color: '#ffa56e', speed: 2.3, radius: 1.65, visualRadius: 2 },
} satisfies Record<EnemyKind, { name: string; motion: string; color: string; speed: number; radius: number; visualRadius: number }>;

export function createEnemy(kind: EnemyKind, position: Point, velocity?: Point): Enemy {
  const headings = { straight: 0.21, orbit: -Math.PI / 2, zigzag: -0.45, boss: -2.6 };
  const speed = ENEMY_STYLES[kind].speed, angle = headings[kind];
  return { ...position, kind, vx: velocity?.x ?? Math.cos(angle) * speed, vy: velocity?.y ?? Math.sin(angle) * speed,
    radius: ENEMY_STYLES[kind].radius, visualRadius: ENEMY_STYLES[kind].visualRadius,
    previous: { ...position }, turnClock: 0, turnSign: 1, traceClock: 0, trace: [{ ...position }] };
}
export function defaultBoss(width: number, height: number) {
  const clearance = ENEMY_STYLES.boss.visualRadius + 0.16;
  return createEnemy('boss', { x: Math.max(clearance, Math.min(width - clearance, width * 0.84)),
    y: Math.max(clearance, Math.min(height - clearance, height * 0.76)) });
}
export function defaultEnemies(width: number, height: number, boss?: Enemy) {
  const kinds = ['straight', 'orbit', 'zigzag'] as const;
  const preferred = kinds.flatMap((kind, row) => [0.58, 0.73, 0.88].map(x => createEnemy(kind, { x: width * x, y: height * [0.25, 0.51, 0.76][row] })));
  const safe = (enemy: Enemy, placed: Enemy[]) => enemy.x >= enemy.radius + 0.1 && enemy.x <= width - enemy.radius - 0.1
    && enemy.y >= enemy.radius + 0.1 && enemy.y <= height - enemy.radius - 0.1
    && Math.hypot(enemy.x - width / 2, enemy.y) >= enemy.radius + 0.34 + 0.1
    && (!boss || Math.hypot(enemy.x - boss.x, enemy.y - boss.y) >= enemy.radius + boss.visualRadius + 0.06)
    && placed.every(other => Math.hypot(enemy.x - other.x, enemy.y - other.y) >= enemy.radius + other.radius + 0.06 - EPS);
  if (preferred.every((enemy, i) => safe(enemy, preferred.slice(0, i)))) return preferred;
  // Compact test arenas use a deterministic, finite placement search instead
  // of clamping several enemies onto the same point or into the larger boss.
  const placed: Enemy[] = [], radius = ENEMY_STYLES.straight.radius, spacing = radius * 2 + 0.06;
  for (let y = radius + 0.1; y <= height - radius - 0.1 + EPS && placed.length < 9; y += spacing) {
    for (let x = radius + 0.1; x <= width - radius - 0.1 + EPS && placed.length < 9; x += spacing) {
      const enemy = createEnemy(kinds[Math.floor(placed.length / 3)], { x, y });
      if (safe(enemy, placed)) placed.push(enemy);
    }
  }
  if (placed.length !== 9) throw new Error('Board cannot safely hold the default enemy roster');
  return placed;
}
function rotate(enemy: Enemy, angle: number) {
  const { vx, vy } = enemy;
  enemy.vx = vx * Math.cos(angle) - vy * Math.sin(angle);
  enemy.vy = vx * Math.sin(angle) + vy * Math.cos(angle);
}
export type Walls = [Point, Point][];
export function advanceEnemy(enemy: Enemy, seconds: number, regions: Polygon[], walls: Walls[]) {
  enemy.previous = { x: enemy.x, y: enemy.y };
  const region = regions.findIndex(polygon => inside(enemy, polygon));
  if (region < 0) return;
  if (enemy.kind === 'orbit') rotate(enemy, seconds * 0.85 * enemy.turnSign);
  if (enemy.kind === 'zigzag') {
    enemy.turnClock += seconds;
    if (enemy.turnClock >= 0.72 - EPS) {
      enemy.turnClock -= 0.72;
      rotate(enemy, enemy.turnSign * Math.PI * 0.4); enemy.turnSign *= -1;
    }
  }
  const blocked = (p: Point) => !inside(p, regions[region]) || walls[region].some(([a, b]) => distance(p, a, b) < enemy.radius);
  const nx = { x: enemy.x + enemy.vx * seconds, y: enemy.y };
  if (blocked(nx)) { enemy.vx *= -1; if (enemy.kind === 'orbit') enemy.turnSign *= -1; }
  else enemy.x = nx.x;
  const ny = { x: enemy.x, y: enemy.y + enemy.vy * seconds };
  if (blocked(ny)) { enemy.vy *= -1; if (enemy.kind === 'orbit') enemy.turnSign *= -1; }
  else enemy.y = ny.y;
  enemy.traceClock += seconds;
  if (enemy.traceClock >= 0.06) {
    enemy.traceClock %= 0.06; enemy.trace.push({ x: enemy.x, y: enemy.y });
    if (enemy.trace.length > 18) enemy.trace.shift();
  }
}
