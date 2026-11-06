import type { VectorTileLayer } from '@mapbox/vector-tile';
import { theme, type LodBand } from '../../theme';
import { FlatBuilder } from './flatBuilder';
import { LINE, type TileScale } from './types';

const MAJOR_KINDS = new Set(['major_road', 'medium_road']);

export function buildRoads(layer: VectorTileLayer | undefined, scale: TileScale, band: LodBand) {
  const highway = new FlatBuilder(scale);
  const major = new FlatBuilder(scale);
  const minor = new FlatBuilder(scale);

  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer!.feature(i);
    if (feature.type !== LINE) continue;
    // Width lookup excludes rail, ferries, runways and footpaths. Skipping tunnels
    // keeps the underground PATH network and buried roads off the street map.
    const kind = String(feature.properties.kind);
    const width = theme.roadWidths[kind];
    if (!width || feature.properties.is_tunnel === true) continue;

    const isHighway = kind === 'highway';
    const isMajor = MAJOR_KINDS.has(kind);
    if (!isHighway && !isMajor && !band.minorRoads) continue;
    const builder = isHighway ? highway : isMajor ? major : minor;
    for (const line of feature.loadGeometry()) builder.addRibbon(line, width * band.lineScale);
  }

  return { roadsHighway: highway.build(), roadsMajor: major.build(), roadsMinor: minor.build() };
}
