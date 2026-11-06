import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore } from '../src/state/mapStore';

describe('mapStore', () => {
  beforeEach(() => useMapStore.setState({ rotationSteps: 0, progress: null }));

  it('accumulates rotation steps in both directions', () => {
    const { rotate } = useMapStore.getState();
    rotate(1);
    rotate(1);
    rotate(-1);
    expect(useMapStore.getState().rotationSteps).toBe(1);
  });

  it('stores load progress', () => {
    useMapStore.getState().setProgress({ loaded: 3, failed: 1, total: 10 });
    expect(useMapStore.getState().progress).toEqual({ loaded: 3, failed: 1, total: 10 });
  });
});
