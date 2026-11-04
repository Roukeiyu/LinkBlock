import type { Direction } from './engine';

const vectors: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 },
};

export class DragJoystick {
  vector = { x: 0, y: 0 };
  direction: Direction | undefined;
  private previous: { x: number; y: number } | undefined;
  private pending = { x: 0, y: 0 };

  reset() { this.vector = { x: 0, y: 0 }; this.direction = undefined; this.previous = undefined; this.pending = { x: 0, y: 0 }; }
  start(x: number, y: number) {
    this.reset(); if (Number.isFinite(x) && Number.isFinite(y)) this.previous = { x, y };
  }
  move(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { this.reset(); return false; }
    if (!this.previous) { this.start(x, y); return false; }
    this.vector = { x: x - this.previous.x, y: y - this.previous.y }; this.previous = { x, y };
    this.pending.x += this.vector.x; this.pending.y += this.vector.y;
    const dx = this.pending.x, dy = this.pending.y;
    // Accumulate slow intentional movement; stationary samples and small
    // back-and-forth jitter never cancel or redirect a held gesture.
    if (Math.hypot(dx, dy) < 3) return false;
    this.pending = { x: 0, y: 0 };
    const candidate: Direction = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    const previous = this.direction && vectors[this.direction], next = vectors[candidate];
    const previousAmount = previous ? dx * previous.x + dy * previous.y : 0;
    const nextAmount = dx * next.x + dy * next.y;
    if (!previous || candidate === this.direction || previousAmount <= 0 || nextAmount >= previousAmount * 1.2) this.direction = candidate;
    return true;
  }
}
