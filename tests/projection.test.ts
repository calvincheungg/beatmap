import { describe, expect, it } from 'vitest';
import {
  lonLatToScene,
  lonLatToTile,
  ORIGIN,
  sceneToLonLat,
  SCENE_SCALE,
  tileOriginInScene,
  tileRangeForBounds,
  tileSizeInScene,
} from '../src/map/projection';

describe('lonLatToScene', () => {
  it('maps the origin to zero', () => {
    const { x, z } = lonLatToScene(ORIGIN);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it('points east along +x and north along -z', () => {
    expect(lonLatToScene({ lat: ORIGIN.lat, lon: ORIGIN.lon + 0.01 }).x).toBeGreaterThan(0);
    expect(lonLatToScene({ lat: ORIGIN.lat + 0.01, lon: ORIGIN.lon }).z).toBeLessThan(0);
  });

  it('uses roughly true ground metres near the origin', () => {
    // Known distance: 0.01 degrees of latitude is about 1111 m.
    const north = lonLatToScene({ lat: ORIGIN.lat + 0.01, lon: ORIGIN.lon });
    expect(Math.abs(north.z)).toBeGreaterThan(1100);
    expect(Math.abs(north.z)).toBeLessThan(1125);
    // Known distance: 0.01 degrees of longitude here is about 805 m.
    const east = lonLatToScene({ lat: ORIGIN.lat, lon: ORIGIN.lon + 0.01 });
    expect(east.x).toBeGreaterThan(795);
    expect(east.x).toBeLessThan(815);
  });

  it('removes the Mercator stretch with the scale factor', () => {
    expect(SCENE_SCALE).toBeCloseTo(0.7236, 3);
  });
});

describe('sceneToLonLat', () => {
  it.each([
    [ORIGIN.lat, ORIGIN.lon],
    [43.5890, -79.6441], // Mississauga
    [44.05, -79.46], // Newmarket
    [43.8971, -78.8658], // Oshawa
  ])('round-trips %f, %f', (lat, lon) => {
    const result = sceneToLonLat(lonLatToScene({ lat, lon }));
    expect(result.lat).toBeCloseTo(lat, 9);
    expect(result.lon).toBeCloseTo(lon, 9);
  });
});

describe('tiles', () => {
  it('finds the known z15 tile for the origin', () => {
    expect(lonLatToTile(ORIGIN, 15)).toEqual({ x: 9158, y: 11958 });
  });

  it('places the origin inside its own tile', () => {
    const corner = tileOriginInScene(15, 9158, 11958);
    const size = tileSizeInScene(15);
    expect(corner.x).toBeLessThanOrEqual(0);
    expect(corner.x + size).toBeGreaterThan(0);
    expect(corner.z).toBeLessThanOrEqual(0);
    expect(corner.z + size).toBeGreaterThan(0);
  });

  it('agrees with lonLatToScene at a tile corner', () => {
    const n = 2 ** 15;
    const lon = (9158 / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * 11958) / n))) * 180) / Math.PI;
    const direct = lonLatToScene({ lat, lon });
    const corner = tileOriginInScene(15, 9158, 11958);
    expect(corner.x).toBeCloseTo(direct.x, 5);
    expect(corner.z).toBeCloseTo(direct.z, 5);
  });

  it('halves tile size with each zoom', () => {
    expect(tileSizeInScene(14)).toBeCloseTo(tileSizeInScene(15) * 2, 6);
  });

  it('computes an inclusive, north-west-first tile range', () => {
    const range = tileRangeForBounds({ west: -79.4, south: 43.64, east: -79.38, north: 43.66 }, 15);
    expect(range.minX).toBeLessThanOrEqual(range.maxX);
    expect(range.minY).toBeLessThanOrEqual(range.maxY);
    expect(lonLatToTile({ lat: 43.65, lon: -79.39 }, 15).x).toBeGreaterThanOrEqual(range.minX);
    expect(lonLatToTile({ lat: 43.65, lon: -79.39 }, 15).y).toBeLessThanOrEqual(range.maxY);
  });
});
