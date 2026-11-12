/** Manually extracted and visually checked against each original restored plate.
 * Pixel bounds include the whole head (ears/horns/pumpkin included) and chin.
 * Keep the source path and dimensions here so new artwork cannot inherit another face.
 */
export const FACE_REGIONS = {
  'wolf-restored.webp': { imageWidth: 1152, imageHeight: 768, x: 440, y: 16, width: 210, height: 250 },
  'levels/2/mummy-restored.webp': { imageWidth: 1152, imageHeight: 768, x: 472, y: 22, width: 190, height: 236 },
  'levels/3/frankenstein-restored.webp': { imageWidth: 1152, imageHeight: 768, x: 330, y: 24, width: 220, height: 245 },
  'levels/4/vampire-restored.webp': { imageWidth: 1152, imageHeight: 768, x: 350, y: 26, width: 220, height: 245 },
  'levels/5/horseman-restored.webp': { imageWidth: 1152, imageHeight: 768, x: 270, y: 8, width: 245, height: 255 },
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
