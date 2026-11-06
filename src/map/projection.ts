/**
 * The only module that knows how geographic coordinates map to the scene.
 *
 * Scene axes: +x east, +y up, +z south. One unit is about one ground metre near
 * the origin: Web Mercator inflates distances by 1/cos(lat), so we multiply by
 * cos(origin lat). That keeps building heights, which are true metres, in
 * proportion with their footprints.
 */

export const ORIGIN = { lat: 43.6532, lon: -79.3832 } as const;

const EARTH_RADIUS = 6378137;
const DEG = Math.PI / 180;
const WORLD_SIZE = 2 * Math.PI * EARTH_RADIUS;

/** Scene units per Web Mercator metre. */
export const SCENE_SCALE = Math.cos(ORIGIN.lat * DEG);

export interface LonLat {
  lat: number;
  lon: number;
}

export interface ScenePoint {
  x: number;
  z: number;
}

export interface LonLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TileRange {
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function mercatorX(lon: number): number {
  return EARTH_RADIUS * lon * DEG;
}

function mercatorY(lat: number): number {
  return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
}

const ORIGIN_X = mercatorX(ORIGIN.lon);
const ORIGIN_Y = mercatorY(ORIGIN.lat);

export function lonLatToScene({ lat, lon }: LonLat): ScenePoint {
  return {
    x: (mercatorX(lon) - ORIGIN_X) * SCENE_SCALE,
    z: -(mercatorY(lat) - ORIGIN_Y) * SCENE_SCALE,
  };
}

export function sceneToLonLat({ x, z }: ScenePoint): LonLat {
  const mx = x / SCENE_SCALE + ORIGIN_X;
  const my = -z / SCENE_SCALE + ORIGIN_Y;
  return {
    lon: mx / EARTH_RADIUS / DEG,
    lat: (2 * Math.atan(Math.exp(my / EARTH_RADIUS)) - Math.PI / 2) / DEG,
  };
}

/** Side length of a tile at zoom `z`, in scene units. */
export function tileSizeInScene(z: number): number {
  return (WORLD_SIZE / 2 ** z) * SCENE_SCALE;
}

/** Scene position of a tile's north-west corner. */
export function tileOriginInScene(z: number, x: number, y: number): ScenePoint {
  const n = 2 ** z;
  const mx = (x / n - 0.5) * WORLD_SIZE;
  const my = (0.5 - y / n) * WORLD_SIZE;
  return {
    x: (mx - ORIGIN_X) * SCENE_SCALE,
    z: -(my - ORIGIN_Y) * SCENE_SCALE,
  };
}

/** The tile containing a coordinate. */
export function lonLatToTile({ lat, lon }: LonLat, z: number): { x: number; y: number } {
  const n = 2 ** z;
  return {
    x: Math.floor(((mercatorX(lon) / WORLD_SIZE + 0.5) * n)),
    y: Math.floor(((0.5 - mercatorY(lat) / WORLD_SIZE) * n)),
  };
}

export function tileRangeForBounds(bounds: LonLatBounds, z: number): TileRange {
  const nw = lonLatToTile({ lat: bounds.north, lon: bounds.west }, z);
  const se = lonLatToTile({ lat: bounds.south, lon: bounds.east }, z);
  return { z, minX: nw.x, maxX: se.x, minY: nw.y, maxY: se.y };
}
