import { create } from 'zustand';
import type { Neighbourhood } from '../data/neighbourhoods';
import type { Venue } from '../data/venues';
import { theme } from '../theme';

/** Where the camera should fly. A new object starts a new flight. */
export interface FlyRequest {
  lat: number;
  lon: number;
  zoom: number;
}

export type LoadState = 'loading' | 'ready' | 'error';

interface MapState {
  /** Total 90 degree rotation steps from the default view. */
  rotationSteps: number;
  /** True for the top-down map, false for the isometric view. */
  flat: boolean;
  showLabels: boolean;
  flyRequest: FlyRequest | null;
  /** The neighbourhood shown in the side panel. The panel is closed when null. */
  selectedNeighbourhoodId: string | null;
  selectedVenueId: string | null;
  hoveredVenueId: string | null;
  loadState: LoadState;
  rotate: (steps: number) => void;
  toggleFlat: () => void;
  toggleLabels: () => void;
  selectNeighbourhood: (neighbourhood: Neighbourhood) => void;
  /** Opens the panel on a venue. Flying is optional, because a clicked pin is already in view. */
  selectVenue: (venue: Venue, options?: { fly: boolean }) => void;
  setHoveredVenue: (id: string | null) => void;
  closePanel: () => void;
  setLoadState: (loadState: LoadState) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  rotationSteps: 0,
  flat: false,
  showLabels: true,
  flyRequest: null,
  selectedNeighbourhoodId: null,
  selectedVenueId: null,
  hoveredVenueId: null,
  loadState: 'loading',
  rotate: (steps) => set((state) => ({ rotationSteps: state.rotationSteps + steps })),
  toggleFlat: () => set((state) => ({ flat: !state.flat })),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  selectNeighbourhood: ({ id, lat, lon, zoom }) =>
    set({ selectedNeighbourhoodId: id, selectedVenueId: null, flyRequest: { lat, lon, zoom } }),
  selectVenue: ({ id, lat, lon, neighbourhood }, { fly } = { fly: true }) =>
    set((state) => ({
      selectedVenueId: id,
      selectedNeighbourhoodId: neighbourhood,
      flyRequest: fly ? { lat, lon, zoom: theme.camera.venueZoom } : state.flyRequest,
    })),
  setHoveredVenue: (id) => set({ hoveredVenueId: id }),
  closePanel: () => set({ selectedNeighbourhoodId: null, selectedVenueId: null }),
  setLoadState: (loadState) => set({ loadState }),
}));
