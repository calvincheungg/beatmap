import { classifyRings, type VectorTileLayer } from '@mapbox/vector-tile';
import { theme } from '../../theme';
import { FlatBuilder } from './flatBuilder';
import { LINE, POLYGON, type TileScale } from './types';

/** `reef` is mapped in this layer but isn't open water. */
const EXCLUDED_KINDS = new Set(['reef']);

export function buildWater(layer: VectorTileLayer | undefined, scale: TileScale, lineScale: number) {
  const builder = new FlatBuilder(scale);
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer!.feature(i);
    const kind = String(feature.properties.kind);
    if (EXCLUDED_KINDS.has(kind)) continue;

    if (feature.type === POLYGON) {
      for (const polygon of classifyRings(feature.loadGeometry())) builder.addPolygon(polygon);
    } else if (feature.type === LINE) {
      const width = theme.waterLineWidths[kind];
      if (!width || feature.properties.is_tunnel === true) continue;
      for (const line of feature.loadGeometry()) builder.addRibbon(line, width * lineScale);
    }
  }
  return builder.build();
}
