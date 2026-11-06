import { theme, type LodBand } from '../../theme';

/** The band shown at a view height. */
export function selectBand(viewHeight: number): LodBand {
  return theme.lodBands.find((band) => viewHeight <= band.maxViewHeight) ?? theme.lodBands.at(-1)!;
}

/** The band that loads tiles of a given zoom. */
export function selectBandForZoom(tileZoom: number): LodBand {
  return theme.lodBands.find((band) => band.tileZoom === tileZoom) ?? theme.lodBands[0]!;
}
