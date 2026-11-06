import type { LayerId } from '../../theme';

/** Vector tile geometry types. */
export const LINE = 2;
export const POLYGON = 3;

export interface Pt {
  x: number;
  y: number;
}

/** Geometry for one layer of one tile, positioned relative to the tile's corner. */
export interface LayerBuffers {
  position: Float32Array;
  index?: Uint32Array;
  normal?: Float32Array;
  color?: Float32Array;
  boundingSphere: { x: number; y: number; z: number; radius: number };
}

export type TileBuffers = Partial<Record<LayerId, LayerBuffers>>;

/** Tile units (0..extent) to scene units. */
export interface TileScale {
  extent: number;
  unitsToScene: number;
}

export function boundingSphere(position: Float32Array): LayerBuffers['boundingSphere'] {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const v = position[i + axis]!;
      if (v < min[axis]!) min[axis] = v;
      if (v > max[axis]!) max[axis] = v;
    }
  }
  const [dx, dy, dz] = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
  return {
    x: (min[0]! + max[0]!) / 2,
    y: (min[1]! + max[1]!) / 2,
    z: (min[2]! + max[2]!) / 2,
    radius: Math.hypot(dx, dy, dz) / 2,
  };
}

/** True when a segment lies wholly past one side of the tile, by more than `margin` tile units. */
export function outsideTile(a: Pt, b: Pt, extent: number, margin: number): boolean {
  return (
    (a.x < -margin && b.x < -margin) ||
    (a.y < -margin && b.y < -margin) ||
    (a.x > extent + margin && b.x > extent + margin) ||
    (a.y > extent + margin && b.y > extent + margin)
  );
}

/** Absolute change of direction at b, in radians. */
export function turnAngle(a: Pt, b: Pt, c: Pt): number {
  const first = Math.atan2(b.y - a.y, b.x - a.x);
  const second = Math.atan2(c.y - b.y, c.x - b.x);
  const diff = Math.abs(second - first);
  return diff > Math.PI ? 2 * Math.PI - diff : diff;
}
