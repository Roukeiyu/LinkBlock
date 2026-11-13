import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

// Samples lie inside distinctive monster features and visible gaps between
// limbs/props, rather than on the anti-aliased outline.
const samples: Record<number, { character: [number, number][]; background: [number, number][] }> = {
  1: { character: [[360, 10], [550, 395]], background: [[500, 450]] },
  2: { character: [[380, 30], [200, 410]], background: [[280, 370]] },
  3: { character: [[240, 28], [550, 450]], background: [[465, 495]] },
  4: { character: [[230, 24], [345, 20]], background: [[125, 365]] },
  5: { character: [[470, 210]], background: [[260, 465]] },
  6: { character: [[239, 82], [225, 360]], background: [[175, 390]] },
  7: { character: [[400, 25], [130, 465]], background: [[485, 485]] },
  8: { character: [[270, 45], [565, 155], [80, 450]], background: [[480, 480]] },
  9: { character: [[460, 35], [180, 440]], background: [[530, 500]] },
  10: { character: [[260, 25]], background: [[510, 480]] },
};

describe('independent monster completion masks', () => {
  it.each(Object.entries(samples))('level %s covers its monster features and leaves background clear', async (level, points) => {
    const image = await sharp(`public/monster/${level}/mask.png`).greyscale().raw().toBuffer();
    const at = ([x, y]: [number, number]) => image[(y * 2) * 1536 + x * 2];
    for (const point of points.character) expect(at(point), `character at ${point}`).toBeGreaterThan(127);
    for (const point of points.background) expect(at(point), `background at ${point}`).toBeLessThan(128);
  });
});
