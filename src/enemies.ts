import { distance, EPS, inside, wallEdges, type Point, type Polygon } from './geometry';

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
  straight: { name: '腐风', motion: '雾 / 孢 / 鸦', color: '#ff727d', speed: 14.3, radius: 0.55, visualRadius: 0.85 },
  orbit: { name: '荆蚀', motion: '环绕蔓延', color: '#bda4ff', speed: 5.2, radius: 0.55, visualRadius: 0.67 },
  zigzag: { name: '残魂', motion: '折线游魂', color: '#72cfff', speed: 9, radius: 0.55, visualRadius: 0.78 },
  boss: { name: '蚀根', motion: '腐林之主', color: '#ffa56e', speed: 2.3, radius: 1.65, visualRadius: 2 },
} satisfies Record<EnemyKind, { name: string; motion: string; color: string; speed: number; radius: number; visualRadius: number }>;

export function createEnemy(kind: EnemyKind, position: Point, velocity?: Point): Enemy {
  const headings = { straight: 0.21, orbit: -Math.PI / 2, zigzag: -0.45, boss: -2.6 };
  const speed = ENEMY_STYLES[kind].speed, angle = headings[kind];
  return { ...position, kind, vx: velocity?.x ?? Math.cos(angle) * speed, vy: velocity?.y ?? Math.sin(angle) * speed,
    radius: ENEMY_STYLES[kind].radius, visualRadius: ENEMY_STYLES[kind].visualRadius,
    previous: { ...position }, turnClock: 0, turnSign: 1, traceClock: 0, trace: [{ ...position }] };
}
export function defaultBoss(width: number, height: number) {
  return createEnemy('boss', { x: width / 2, y: height / 2 });
}
export function defaultEnemies(width: number, height: number, boss?: Enemy, random = Math.random, spawnArea?: { regions: Polygon[]; player: Point }) {
  const kinds = ['straight', 'orbit', 'zigzag'] as const;
  const placed: Enemy[] = [];
  const safe = (p: Point, r: number) => p.x >= r + 0.16 && p.x <= width - r - 0.16
    && p.y >= r + 0.16 && p.y <= height - r - 0.16
    && Math.hypot(p.x - (spawnArea?.player.x ?? width / 2), p.y - (spawnArea?.player.y ?? 0)) >= r + 0.34 + 3
    && (!spawnArea || spawnArea.regions.some(region => inside(p, region) && wallEdges(region).every(([a, b]) => distance(p, a, b) >= r + 0.16 - EPS)))
    && (!boss || Math.hypot(p.x - boss.x, p.y - boss.y) >= r + boss.visualRadius + 0.25)
    && placed.every(other => Math.hypot(p.x - other.x, p.y - other.y) >= r + other.visualRadius + 0.25 - EPS);
  for (const kind of kinds) {
    const offset = random() * Math.PI * 2, r = ENEMY_STYLES[kind].visualRadius, edge = r + 0.16;
    for (let copy = 0; copy < 3; copy++) {
      // Separate angular sectors prevent even a constant test RNG from giving
      // all three copies identical headings. Speed and motion rules stay intact.
      const angle = offset + copy * Math.PI * 2 / 3 + (random() - 0.5) * Math.PI / 3;
      let position: Point | undefined;
      for (let attempt = 0; attempt < 96; attempt++) {
        const p = { x: edge + random() * (width - edge * 2), y: edge + random() * (height - edge * 2) };
        if (safe(p, r)) { position = p; break; }
      }
      if (!position) {
        // Finite geometric fallback handles unlucky/repeating random samples.
        // This only selects spawn points; movement remains continuous.
        const cols = Math.max(1, Math.floor((width - edge * 2) / (r * 2 + 0.25)) + 1);
        const rows = Math.max(1, Math.floor((height - edge * 2) / (r * 2 + 0.25)) + 1);
        for (let i = 0; i < Math.min(2048, cols * rows); i++) {
          const p = { x: edge + (i % cols) * (width - edge * 2) / Math.max(1, cols - 1),
            y: edge + Math.floor(i / cols) * (height - edge * 2) / Math.max(1, rows - 1) };
          if (safe(p, r)) { position = p; break; }
        }
      }
      // An undersized custom arena may not hold all nine bodies. Leave out an
      // unplaceable enemy rather than overlap, clip or block startup forever.
      if (!position) continue;
      const speed = ENEMY_STYLES[kind].speed;
      const enemy = createEnemy(kind, position, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
      enemy.turnSign = random() < 0.5 ? -1 : 1;
      if (kind === 'zigzag') enemy.turnClock = random() * 0.72;
      placed.push(enemy);
    }
  }
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
  const region = regions.findIndex((polygon, i) => inside(enemy, polygon, walls[i]));
  if (region < 0) return;
  if (enemy.kind === 'orbit') rotate(enemy, seconds * 0.85 * enemy.turnSign);
  if (enemy.kind === 'zigzag') {
    enemy.turnClock += seconds;
    if (enemy.turnClock >= 0.72 - EPS) {
      enemy.turnClock -= 0.72;
      rotate(enemy, enemy.turnSign * Math.PI * 0.4); enemy.turnSign *= -1;
    }
  }
  const blocked = (p: Point) => !inside(p, regions[region], walls[region]) || walls[region].some(([a, b]) => distance(p, a, b) < enemy.radius);
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
