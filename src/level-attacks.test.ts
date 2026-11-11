import { describe, expect, it } from 'vitest';
import { LevelAttack, type AttackPattern } from './level-attacks';
import { Projectile, type AttackContext } from './attacks';

const patterns: AttackPattern[] = ['sand', 'storm', 'rose', 'hunt'];
function setup(pattern: AttackPattern, stage = 0) {
  const attack = new LevelAttack(pattern, stage), shots: Projectile[] = [];
  const context: AttackContext = { origin: { x: 36, y: 24 }, target: { x: 60, y: 24 },
    arena: { width: 72, height: 48 }, spawn(h) { shots.push(h as Projectile); return true; }, cast() {} };
  return { attack, shots, context };
}
describe('distinct telegraphed boss attacks', () => {
  it.each(patterns)('%s locks its warning and emits exactly those directions at every stage', pattern => {
    for (let stage = 0; stage < 3; stage++) {
      const { attack, shots, context } = setup(pattern, stage);
      attack.update(attack.interval - attack.warningSeconds / 2, context);
      expect(attack.warning).toBeCloseTo(0.5); expect(shots).toHaveLength(0);
      const angles = [...attack.warningAngles]; expect(angles.length).toBeGreaterThan(0);
      // Moving after the warning must not cause an unannounced aimed shot.
      attack.update(attack.warningSeconds / 2 + 0.001, { ...context, target: { x: 0, y: 0 } });
      expect(shots).toHaveLength(angles.length);
      angles.forEach((angle, i) => {
        expect(shots[i].velocity.x).toBeCloseTo(Math.cos(angle) * attack.speed);
        expect(shots[i].velocity.y).toBeCloseTo(Math.sin(angle) * attack.speed);
      });
      expect(attack.warning).toBe(0);
    }
  });
  it('aims the sand fan at the player and leaves a central escape lane between rose wings', () => {
    for (const pattern of ['sand', 'rose'] as const) {
      const { attack, context } = setup(pattern, 2);
      attack.update(attack.interval - 0.5, context);
      if (pattern === 'sand') expect(attack.warningAngles).toContain(0);
      else expect(attack.warningAngles.every(angle => Math.abs(angle) >= 0.4)).toBe(true);
      expect(attack.warningAngles.some(angle => angle < 0)).toBe(true);
      expect(attack.warningAngles.some(angle => angle > 0)).toBe(true);
    }
  });
  it.each(['storm', 'hunt'] as const)('%s rotates between volleys, without moving the current warning', pattern => {
    const { attack, context } = setup(pattern);
    attack.update(attack.interval - 0.4, context);
    const first = [...attack.warningAngles];
    attack.update(0.2, context); expect(attack.warningAngles).toEqual(first);
    attack.update(attack.interval, context);
    expect(attack.warningAngles).not.toEqual(first);
    if (pattern === 'hunt') {
      const angles = attack.warningAngles.map(a => (a + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
      const gaps = angles.map((a, i) => (angles[(i + 1) % angles.length] - a + Math.PI * 2) % (Math.PI * 2));
      expect(Math.max(...gaps)).toBeCloseTo(Math.PI * 2 / 3);
    }
  });
  it.each(patterns)('%s keeps volley order across frame sizes and starts fresh', pattern => {
    const big = setup(pattern), small = setup(pattern);
    big.attack.update(20, big.context);
    for (let i = 0; i < 1200; i++) small.attack.update(1 / 60, small.context);
    expect(big.shots.map(s => s.velocity)).toEqual(small.shots.map(s => s.velocity));
    expect(setup(pattern).attack.warningAngles).toEqual([]);
    expect(new LevelAttack(pattern, 2).interval).toBeLessThan(big.attack.interval);
  });
});
