import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

// Samples lie inside distinctive monster features and visible gaps between
// limbs/props, rather than on the anti-aliased outline.
const samples: Record<number, { character: [number, number][]; background: [number, number][] }> = {
  1: { character: [[360, 10], [550, 395], [215, 385], [260, 250]], background: [[500, 450], [310, 260]] },
  // The old polygon omitted these dangling linen strips and trouser frays.
  2: { character: [[380, 30], [200, 410], [280, 370]], background: [[310, 300], [330, 280]] },
  3: { character: [[240, 28], [550, 450], [465, 495]], background: [[465, 510]] },
  4: { character: [[230, 24], [345, 20], [550, 420]], background: [[125, 365], [138, 380], [150, 490]] },
  5: { character: [[470, 210]], background: [[260, 465], [488, 238], [460, 254]] },
  // The sea beside the claw and the sky between ice spikes are not character.
  6: { character: [[239, 82], [230, 360]], background: [[175, 390], [225, 360], [465, 288]] },
  7: { character: [[400, 25], [130, 465]], background: [[485, 485]] },
  8: { character: [[270, 45], [565, 164], [80, 450]], background: [[480, 480], [565, 155]] },
  9: { character: [[460, 35], [180, 440]], background: [[530, 500], [519, 326], [200, 430]] },
  10: { character: [[260, 25]], background: [[525, 480]] },
};

describe('independent monster completion masks', () => {
  it.each(Object.entries(samples))('level %s covers its monster features and leaves background clear', async (level, points) => {
    const image = await sharp(`public/monster/${level}/mask.png`).greyscale().raw().toBuffer();
    const at = ([x, y]: [number, number]) => image[(y * 2) * 1536 + x * 2];
    for (const point of points.character) expect(at(point), `character at ${point}`).toBeGreaterThan(127);
    for (const point of points.background) expect(at(point), `background at ${point}`).toBeLessThan(128);
  });

  it.each(Object.keys(samples))('level %s seals the same character pixels that count for completion', async level => {
    const mask = await sharp(`public/monster/${level}/mask.png`).greyscale().raw().toBuffer();
    const sealed = await sharp(`public/monster/${level}/sealed.webp`).removeAlpha().raw().toBuffer();
    let covered = 0, hidden = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] > 127) {
      covered++;
      if (Math.max(sealed[i * 3], sealed[i * 3 + 1], sealed[i * 3 + 2]) < 75) hidden++;
    }
    expect(covered / mask.length).toBeGreaterThan(.2);
    expect(covered / mask.length).toBeLessThan(.65);
    expect(hidden / covered).toBeGreaterThan(.995);
  });
});
