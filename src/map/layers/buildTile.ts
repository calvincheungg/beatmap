import { classifyRings, VectorTile, type VectorTileLayer } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { tileSizeInScene } from '../projection';
import { buildBuildings, type BuildingInput } from './buildings';
import { buildLand } from './land';
import { buildParks } from './parks';
import { buildRoads } from './roads';
import { POLYGON, type LayerBuffers, type TileBuffers, type TileScale } from './types';
import { buildWater } from './water';

/** Decodes a vector tile and builds the merged geometry for every layer. */
export function buildTile(bytes: ArrayBuffer, z: number): TileBuffers {
  const tile = new VectorTile(new PbfReader(new Uint8Array(bytes)));
  const extent = tile.layers.earth?.extent ?? tile.layers.water?.extent ?? 4096;
  const scale: TileScale = { extent, unitsToScene: tileSizeInScene(z) / extent };

  return {
    land: buildLand(tile.layers.earth, scale),
    water: buildWater(tile.layers.water, scale),
    park: buildParks(tile.layers.landuse, scale),
    ...buildRoads(tile.layers.roads, scale),
    ...buildBuildings(readBuildings(tile.layers.buildings), scale),
  };
}

function readBuildings(layer: VectorTileLayer | undefined): BuildingInput[] {
  const inputs: BuildingInput[] = [];
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer!.feature(i);
    // This layer also holds address points.
    if (feature.type !== POLYGON) continue;
    const { height, min_height: minHeight } = feature.properties;
    for (const rings of classifyRings(feature.loadGeometry())) {
      inputs.push({
        rings,
        height: typeof height === 'number' ? height : undefined,
        minHeight: typeof minHeight === 'number' ? minHeight : undefined,
      });
    }
  }
  return inputs;
}

/** The typed arrays to hand to postMessage, so they move rather than copy. */
export function transferablesOf(buffers: TileBuffers): ArrayBuffer[] {
  const transfers: ArrayBuffer[] = [];
  for (const layer of Object.values(buffers) as (LayerBuffers | undefined)[]) {
    if (!layer) continue;
    for (const array of [layer.position, layer.index, layer.normal, layer.color]) {
      if (array) transfers.push(array.buffer as ArrayBuffer);
    }
  }
  return transfers;
}
