import { readFileSync } from 'node:fs';

/** Read the canvas header without requiring image tools during normal builds. */
export function imageDimensions(file) {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    for (let at = 12; at + 8 <= bytes.length;) {
      const kind = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4), data = at + 8;
      if (data + size > bytes.length) break;
      if (kind === 'VP8X') return { width: 1 + bytes.readUIntLE(data + 4, 3), height: 1 + bytes.readUIntLE(data + 7, 3) };
      if (kind === 'VP8 ') return { width: bytes.readUInt16LE(data + 6) & 0x3fff, height: bytes.readUInt16LE(data + 8) & 0x3fff };
      if (kind === 'VP8L') {
        const bits = bytes.readUInt32LE(data + 1);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
      }
      at = data + size + (size % 2);
    }
  }
  throw new Error(`Unsupported or invalid artwork: ${file}`);
}
