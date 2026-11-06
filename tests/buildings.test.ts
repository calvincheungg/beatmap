import { describe, expect, it } from 'vitest';
import { buildBuildings, defaultBuildingHeight } from '../src/map/layers/buildings';
import type { Pt, TileScale } from '../src/map/layers/types';

const scale: TileScale = { extent: 4096, unitsToScene: 1 };
const square = (x: number, y: number, size: number): Pt[] => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
  { x, y },
];

function maxY(position: Float32Array): number {
  let max = -Infinity;
  for (let i = 1; i < position.length; i += 3) max = Math.max(max, position[i]!);
  return max;
}

/** Checks each triangle faces the way its vertex normal says. */
function assertFrontFacing(position: Float32Array, normal: Float32Array, index: Uint32Array): void {
  const at = (i: number): [number, number, number] => [position[i * 3]!, position[i * 3 + 1]!, position[i * 3 + 2]!];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [at(index[t]!), at(index[t + 1]!), at(index[t + 2]!)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const n = index[t]! * 3;
    const dot = cross[0]! * normal[n]! + cross[1]! * normal[n + 1]! + cross[2]! * normal[n + 2]!;
    expect(dot).toBeGreaterThan(0);
  }
}

describe('buildBuildings', () => {
  it('uses the tagged height', () => {
    const { buildings } = buildBuildings([{ rings: [square(10, 10, 20)], height: 42 }], scale);
    expect(maxY(buildings!.position)).toBe(42);
  });

  it('defaults to 2 levels at 3.5 m when height is unknown', () => {
    expect(defaultBuildingHeight()).toBe(7);
    const { buildings } = buildBuildings([{ rings: [square(10, 10, 20)] }], scale);
    expect(maxY(buildings!.position)).toBe(7);
  });

  it('starts walls at min_height', () => {
    const { buildings } = buildBuildings([{ rings: [square(10, 10, 20)], height: 30, minHeight: 12 }], scale);
    let min = Infinity;
    for (let i = 1; i < buildings!.position.length; i += 3) min = Math.min(min, buildings!.position[i]!);
    expect(min).toBe(12);
  });

  it('winds every face outwards, whichever way the source ring runs', () => {
    const forward = square(10, 10, 20);
    for (const ring of [forward, [...forward].reverse()]) {
      const { buildings } = buildBuildings([{ rings: [ring], height: 10 }], scale);
      assertFrontFacing(buildings!.position, buildings!.normal!, buildings!.index!);
    }
  });

  it('points hole walls into the hole', () => {
    const { buildings } = buildBuildings(
      [{ rings: [square(0, 0, 100), square(40, 40, 20)], height: 10 }],
      scale,
    );
    assertFrontFacing(buildings!.position, buildings!.normal!, buildings!.index!);
    // The hole's +x-side wall sits at x = 60 and must face -x, towards the hole centre.
    const { position, normal } = buildings!;
    let found = false;
    for (let i = 0; i < position.length; i += 3) {
      if (position[i] === 60 && normal![i] !== 0) {
        expect(normal![i]).toBe(-1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('merges many buildings into one buffer', () => {
    const one = buildBuildings([{ rings: [square(0, 0, 10)] }], scale).buildings!;
    const two = buildBuildings([{ rings: [square(0, 0, 10)] }, { rings: [square(50, 50, 10)] }], scale).buildings!;
    expect(two.position.length).toBe(one.position.length * 2);
  });

  it('skips walls outside the tile but keeps ones inside', () => {
    const { buildings } = buildBuildings([{ rings: [square(-100, 10, 50)], height: 10 }], scale);
    const inside = buildBuildings([{ rings: [square(100, 10, 50)], height: 10 }], scale).buildings!;
    expect(buildings?.position.length ?? 0).toBeLessThan(inside.position.length);
  });

  it('gives overlapping features of equal height the same colour', () => {
    const a = buildBuildings([{ rings: [square(0, 0, 10)], height: 25 }], scale).buildings!;
    const b = buildBuildings([{ rings: [square(500, 500, 40)], height: 25 }], scale).buildings!;
    expect(a.color!.slice(0, 3)).toEqual(b.color!.slice(0, 3));
  });

  it('writes a valid colour for every vertex, walls included', () => {
    const { position, color } = buildBuildings([{ rings: [square(0, 0, 10)], height: 25 }], scale).buildings!;
    expect(color!.length).toBe(position.length);
    for (const channel of color!) {
      expect(channel).toBeGreaterThan(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });

  it('returns nothing for empty or inverted input', () => {
    expect(buildBuildings([], scale)).toEqual({});
    expect(buildBuildings([{ rings: [square(0, 0, 10)], height: 5, minHeight: 9 }], scale)).toEqual({});
  });
});
