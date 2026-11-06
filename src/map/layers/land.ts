import { classifyRings, type VectorTileLayer } from '@mapbox/vector-tile';
import { FlatBuilder } from './flatBuilder';
import { POLYGON, type TileScale } from './types';

export function buildLand(layer: VectorTileLayer | undefined, scale: TileScale) {
  const builder = new FlatBuilder(scale);
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer!.feature(i);
    if (feature.type !== POLYGON) continue;
    for (const polygon of classifyRings(feature.loadGeometry())) builder.addPolygon(polygon);
  }
  return builder.build();
}
