import { distance, EPS, inside, type Point, type Polygon } from './geometry';

export type EnemyKind = 'straight' | 'orbit' | 'zigzag' | 'boss';
export interface DefeatedEnemy extends Point { kind: EnemyKind; points: number }
export const DEFEAT_POINTS: Record<EnemyKind, number> = { straight: 500, orbit: 500, zigzag: 500, boss: 2000 };
export interface Enemy extends Point {
  kind: EnemyKind;
  vx: number;
  vy: number;
  radius: number;
  previous: Point;
  turnClock: number;
  turnSign: number;
  traceClock: number;
  trace: Point[];
}
export const ENEMY_STYLES = {
  straight: { name: '疾行', motion: '快速直线', color: '#ff727d', speed: 14.3 },
  orbit: { name: '环游', motion: '缓速环绕', color: '#bda4ff', speed: 5.2 },
  zigzag: { name: '折光', motion: '折线巡游', color: '#72cfff', speed: 9 },
  boss: { name: '湖心守卫', motion: '缓慢移动', color: '#ffa56e', speed: 2.3 },
} satisfies Record<EnemyKind, { name: string; motion: string; color: string; speed: number }>;

export function createEnemy(kind: EnemyKind, position: Point, velocity?: Point): Enemy {
  const headings = { straight: 0.21, orbit: -Math.PI / 2, zigzag: -0.45, boss: -2.6 };
  const speed = ENEMY_STYLES[kind].speed, angle = headings[kind];
  return { ...position, kind, vx: velocity?.x ?? Math.cos(angle) * speed, vy: velocity?.y ?? Math.sin(angle) * speed,
    radius: kind === 'boss' ? 1.05 : 0.55, previous: { ...position }, turnClock: 0, turnSign: 1, traceClock: 0, trace: [{ ...position }] };
}
export function defaultEnemies(width: number, height: number) {
  return [createEnemy('straight', { x: width * 0.68, y: height * 0.25 }),
    createEnemy('orbit', { x: width * 0.78, y: height * 0.51 }),
    createEnemy('zigzag', { x: width * 0.70, y: height * 0.76 })];
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
