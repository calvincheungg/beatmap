import { beforeAll, describe, expect, it } from 'vitest';
import { buildTile, transferablesOf } from '../src/map/layers/buildTile';
import type { TileBuffers } from '../src/map/layers/types';
import z12Url from './fixtures/downtown-z12.mvt.gz?inline';
import z15Url from './fixtures/downtown-z15.mvt.gz?inline';

/** Real tiles from the extract, saved gzipped with `pmtiles tile`. */
async function fixture(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl);
  const stream = response.body!.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

describe('buildTile', () => {
  let detailed: TileBuffers;
  let zoomedOut: TileBuffers;

  beforeAll(async () => {
    detailed = buildTile(await fixture(z15Url), 15);
    zoomedOut = buildTile(await fixture(z12Url), 12);
  });

  it('builds every layer from a detailed tile', () => {
    for (const id of ['land', 'water', 'roadsMajor', 'roadsMinor', 'buildings', 'edges'] as const) {
      expect(detailed.layers[id]?.position.length, id).toBeGreaterThan(0);
    }
  });

  it('drops buildings, edges and minor roads when zoomed out', () => {
    expect(zoomedOut.layers.buildings).toBeUndefined();
    expect(zoomedOut.layers.edges).toBeUndefined();
    expect(zoomedOut.layers.roadsMinor).toBeUndefined();
    expect(zoomedOut.layers.roadsMajor?.position.length).toBeGreaterThan(0);
    expect(zoomedOut.layers.water?.position.length).toBeGreaterThan(0);
  });

  it('separates highways from major and minor roads', () => {
    expect(zoomedOut.layers.roadsHighway?.position.length).toBeGreaterThan(0);
    expect(zoomedOut.layers.roadsMajor?.position.length).toBeGreaterThan(0);
  });

  it('produces finite coordinates and valid indices', () => {
    const { position, index } = detailed.layers.buildings!;
    expect(position.every(Number.isFinite)).toBe(true);
    const vertices = position.length / 3;
    expect(index!.every((i) => i < vertices)).toBe(true);
  });

  it('reads named places', () => {
    expect(zoomedOut.labels.some((label) => label.name === 'Toronto')).toBe(true);
    for (const label of [...detailed.labels, ...zoomedOut.labels]) {
      expect(label.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(label.x)).toBe(true);
    }
  });

  it('lists each buffer once for transfer to the main thread', () => {
    const transfers = transferablesOf(detailed);
    expect(new Set(transfers).size).toBe(transfers.length);
    expect(transfers.length).toBeGreaterThan(0);
  });
});
