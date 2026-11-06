import { PMTilesSource } from '../../data/pmtilesSource';
import type { TileSource } from '../../data/tileSource';
import { buildTile, transferablesOf } from '../layers/buildTile';
import type { TileBuffers } from '../layers/types';

export type WorkerRequest =
  | { type: 'init'; url: string }
  | { type: 'load'; id: number; z: number; x: number; y: number };

export type WorkerResponse =
  | { id: number; ok: true; buffers: TileBuffers | null }
  | { id: number; ok: false; error: string };

let source: TileSource | undefined;

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'init') {
    source = new PMTilesSource(data.url);
    return;
  }
  const { id, z, x, y } = data;
  try {
    if (!source) throw new Error('Tile worker used before init');
    const bytes = await source.getTile(z, x, y);
    const buffers = bytes ? buildTile(bytes, z) : null;
    const response: WorkerResponse = { id, ok: true, buffers };
    self.postMessage(response, { transfer: buffers ? transferablesOf(buffers) : [] });
  } catch (error) {
    const response: WorkerResponse = { id, ok: false, error: String(error) };
    self.postMessage(response);
  }
};
