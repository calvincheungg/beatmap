/** Converts 0xRRGGBB (sRGB) to linear RGB, the space vertex colours are stored in. */
export function hexToLinear(hex: number): [number, number, number] {
  return [toLinear((hex >> 16) & 255), toLinear((hex >> 8) & 255), toLinear(hex & 255)];
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
