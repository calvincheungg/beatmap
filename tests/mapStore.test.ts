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
      loadState: 'loading',
      events: [],
      eventsLoaded: false,
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

  it('records loaded events and failed loads', () => {
    useMapStore.getState().setEvents(null);
    expect(useMapStore.getState()).toMatchObject({ events: null, eventsLoaded: true });
  });

  it('tracks whether the map has loaded', () => {
    useMapStore.getState().setLoadState('ready');
    expect(useMapStore.getState().loadState).toBe('ready');
  });

  it('toggles place names', () => {
    useMapStore.getState().toggleLabels();
    expect(useMapStore.getState().showLabels).toBe(false);
  });

  it('opens the panel and starts a flight when a neighbourhood is picked', () => {
    const area = { id: 'area', name: 'Area', lat: 43.7, lon: -79.4, zoom: 14 };
    useMapStore.getState().selectNeighbourhood(area);
    const state = useMapStore.getState();
    expect(state.selectedNeighbourhoodId).toBe('area');
    expect(state.flyRequest).toEqual({ lat: 43.7, lon: -79.4, zoom: 14 });
    state.closePanel();
    expect(useMapStore.getState().selectedNeighbourhoodId).toBeNull();
  });

  it('opens the panel on a clicked pin without moving the camera', () => {
    const venue = {
      id: 'v',
      name: 'V',
      lat: 43.7,
      lon: -79.4,
      neighbourhood: 'area',
      neighbourhoodName: 'Area',
      address: '',
      website: null,
      capacity: null,
      sizeTier: 'small',
      indoorOutdoor: 'indoor',
      status: 'listed',
    };
    useMapStore.getState().selectVenue(venue, { fly: false });
    const state = useMapStore.getState();
    expect(state.selectedVenueId).toBe('v');
    expect(state.selectedNeighbourhoodId).toBe('area');
    expect(state.flyRequest).toBeNull();
  });

  it('flies to a venue picked in the panel', () => {
    const venue = {
      id: 'v',
      name: 'V',
      lat: 43.7,
      lon: -79.4,
      neighbourhood: 'area',
      neighbourhoodName: 'Area',
      address: '',
      website: null,
      capacity: null,
      sizeTier: 'small',
      indoorOutdoor: 'indoor',
      status: 'listed',
    };
    useMapStore.getState().selectVenue(venue);
    expect(useMapStore.getState().flyRequest).toMatchObject({ lat: 43.7, lon: -79.4 });
  });

});
