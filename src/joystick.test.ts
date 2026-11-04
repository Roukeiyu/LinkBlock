import { describe, expect, it } from 'vitest';
import { DragJoystick } from './joystick';

describe('joystick direction from local finger displacement', () => {
  it('turns from each displacement without returning to the joystick center', () => {
    const stick = new DragJoystick(); stick.start(100, 100);
    stick.move(145, 100); expect(stick.direction).toBe('right');
    stick.move(145, 80); expect(stick.direction).toBe('up'); expect(stick.vector).toEqual({ x: 0, y: -20 });
    stick.move(135, 80); expect(stick.direction).toBe('left');
    stick.move(135, 90); expect(stick.direction).toBe('down');
  });
  it('does not move merely because a press begins off center', () => {
    const stick = new DragJoystick(); stick.start(260, 80);
    expect(stick.direction).toBeUndefined(); expect(stick.vector).toEqual({ x: 0, y: 0 });
    expect(stick.move(260, 80)).toBe(false); expect(stick.direction).toBeUndefined();
  });
  it('preserves the last direction while stationary and ignores small back-and-forth jitter', () => {
    const stick = new DragJoystick(); stick.start(0, 0); stick.move(30, 0);
    for (const [x, y] of [[30, 0], [30.5, 0.5], [29.5, -0.5], [30, 0]]) {
      expect(stick.move(x, y)).toBe(false); expect(stick.direction).toBe('right');
    }
  });
  it('accumulates slow intentional displacement instead of discarding every small event', () => {
    const stick = new DragJoystick(); stick.start(0, 0); stick.move(30, 0);
    expect(stick.move(29, 0)).toBe(false); expect(stick.move(28, 0)).toBe(false);
    expect(stick.move(27, 0)).toBe(true); expect(stick.direction).toBe('left');
  });
  it('resists diagonal jitter but changes when the new displacement clearly turns', () => {
    const stick = new DragJoystick(); stick.start(0, 0); let x = 40, y = 0; stick.move(x, y);
    for (const [dx, dy] of [[30, 31], [32, 30], [30, 33]]) { x += dx; y += dy; stick.move(x, y); expect(stick.direction).toBe('right'); }
    x += 10; y += 40; stick.move(x, y); expect(stick.direction).toBe('down');
    y -= 20; stick.move(x, y); expect(stick.direction).toBe('up');
  });
  it('gives the same cardinal turns for coarse and finely sampled swipes', () => {
    const a = new DragJoystick(), b = new DragJoystick(); a.start(0, 0); b.start(0, 0);
    a.move(40, 0); for (let x = 1; x <= 40; x++) b.move(x, 0); expect(b.direction).toBe(a.direction);
    a.move(40, -40); for (let y = -1; y >= -40; y--) b.move(40, y); expect(b.direction).toBe(a.direction);
  });
  it('resets both the previous touch point and direction for each new owner gesture', () => {
    const stick = new DragJoystick(); stick.start(0, 0); stick.move(-40, 0); stick.start(150, 50);
    expect(stick.direction).toBeUndefined(); expect(stick.move(150, 50)).toBe(false);
    stick.move(150, 40); expect(stick.direction).toBe('up'); expect(stick.vector).toEqual({ x: 0, y: -10 });
    stick.reset(); expect(stick.direction).toBeUndefined(); expect(stick.vector).toEqual({ x: 0, y: 0 });
  });
  it('rejects invalid input without leaving a held direction', () => {
    const stick = new DragJoystick(); stick.start(0, 0); stick.move(40, 0);
    expect(stick.move(Infinity, 2)).toBe(false); expect(stick.direction).toBeUndefined();
    expect(stick.vector).toEqual({ x: 0, y: 0 }); expect(stick.move(80, 0)).toBe(false);
  });
});
