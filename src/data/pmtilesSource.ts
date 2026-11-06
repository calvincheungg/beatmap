import { PMTiles } from 'pmtiles';
import type { TileSource } from './tileSource';

export class PMTilesSource implements TileSource {
  private readonly archive: PMTiles;

  constructor(url: string) {
    this.archive = new PMTiles(url);
  }

  async getTile(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
    const result = await this.archive.getZxy(z, x, y);
    return result?.data ?? null;
  }
}
