import { describe, expect, it } from 'vitest';
import { enemyCelebration, lakeTheme } from './effects';
import { ENEMY_STYLES, type EnemyKind } from './enemies';

function recorder() {
  const operations: { name: string; args: unknown[] }[] = [];
  const properties: Record<string, unknown> = {};
  const ctx = new Proxy(properties, {
    set(target, key, value) { target[String(key)] = value; operations.push({ name: String(key), args: [value] }); return true; },
    get(target, key) { return key in target ? target[String(key)] : (...args: unknown[]) => operations.push({ name: String(key), args }); },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, operations };
}

describe('replaceable enemy defeat celebration', () => {
  it.each(['straight', 'orbit', 'zigzag', 'boss'] as EnemyKind[])('uses the %s enemy color, position and score with bounded fireworks', kind => {
    const enemy = { kind, x: 12.25, y: 17.75, points: kind === 'boss' ? 2000 : 500 };
    const original = { ...enemy };
    const effect = lakeTheme.createDefeatEffect!(enemy, false);
    enemy.x = 80; enemy.y = 80;
    effect.update(0.2); const { ctx, operations } = recorder(); effect.render(ctx);
    expect(operations).toContainEqual({ name: 'translate', args: [original.x, original.y] });
    expect(operations).toContainEqual({ name: 'strokeStyle', args: [ENEMY_STYLES[kind].color] });
    expect(operations.some(op => op.name === 'fillText' && op.args[0] === `+${enemy.points}`)).toBe(true);
    const sparks = operations.filter(op => op.name === 'lineTo');
    expect(sparks.length).toBeGreaterThan(0); expect(sparks.length).toBeLessThanOrEqual(64);
    effect.update(2); expect(effect.finished).toBe(true);
    const ended = recorder(); effect.render(ended.ctx); expect(ended.operations).toHaveLength(0);
  });
  it('uses a stationary fading cue instead of moving sparks in reduced motion', () => {
    const effect = enemyCelebration({ kind: 'orbit', x: 12, y: 8, points: 500 }, true);
    const a = recorder(); effect.render(a.ctx); effect.update(0.2);
    const b = recorder(); effect.render(b.ctx);
    expect(a.operations.filter(op => op.name === 'lineTo')).toHaveLength(0);
    expect(b.operations.filter(op => op.name === 'lineTo')).toHaveLength(0);
    expect(a.operations.find(op => op.name === 'arc')?.args).toEqual(b.operations.find(op => op.name === 'arc')?.args);
    effect.update(0.3); expect(effect.finished).toBe(true);
  });
});
