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
  'levels/1/v9/restored.webp': earlyFace(440, 16, 210, 250),
  'levels/2/v9/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 640, y: 40, width: 220, height: 280 },
  'levels/3/v8/restored.webp': earlyFace(330, 24, 220, 245),
  'levels/4/v9/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 480, y: 32, width: 188, height: 240 },
  'levels/5/v8/restored.webp': earlyFace(270, 8, 245, 255),
  'levels/6/v7/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 480, y: 0, width: 330, height: 320 },
  'levels/7/v3/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 515, y: 0, width: 295, height: 315 },
  'levels/8/v3/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 550, y: 14, width: 230, height: 258 },
  'levels/9/v3/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 630, y: 0, width: 205, height: 280 },
  'levels/10/v3/restored.webp': { imageWidth: 1536, imageHeight: 1024, x: 510, y: 0, width: 320, height: 270 },
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
