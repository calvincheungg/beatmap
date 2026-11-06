import { classifyRings, type VectorTileLayer } from '@mapbox/vector-tile';
import { FlatBuilder } from './flatBuilder';
import { POLYGON, type TileScale } from './types';

/** The `landuse` kinds drawn as green space. */
const GREEN_KINDS = new Set([
  'park',
  'garden',
  'grass',
  'grassland',
  'wood',
  'forest',
  'scrub',
  'meadow',
  'dog_park',
  'playground',
  'recreation_ground',
  'golf_course',
  'cemetery',
  'nature_reserve',
  'village_green',
  'wetland',
]);

export function buildParks(layer: VectorTileLayer | undefined, scale: TileScale) {
  const builder = new FlatBuilder(scale);
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer!.feature(i);
    if (feature.type !== POLYGON || !GREEN_KINDS.has(String(feature.properties.kind))) continue;
    for (const polygon of classifyRings(feature.loadGeometry())) builder.addPolygon(polygon);
  }
  return builder.build();
}
