import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore } from '../src/state/mapStore';

describe('mapStore', () => {
  beforeEach(() =>
    useMapStore.setState({
      rotationSteps: 0,
      flat: false,
      showLabels: true,
      flyRequest: null,
      selectedNeighbourhoodId: null,
      selectedVenueId: null,
      hoveredVenueId: null,
      progress: null,
      initialLoadDone: false,
    }),
  );

  it('accumulates rotation steps in both directions', () => {
    const { rotate } = useMapStore.getState();
    rotate(1);
    rotate(1);
    rotate(-1);
    expect(useMapStore.getState().rotationSteps).toBe(1);
  });

  it('toggles the flat map', () => {
    useMapStore.getState().toggleFlat();
    expect(useMapStore.getState().flat).toBe(true);
    useMapStore.getState().toggleFlat();
    expect(useMapStore.getState().flat).toBe(false);
  });

  it('remembers the first complete load', () => {
    const { setProgress } = useMapStore.getState();
    setProgress({ loaded: 1, failed: 0, total: 2 });
    expect(useMapStore.getState().initialLoadDone).toBe(false);
    setProgress({ loaded: 2, failed: 0, total: 2 });
    setProgress({ loaded: 0, failed: 0, total: 9 });
    expect(useMapStore.getState().initialLoadDone).toBe(true);
  });

  it('toggles place names', () => {
    useMapStore.getState().toggleLabels();
    expect(useMapStore.getState().showLabels).toBe(false);
  });

  it('opens the panel and starts a flight when a neighbourhood is picked', () => {
    const area = { id: 'area', name: 'Area', lat: 43.7, lon: -79.4, viewHeight: 2000 };
    useMapStore.getState().selectNeighbourhood(area);
    const state = useMapStore.getState();
    expect(state.selectedNeighbourhoodId).toBe('area');
    expect(state.flyRequest).toEqual({ lat: 43.7, lon: -79.4, viewHeight: 2000 });
    state.closePanel();
    expect(useMapStore.getState().selectedNeighbourhoodId).toBeNull();
  });

  it('opens the panel on a clicked pin without moving the camera', () => {
    const venue = { id: 'v', name: 'V', lat: 43.7, lon: -79.4, neighbourhood: 'area' };
    useMapStore.getState().selectVenue(venue, { fly: false });
    const state = useMapStore.getState();
    expect(state.selectedVenueId).toBe('v');
    expect(state.selectedNeighbourhoodId).toBe('area');
    expect(state.flyRequest).toBeNull();
  });

  it('flies to a venue picked in the panel', () => {
    const venue = { id: 'v', name: 'V', lat: 43.7, lon: -79.4, neighbourhood: 'area' };
    useMapStore.getState().selectVenue(venue);
    expect(useMapStore.getState().flyRequest).toMatchObject({ lat: 43.7, lon: -79.4 });
  });

  it('stores load progress', () => {
    useMapStore.getState().setProgress({ loaded: 3, failed: 1, total: 10 });
    expect(useMapStore.getState().progress).toEqual({ loaded: 3, failed: 1, total: 10 });
  });
});
