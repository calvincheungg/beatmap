import earcut from 'earcut';
import { theme } from '../../theme';
import { hexToLinear } from './color';
import { boundingSphere, outsideTile, turnAngle, type LayerBuffers, type Pt, type TileScale } from './types';

/** Corners sharper than this (radians) get a vertical edge line. */
const CORNER_MIN_TURN = 0.45;

const palette = theme.buildings.palette.map(hexToLinear);

export interface BuildingInput {
  /** An outer ring followed by its holes, in tile units. Rings need not be closed. */
  rings: Pt[][];
  height?: number;
  minHeight?: number;
}

export interface BuildingBuffers {
  buildings?: LayerBuffers;
  edges?: LayerBuffers;
}

export function defaultBuildingHeight(): number {
  return theme.buildings.defaultLevels * theme.buildings.metresPerLevel;
}

/**
 * Merges extruded buildings into one mesh plus one set of edge lines.
 *
 * Colour comes from the height, not the feature. Building parts overlap their
 * outlines, and buildings repeat across tile edges, so this gives coplanar
 * surfaces the same colour and prevents visible z-fighting.
 */
export function buildBuildings(inputs: BuildingInput[], scale: TileScale): BuildingBuffers {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const edges: number[] = [];
  const s = scale.unitsToScene;

  for (const input of inputs) {
    const top = input.height && input.height > 0 ? input.height : defaultBuildingHeight();
    const bottom = input.minHeight && input.minHeight > 0 ? input.minHeight : 0;
    if (top <= bottom) continue;

    const rings = input.rings.map(openRing);
    if ((rings[0]?.length ?? 0) < 3) continue;

    const [red, green, blue] = palette[Math.round(top) % palette.length]!;
    const tint = theme.buildings.roofTint;

    // Roof.
    const coords: number[] = [];
    const holes: number[] = [];
    const base = positions.length / 3;
    rings.forEach((ring, i) => {
      if (i > 0) holes.push(coords.length / 2);
      for (const p of ring) {
        coords.push(p.x, p.y);
        positions.push(p.x * s, top, p.y * s);
        normals.push(0, 1, 0);
        colors.push(red * tint, green * tint, blue * tint);
      }
    });
    const tris = earcut(coords, holes);
    for (let i = 0; i < tris.length; i += 3) {
      const [p, q, w] = [tris[i]!, tris[i + 1]!, tris[i + 2]!];
      // Face upwards whichever way earcut wound the triangle.
      const up =
        (coords[q * 2 + 1]! - coords[p * 2 + 1]!) * (coords[w * 2]! - coords[p * 2]!) -
        (coords[q * 2]! - coords[p * 2]!) * (coords[w * 2 + 1]! - coords[p * 2 + 1]!);
      if (up >= 0) indices.push(base + p, base + q, base + w);
      else indices.push(base + p, base + w, base + q);
    }

    // Walls and edge lines.
    rings.forEach((ring, ringIndex) => {
      // Outer rings wind negative and holes positive, so (-dz, dx) points out of the solid.
      const wanted = ringIndex === 0 ? -1 : 1;
      const points = Math.sign(signedArea(ring)) === wanted ? ring : [...ring].reverse();

      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        if (outsideTile(a, b, scale.extent, 0)) continue;

        const ax = a.x * s;
        const az = a.y * s;
        const bx = b.x * s;
        const bz = b.y * s;
        const len = Math.hypot(bx - ax, bz - az);
        if (len === 0) continue;
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;

        const v = positions.length / 3;
        positions.push(ax, bottom, az, bx, bottom, bz, bx, top, bz, ax, top, az);
        for (let k = 0; k < 4; k++) {
          normals.push(nx, 0, nz);
          colors.push(red, green, blue);
        }
        indices.push(v, v + 1, v + 2, v, v + 2, v + 3);

        edges.push(ax, top, az, bx, top, bz);
        const previous = points[(i - 1 + points.length) % points.length]!;
        if (turnAngle(previous, a, b) > CORNER_MIN_TURN) edges.push(ax, bottom, az, ax, top, az);
      }
    });
  }

  if (indices.length === 0) return {};

  const position = new Float32Array(positions);
  const edgePosition = new Float32Array(edges);
  return {
    buildings: {
      position,
      normal: new Float32Array(normals),
      color: new Float32Array(colors),
      index: new Uint32Array(indices),
      boundingSphere: boundingSphere(position),
    },
    edges:
      edges.length > 0 ? { position: edgePosition, boundingSphere: boundingSphere(edgePosition) } : undefined,
  };
}

/** Vector tile rings repeat their first point at the end; drop the duplicate. */
function openRing(ring: Pt[]): Pt[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first && last && ring.length > 1 && first.x === last.x && first.y === last.y ? ring.slice(0, -1) : ring;
}

function signedArea(ring: Pt[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area;
}
