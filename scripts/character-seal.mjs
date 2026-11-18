/** Match the game's dark background and blend the character ink at the matte's actual coverage. */
export function makeCharacterSeal(rgb, coverage) {
  const sealed = Buffer.alloc(rgb.length);
  const ink = [32, 32, 44];
  for (let i = 0; i < coverage.length; i++) {
    const offset = i * 3;
    const luminance = Math.round(rgb[offset] * .299 + rgb[offset + 1] * .587 + rgb[offset + 2] * .114);
    const opacity = coverage[i] / 255;
    for (let c = 0; c < 3; c++) {
      const background = Math.floor(Math.floor(luminance * .75 + rgb[offset + c] * .25) * .52);
      sealed[offset + c] = Math.round(background * (1 - opacity) + ink[c] * opacity);
    }
  }
  return sealed;
}
