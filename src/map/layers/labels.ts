import type { VectorTileLayer } from '@mapbox/vector-tile';
import type { LodBand } from '../../theme';
import type { TileLabel, TileScale } from './types';

const POINT = 1;
const NEIGHBOURHOOD_KINDS = new Set(['neighbourhood', 'macrohood']);

/** Reads place names from the `places` layer. Bigger places get a lower priority number and draw first. */
export function readLabels(layer: VectorTileLayer | undefined, scale: TileScale, band: LodBand): TileLabel[] {
  const labels: TileLabel[] = [];
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer!.feature(i);
    const { kind, name, population_rank: rank } = feature.properties;
    if (feature.type !== POINT || typeof name !== 'string') continue;

    const isLocality = kind === 'locality';
    const isNeighbourhood = typeof kind === 'string' && NEIGHBOURHOOD_KINDS.has(kind);
    if (!isLocality && !(band.labels === 'neighbourhood' && isNeighbourhood)) continue;

    const point = feature.loadGeometry()[0]?.[0];
    if (!point || point.x < 0 || point.y < 0 || point.x >= scale.extent || point.y >= scale.extent) continue;

    labels.push({
      name,
      x: point.x * scale.unitsToScene,
      z: point.y * scale.unitsToScene,
      priority: (isLocality ? 0 : 100) - (typeof rank === 'number' ? rank : 0),
      isLocality,
    });
  }
  return labels;
}
