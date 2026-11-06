import earcut from 'earcut';
import { boundingSphere, outsideTile, turnAngle, type LayerBuffers, type Pt, type TileScale } from './types';

const JOIN_SEGMENTS = 8;
/** Bends gentler than this (radians) don't need a round join. */
const JOIN_MIN_TURN = 0.2;

/** Accumulates merged, flat (y = 0) geometry for one layer of one tile. */
export class FlatBuilder {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];

  constructor(private readonly scale: TileScale) {}

  /** `rings` is an outer ring followed by its holes, in tile units. */
  addPolygon(rings: Pt[][]): void {
    const s = this.scale.unitsToScene;
    const coords: number[] = [];
    const holes: number[] = [];
    rings.forEach((ring, i) => {
      if (i > 0) holes.push(coords.length / 2);
      for (const p of ring) coords.push(p.x * s, p.y * s);
    });
    const base = this.positions.length / 3;
    for (let i = 0; i < coords.length; i += 2) this.positions.push(coords[i]!, 0, coords[i + 1]!);
    for (const index of earcut(coords, holes)) this.indices.push(base + index);
  }

  /** Adds a line as a ribbon `width` scene units wide, with rounded bends and ends. */
  addRibbon(line: Pt[], width: number): void {
    const s = this.scale.unitsToScene;
    const half = width / 2;
    const margin = width / s;
    const { extent } = this.scale;

    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      if (outsideTile(a, b, extent, margin)) continue;

      const ax = a.x * s;
      const az = a.y * s;
      const bx = b.x * s;
      const bz = b.y * s;
      const len = Math.hypot(bx - ax, bz - az);
      if (len === 0) continue;
      const nx = (-(bz - az) / len) * half;
      const nz = ((bx - ax) / len) * half;

      const base = this.positions.length / 3;
      this.positions.push(ax + nx, 0, az + nz, ax - nx, 0, az - nz, bx - nx, 0, bz - nz, bx + nx, 0, bz + nz);
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);

      const previous = line[i - 1];
      if (!previous || turnAngle(previous, a, b) > JOIN_MIN_TURN) this.addDisc(ax, az, half);
      if (i === line.length - 2) this.addDisc(bx, bz, half);
    }
  }

  build(): LayerBuffers | undefined {
    if (this.indices.length === 0) return undefined;
    const position = new Float32Array(this.positions);
    return { position, index: new Uint32Array(this.indices), boundingSphere: boundingSphere(position) };
  }

  private addDisc(cx: number, cz: number, radius: number): void {
    const centre = this.positions.length / 3;
    this.positions.push(cx, 0, cz);
    for (let i = 0; i < JOIN_SEGMENTS; i++) {
      const angle = (i / JOIN_SEGMENTS) * Math.PI * 2;
      this.positions.push(cx + Math.cos(angle) * radius, 0, cz + Math.sin(angle) * radius);
      this.indices.push(centre, centre + 1 + i, centre + 1 + ((i + 1) % JOIN_SEGMENTS));
    }
  }
}
