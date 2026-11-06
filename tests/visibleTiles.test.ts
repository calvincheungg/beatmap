import { describe, expect, it } from 'vitest';
import { selectBand, selectBandForZoom } from '../src/map/layers/lod';
import { FLAT_AZIMUTH, FLAT_ELEVATION, ISO_AZIMUTH, ISO_ELEVATION } from '../src/map/isoMath';
import { lonLatToTile, ORIGIN, tileRangeForBounds } from '../src/map/projection';
import { tileKey, visibleTiles, type TileView } from '../src/map/tiles/visibleTiles';

const bounds = { west: -80.35, south: 43.2, east: -78.55, north: 44.45 };
const iso: TileView = {
  target: { x: 0, z: 0 },
  viewHeight: 2600,
  aspect: 1.6,
  azimuth: ISO_AZIMUTH,
  elevation: ISO_ELEVATION,
};

describe('visibleTiles', () => {
  const limits = tileRangeForBounds(bounds, 15);

  it('puts the tile under the camera first', () => {
    const first = visibleTiles(iso, limits, 600)[0]!;
    const { x, y } = lonLatToTile(ORIGIN, 15);
    expect(first).toEqual({ z: 15, x, y });
  });

  it('returns no duplicates and stays inside the limits', () => {
    const tiles = visibleTiles(iso, limits, 600);
    expect(new Set(tiles.map(tileKey)).size).toBe(tiles.length);
    for (const { x, y } of tiles) {
      expect(x).toBeGreaterThanOrEqual(limits.minX);
      expect(x).toBeLessThanOrEqual(limits.maxX);
      expect(y).toBeGreaterThanOrEqual(limits.minY);
      expect(y).toBeLessThanOrEqual(limits.maxY);
    }
  });

  it('loads fewer tiles than the bounding box of the rotated view', () => {
    const tiles = visibleTiles(iso, limits, 600);
    const xs = tiles.map((tile) => tile.x);
    const ys = tiles.map((tile) => tile.y);
    const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    expect(tiles.length).toBeLessThan(box);
  });

  it('needs fewer tiles on the flat map, which has no foreshortening', () => {
    const flat = { ...iso, azimuth: FLAT_AZIMUTH, elevation: FLAT_ELEVATION };
    expect(visibleTiles(flat, limits, 600).length).toBeLessThan(visibleTiles(iso, limits, 600).length);
  });

  it('returns nothing when the view is outside the limits', () => {
    expect(visibleTiles({ ...iso, target: { x: 5_000_000, z: 0 } }, limits, 600)).toEqual([]);
  });

  it('keeps tile counts manageable at the top of every band', () => {
    for (const viewHeight of [3000, 5000, 30000, 70000]) {
      const band = selectBand(viewHeight);
      const range = tileRangeForBounds(bounds, band.tileZoom);
      expect(visibleTiles({ ...iso, viewHeight }, range, 600).length).toBeLessThan(120);
    }
  });
});

describe('level of detail', () => {
  it('shows buildings only when zoomed in', () => {
    expect(selectBand(2600).buildings).toBe(true);
    expect(selectBand(20000).buildings).toBe(false);
    expect(selectBand(70000).buildings).toBe(false);
  });

  it('never loads below zoom 10, where non-OSM data appears', () => {
    expect(selectBand(1e9).tileZoom).toBeGreaterThanOrEqual(10);
  });

  it('finds a band from its tile zoom', () => {
    expect(selectBandForZoom(12).tileZoom).toBe(12);
  });
});
