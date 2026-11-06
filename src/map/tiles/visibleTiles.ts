import { groundToScreen, ndcToGroundOffset } from '../isoMath';
import { tileOriginInScene, tileSizeInScene, type ScenePoint, type TileRange } from '../projection';

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface TileView {
  target: ScenePoint;
  viewHeight: number;
  aspect: number;
  azimuth: number;
  elevation: number;
}

export function tileKey({ z, x, y }: TileCoord): string {
  return `${z}/${x}/${y}`;
}

/**
 * The tiles a view can see inside `limits`, nearest the centre first.
 * `tallestBuilding` keeps tiles just below the screen, whose towers can rise into view.
 */
export function visibleTiles(view: TileView, limits: TileRange, tallestBuilding: number): TileCoord[] {
  const { target, viewHeight, aspect, azimuth, elevation } = view;
  const { z } = limits;
  const size = tileSizeInScene(z);
  const world = tileOriginInScene(z, 0, 0);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [ndcX, ndcY] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const corner = ndcToGroundOffset(ndcX, ndcY, viewHeight, aspect, azimuth, elevation);
    minX = Math.min(minX, target.x + corner.x);
    maxX = Math.max(maxX, target.x + corner.x);
    minZ = Math.min(minZ, target.z + corner.z);
    maxZ = Math.max(maxZ, target.z + corner.z);
  }

  const margin = size + tallestBuilding;
  const fromX = Math.max(limits.minX, Math.floor((minX - margin - world.x) / size));
  const toX = Math.min(limits.maxX, Math.floor((maxX + margin - world.x) / size));
  const fromY = Math.max(limits.minY, Math.floor((minZ - margin - world.z) / size));
  const toY = Math.min(limits.maxY, Math.floor((maxZ + margin - world.z) / size));

  const halfWidth = (viewHeight * aspect) / 2;
  const halfHeight = viewHeight / 2;
  const tileRadius = size * Math.SQRT1_2;
  const riseBelowScreen = tallestBuilding * Math.cos(elevation);

  const tiles: { coord: TileCoord; distance: number }[] = [];
  for (let x = fromX; x <= toX; x++) {
    for (let y = fromY; y <= toY; y++) {
      const dx = world.x + (x + 0.5) * size - target.x;
      const dz = world.z + (y + 0.5) * size - target.z;
      const screen = groundToScreen(dx, dz, azimuth, elevation);
      const inView =
        Math.abs(screen.x) <= halfWidth + tileRadius &&
        screen.y <= halfHeight + tileRadius &&
        screen.y >= -halfHeight - tileRadius - riseBelowScreen;
      if (inView) tiles.push({ coord: { z, x, y }, distance: Math.hypot(dx, dz) });
    }
  }
  return tiles.sort((a, b) => a.distance - b.distance).map((tile) => tile.coord);
}
