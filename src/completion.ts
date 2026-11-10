import { inside, wallEdges, type Polygon } from './geometry';

/** Character pixels are 60% of completion; everything else is 40%. */
export const CHARACTER_WEIGHT = 0.6;
export const EMPTY_WEIGHT = 0.4;
/** Soft mask edges must not block the "character captured" state. */
export const CHARACTER_COMPLETE = 0.95;
/** Line drawing and shore movement while the character stays fully captured. */
export const LINE_SPEED_BOOST = 1.2;

export interface CompletionMask {
  width: number;
  height: number;
  /** 1 = character sample. Hard threshold is coverage above 1/2. */
  character: Uint8Array;
}

export interface CompletionReading {
  totalChar: number;
  capturedChar: number;
  totalEmpty: number;
  capturedEmpty: number;
  /** 0–100 weighted completion. */
  percent: number;
  characterComplete: boolean;
}

export function weightedPercent(capturedChar: number, totalChar: number, capturedEmpty: number, totalEmpty: number) {
  const charRatio = totalChar > 0 ? capturedChar / totalChar : 0;
  const emptyRatio = totalEmpty > 0 ? capturedEmpty / totalEmpty : 0;
  return (CHARACTER_WEIGHT * charRatio + EMPTY_WEIGHT * emptyRatio) * 100;
}

/** Sample centers of a mask. A point is captured when it lies in no remaining danger polygon. */
export function measureCompletion(mask: CompletionMask, boardWidth: number, boardHeight: number, territories: Polygon[]): CompletionReading {
  const bounds = territories.map(region => wallEdges(region));
  let totalChar = 0, capturedChar = 0, totalEmpty = 0, capturedEmpty = 0;
  for (let i = 0; i < mask.character.length; i++) {
    const x = (i % mask.width + 0.5) / mask.width * boardWidth;
    const y = (Math.floor(i / mask.width) + 0.5) / mask.height * boardHeight;
    const point = { x, y };
    let captured = true;
    for (let t = 0; t < territories.length; t++) if (inside(point, territories[t], bounds[t])) { captured = false; break; }
    if (mask.character[i]) {
      totalChar++;
      if (captured) capturedChar++;
    } else {
      totalEmpty++;
      if (captured) capturedEmpty++;
    }
  }
  const charRatio = totalChar > 0 ? capturedChar / totalChar : 0;
  return {
    totalChar, capturedChar, totalEmpty, capturedEmpty,
    percent: weightedPercent(capturedChar, totalChar, capturedEmpty, totalEmpty),
    characterComplete: charRatio + 1e-9 >= CHARACTER_COMPLETE,
  };
}

/** Build a mask from RGBA pixels. L-mode masks store coverage in luminance; alpha must also be above half. */
export function maskFromPixels(width: number, height: number, rgba: Uint8ClampedArray, stride = 4): CompletionMask {
  const sw = Math.ceil(width / stride), sh = Math.ceil(height / stride);
  const character = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(height - 1, y * stride + (stride >> 1));
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(width - 1, x * stride + (stride >> 1));
      const i = (sy * width + sx) * 4;
      const coverage = Math.max(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3] < 255 ? rgba[i + 3] : 0);
      character[y * sw + x] = rgba[i + 3] > 127 && coverage > 127 ? 1 : 0;
    }
  }
  return { width: sw, height: sh, character };
}
