/** Manually extracted and visually checked against each original restored plate.
 * Pixel bounds include the whole head (ears/horns/pumpkin included) and chin.
 * Keep the source path and dimensions here so new artwork cannot inherit another face.
 */
// Early plates keep their scene coordinates and scale uniformly from 1152 × 768.
const earlyFace = (x: number, y: number, width: number, height: number) => ({
  imageWidth: 1536, imageHeight: 1024,
  x: x * 4 / 3, y: y * 4 / 3, width: width * 4 / 3, height: height * 4 / 3,
});
export const FACE_REGIONS = {
  'levels/1/v10/restored.webp': earlyFace(440, 16, 210, 250),
  'levels/2/v11/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 690, y: 20, width: 180, height: 250 },
  'levels/3/v8/restored.webp': earlyFace(330, 24, 220, 245),
  'levels/4/v9/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 480, y: 32, width: 188, height: 240 },
  'levels/5/v8/restored.webp': earlyFace(270, 8, 245, 255),
  'levels/6/v7/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 480, y: 0, width: 330, height: 320 },
  'levels/7/v11/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 560, y: 0, width: 300, height: 310 },
  'levels/8/v3/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 550, y: 14, width: 230, height: 258 },
  'levels/9/v3/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 630, y: 0, width: 205, height: 280 },
  'levels/10/v3/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 510, y: 0, width: 320, height: 270 },
  'levels/11/v6/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 730, y: 125, width: 290, height: 300 },
  'levels/12/v3/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 360, y: 95, width: 340, height: 310 },
  'levels/13/v4/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 570, y: 10, width: 250, height: 290 },
  'levels/14/v8/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 960, y: 10, width: 240, height: 300 },
  'levels/15/v4/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 790, y: 25, width: 210, height: 270 },
  'levels/16/v6/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 800, y: 15, width: 310, height: 320 },
  'levels/17/v5/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 875, y: 50, width: 235, height: 265 },
  'levels/18/v6/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 740, y: 5, width: 200, height: 245 },
  'levels/19/v5/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 600, y: 35, width: 325, height: 320 },
  'levels/20/v9/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 780, y: 25, width: 180, height: 245 },
} as const;

export type FaceArtwork = keyof typeof FACE_REGIONS;
export const FACE_PROTECTION_SCALE = 1.1;

export function faceProtection(artwork: FaceArtwork) {
  const face = FACE_REGIONS[artwork];
  // Use the larger face dimension, with only 5% padding on each side. Shift at the
  // image edges rather than clipping, so the protected region stays square.
  const size = Math.ceil(Math.max(face.width, face.height) * FACE_PROTECTION_SCALE);
  const x = Math.max(0, Math.min(face.imageWidth - size, face.x + (face.width - size) / 2));
  const y = Math.max(0, Math.min(face.imageHeight - size, face.y + (face.height - size) / 2));
  return { left: x / face.imageWidth, top: y / face.imageHeight,
    right: (x + size) / face.imageWidth, bottom: (y + size) / face.imageHeight };
}

/** Head bounds for the matching monster illustrations, including horns and ears. */
const MONSTER_HEADS = [
  [560, 0, 320, 340], [660, 10, 220, 280], [440, 0, 250, 290],
  [420, 0, 310, 260], [340, 0, 320, 280], [450, 0, 350, 330],
  [520, 0, 320, 320], [480, 0, 330, 300], [570, 0, 300, 300], [475, 0, 380, 300],
  [740, 70, 280, 300], [280, 90, 500, 340], [500, 0, 360, 320], [850, 110, 360, 310], [780, 15, 230, 290],
  [800, 0, 360, 340], [980, 0, 280, 300], [740, 20, 230, 290], [500, 10, 380, 340], [450, 20, 300, 340],
] as const;
export function monsterFaceProtection(level: number) {
  const [x, y, width, height] = MONSTER_HEADS[level - 1];
  return { left: x / 1536, top: y / 1024, right: (x + width) / 1536, bottom: (y + height) / 1024 };
}
