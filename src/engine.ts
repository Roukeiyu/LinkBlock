export type Direction = 'up' | 'down' | 'left' | 'right';
export type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export type GameEvent = 'start' | 'capture' | 'hit' | 'won' | 'lost';
export interface Point { x: number; y: number }
export interface Enemy extends Point { vx: number; vy: number }
export const EMPTY = 0, SAFE = 1, TRAIL = 2;
const vectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

export class Game {
  readonly width: number;
  readonly height: number;
  readonly target = 75;
  cells: Uint8Array;
  player: Point;
  anchor: Point;
  enemy: Enemy;
  trail: number[] = [];
  phase: Phase = 'ready';
  lives = 3;
  score = 0;
  elapsed = 0;
  protection = 0;
  events: GameEvent[] = [];

  constructor(width = 72, height = 48) {
    if (width < 6 || height < 6) throw new Error('Board must be at least 6 × 6');
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
    this.player = { x: Math.floor(width / 2), y: 0 };
    this.anchor = { ...this.player };
    this.enemy = { x: width * 0.68 + 0.5, y: height * 0.57 + 0.5, vx: 7.4, vy: 5.2 };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) this.cells[this.index(x, y)] = SAFE;
      }
    }
  }

  index(x: number, y: number) { return y * this.width + x; }
  cell(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return SAFE;
    return this.cells[this.index(x, y)];
  }
  get claimed() {
    let safe = 0;
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) if (this.cell(x, y) === SAFE) safe++;
    }
    return safe;
  }
  get percent() { return this.claimed / ((this.width - 2) * (this.height - 2)) * 100; }

  start() {
    if (this.phase !== 'ready') return;
    this.phase = 'playing';
    this.events.push('start');
  }
  togglePause() {
    if (this.phase === 'playing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'playing';
  }

  move(direction: Direction, drawing: boolean) {
    if (this.phase !== 'playing') return;
    const delta = vectors[direction];
    const next = { x: this.player.x + delta.x, y: this.player.y + delta.y };
    if (next.x < 0 || next.y < 0 || next.x >= this.width || next.y >= this.height) return;
    const cell = this.cell(next.x, next.y);
    if (cell === TRAIL) return;
    // Releasing the draw key holds position in the danger zone; enemies keep moving.
    if (this.trail.length && !drawing) return;
    if (cell === EMPTY) {
      if (!drawing) return;
      // Respawn grace is spent on safe ground; it must not allow an immune
      // trail to close through the enemy and leave it trapped inside a wall.
      if (this.protection > 0) return;
      if (!this.trail.length) this.anchor = { ...this.player };
      this.cells[this.index(next.x, next.y)] = TRAIL;
      this.trail.push(this.index(next.x, next.y));
    }
    this.player = next;
    // Check before capture: a line cannot safely close through the enemy.
    if (this.collidesWithTrail()) { this.hit(); return; }
    if (cell === SAFE && this.trail.length) this.capture();
  }

  private capture() {
    const before = this.claimed;
    const lineLength = this.trail.length;
    for (const cell of this.trail) this.cells[cell] = SAFE;
    this.trail = [];
    // Flood from the enemy, preserving its connected component. All other
    // empty components are enclosed territory, regardless of polygon shape.
    const reachable = new Uint8Array(this.cells.length);
    const queue = [this.index(Math.floor(this.enemy.x), Math.floor(this.enemy.y))];
    reachable[queue[0]] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const pos = queue[cursor], x = pos % this.width, y = Math.floor(pos / this.width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
        const idx = this.index(nx, ny);
        if (!reachable[idx] && this.cells[idx] === EMPTY) {
          reachable[idx] = 1;
          queue.push(idx);
        }
      }
    }
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === EMPTY && !reachable[i]) this.cells[i] = SAFE;
    }
    this.anchor = { ...this.player };
    this.score += (this.claimed - before) * 10 + lineLength * 5;
    this.events.push('capture');
    if (this.percent >= this.target) {
      this.phase = 'won';
      this.score += this.lives * 1000;
      this.events.push('won');
    }
  }

  private collidesWithTrail() {
    if (!this.trail.length || this.protection > 0) return false;
    // The enemy occupies a radius, so grazing a live line also counts.
    for (const pos of this.trail) {
      const x = pos % this.width + 0.5, y = Math.floor(pos / this.width) + 0.5;
      if (Math.abs(this.enemy.x - x) < 0.88 && Math.abs(this.enemy.y - y) < 0.88) return true;
    }
    return false;
  }

  private hit() {
    for (const pos of this.trail) this.cells[pos] = EMPTY;
    this.trail = [];
    this.player = { ...this.anchor };
    this.lives--;
    this.protection = 1.5;
    this.events.push('hit');
    if (this.lives <= 0) { this.phase = 'lost'; this.events.push('lost'); }
  }

  update(seconds: number) {
    if (this.phase !== 'playing') return;
    this.elapsed += seconds;
    this.protection = Math.max(0, this.protection - seconds);
    // Substeps prevent tunnelling through one-cell walls or live trails.
    const steps = Math.max(1, Math.ceil(seconds * Math.max(Math.abs(this.enemy.vx), Math.abs(this.enemy.vy)) / 0.15));
    const dt = seconds / steps;
    for (let i = 0; i < steps && this.phase === 'playing'; i++) {
      const enemy = this.enemy;
      const blocked = (x: number, y: number) => {
        const r = 0.28;
        return [[-r, -r], [r, -r], [-r, r], [r, r]]
          .some(([dx, dy]) => this.cell(Math.floor(x + dx), Math.floor(y + dy)) === SAFE);
      };
      const nx = enemy.x + enemy.vx * dt;
      if (blocked(nx, enemy.y)) enemy.vx *= -1;
      else enemy.x = nx;
      const ny = enemy.y + enemy.vy * dt;
      if (blocked(enemy.x, ny)) enemy.vy *= -1;
      else enemy.y = ny;
      if (this.collidesWithTrail()) this.hit();
    }
  }
}
