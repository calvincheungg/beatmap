import { create } from 'zustand';
import type { Neighbourhood } from '../data/neighbourhoods';
import type { Venue } from '../data/venues';
import type { LoadProgress } from '../map/tiles/tileManager';
import { theme } from '../theme';

/** Where the camera should fly. A new object starts a new flight. */
export interface FlyRequest {
  lat: number;
  lon: number;
  viewHeight: number;
}

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
  /** Null until the first tile finishes. */
  progress: LoadProgress | null;
  /** True once the first view has fully loaded. Later tile loads stay quiet. */
  initialLoadDone: boolean;
  rotate: (steps: number) => void;
  toggleFlat: () => void;
  toggleLabels: () => void;
  selectNeighbourhood: (neighbourhood: Neighbourhood) => void;
  selectVenue: (venue: Venue) => void;
  closePanel: () => void;
  setProgress: (progress: LoadProgress) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  rotationSteps: 0,
  flat: false,
  showLabels: true,
  flyRequest: null,
  selectedNeighbourhoodId: null,
  selectedVenueId: null,
  progress: null,
  initialLoadDone: false,
  rotate: (steps) => set((state) => ({ rotationSteps: state.rotationSteps + steps })),
  toggleFlat: () => set((state) => ({ flat: !state.flat })),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  selectNeighbourhood: ({ id, lat, lon, viewHeight }) =>
    set({ selectedNeighbourhoodId: id, selectedVenueId: null, flyRequest: { lat, lon, viewHeight } }),
  selectVenue: ({ id, lat, lon }) =>
    set({ selectedVenueId: id, flyRequest: { lat, lon, viewHeight: theme.camera.venueViewHeight } }),
  closePanel: () => set({ selectedNeighbourhoodId: null, selectedVenueId: null }),
  setProgress: (progress) =>
    set((state) => ({
      progress,
      initialLoadDone:
        state.initialLoadDone || (progress.failed === 0 && progress.loaded === progress.total),
    })),
}));
