/**
 * Where tiles come from. Anything that returns Mapbox Vector Tile bytes in the
 * Protomaps schema can replace PMTilesSource without touching the rest of the app.
 */
export interface TileSource {
  /** Resolves to the raw, decompressed tile, or null if the archive has no such tile. */
  getTile(z: number, x: number, y: number): Promise<ArrayBuffer | null>;
}
