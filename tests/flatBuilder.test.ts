import { describe, expect, it } from 'vitest';
import { FlatBuilder } from '../src/map/layers/flatBuilder';

const scale = { extent: 4096, unitsToScene: 2 };

describe('FlatBuilder', () => {
  it('converts tile units to scene units on the ground plane', () => {
    const builder = new FlatBuilder(scale);
    builder.addPolygon([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    ]);
    const { position, index } = builder.build()!;
    expect([...position]).toEqual([0, 0, 0, 20, 0, 0, 20, 0, 20]);
    expect(index!.length).toBe(3);
  });

  it('builds a ribbon of the requested width', () => {
    const builder = new FlatBuilder(scale);
    builder.addRibbon(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      8,
    );
    const { position } = builder.build()!;
    // The first four vertices are the quad: 4 scene units either side of z = 200.
    expect(position[2]).toBe(204);
    expect(position[5]).toBe(196);
  });

  it('drops segments far outside the tile', () => {
    const builder = new FlatBuilder(scale);
    builder.addRibbon(
      [
        { x: -500, y: 100 },
        { x: -400, y: 100 },
      ],
      8,
    );
    expect(builder.build()).toBeUndefined();
  });
});
