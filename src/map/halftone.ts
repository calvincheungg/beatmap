import { theme } from '../theme';

/** RGBA pixels for one repeating tile of printed dots: a dot on a solid base colour. */
export function halftonePixels(baseColor: number, size = theme.halftone.tileSize): Uint8Array {
  const { radius, dotColor, dotOpacity } = theme.halftone;
  const pixels = new Uint8Array(size * size * 4);
  const dotRadius = radius * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      // A one pixel soft edge keeps the dots from looking jagged.
      const coverage = Math.min(Math.max(dotRadius - distance + 0.5, 0), 1) * dotOpacity;
      const offset = (y * size + x) * 4;
      for (const [channel, shift] of [[0, 16], [1, 8], [2, 0]] as const) {
        const base = (baseColor >> shift) & 255;
        const dot = (dotColor >> shift) & 255;
        pixels[offset + channel] = Math.round(base + (dot - base) * coverage);
      }
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
