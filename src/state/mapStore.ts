import { create } from 'zustand';
import { ANY_DATE, dateRangeFor, type DateFilter } from '../data/dateFilter';
import { matchesFilter, type AgeFilter, type ShowEvent, type ShowFilter } from '../data/events';
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

export interface MapState {
  /** Total 90 degree rotation steps from the default view. */
  rotationSteps: number;
  /** True for the top-down map, false for the isometric view. */
  flat: boolean;
  showLabels: boolean;
  flyRequest: FlyRequest | null;
  /** The neighbourhood shown in the side panel. The panel is closed when null. */
  selectedNeighbourhoodId: string | null;
  selectedVenueId: string | null;
  /** A show picked in search, marked in the side panel. */
  highlightedShowId: string | null;
  hoveredVenueId: string | null;
  loadState: LoadState;
  /** Upcoming shows. Empty until loaded, and null if the listings couldn't be loaded. */
  events: ShowEvent[] | null;
  eventsLoaded: boolean;
  /** The genre filter. Null shows everything. */
  selectedGenre: string | null;
  dateFilter: DateFilter;
  /** The most the cheapest ticket can cost, in dollars. */
  priceFilter: number | null;
  ageFilter: AgeFilter | null;
  rotate: (steps: number) => void;
  toggleFlat: () => void;
  toggleLabels: () => void;
  selectNeighbourhood: (neighbourhood: Neighbourhood) => void;
  /** Opens the panel on a venue. Flying is optional, because a clicked pin is already in view. */
  selectVenue: (venue: Venue, options?: { fly: boolean }) => void;
  /** Opens a searched show's venue, clearing any filters that would hide it. */
  selectShow: (show: ShowEvent, venue: Venue, today: string) => void;
  setHoveredVenue: (id: string | null) => void;
  closePanel: () => void;
  setLoadState: (loadState: LoadState) => void;
  setEvents: (events: ShowEvent[] | null) => void;
  setGenre: (genre: string | null) => void;
  setDateFilter: (dateFilter: DateFilter) => void;
  setPriceFilter: (maxPrice: number | null) => void;
  setAgeFilter: (age: AgeFilter | null) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  rotationSteps: 0,
  flat: false,
  showLabels: true,
  flyRequest: null,
  selectedNeighbourhoodId: null,
  selectedVenueId: null,
  highlightedShowId: null,
  hoveredVenueId: null,
  loadState: 'loading',
  events: [],
  eventsLoaded: false,
  selectedGenre: null,
  dateFilter: ANY_DATE,
  priceFilter: null,
  ageFilter: null,
  rotate: (steps) => set((state) => ({ rotationSteps: state.rotationSteps + steps })),
  toggleFlat: () => set((state) => ({ flat: !state.flat })),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  selectNeighbourhood: ({ id, lat, lon, zoom }) =>
    set({ selectedNeighbourhoodId: id, selectedVenueId: null, highlightedShowId: null, flyRequest: { lat, lon, zoom } }),
  selectVenue: ({ id, lat, lon, neighbourhood }, { fly } = { fly: true }) =>
    set((state) => ({
      selectedVenueId: id,
      selectedNeighbourhoodId: neighbourhood,
      highlightedShowId: null,
      flyRequest: fly ? { lat, lon, zoom: theme.camera.venueZoom } : state.flyRequest,
    })),
  selectShow: (show, venue, today) =>
    set((state) => {
      const hidden = !matchesFilter(show, showFilterFrom(state, today));
      return {
        selectedVenueId: venue.id,
        selectedNeighbourhoodId: venue.neighbourhood,
        highlightedShowId: show.id,
        flyRequest: { lat: venue.lat, lon: venue.lon, zoom: theme.camera.venueZoom },
        ...(hidden ? { selectedGenre: null, dateFilter: ANY_DATE, priceFilter: null, ageFilter: null } : {}),
      };
    }),
  setHoveredVenue: (id) => set({ hoveredVenueId: id }),
  closePanel: () => set({ selectedNeighbourhoodId: null, selectedVenueId: null, highlightedShowId: null }),
  setLoadState: (loadState) => set({ loadState }),
  setEvents: (events) => set({ events, eventsLoaded: true }),
  setGenre: (selectedGenre) => set({ selectedGenre }),
  setDateFilter: (dateFilter) => set({ dateFilter }),
  setPriceFilter: (priceFilter) => set({ priceFilter }),
  setAgeFilter: (ageFilter) => set({ ageFilter }),
}));

export type FilterChoices = Pick<MapState, 'selectedGenre' | 'dateFilter' | 'priceFilter' | 'ageFilter'>;

/** Turns the visitor's filter choices into the filter applied to listings. */
export function showFilterFrom(choices: FilterChoices, today: string): ShowFilter {
  const { selectedGenre, dateFilter, priceFilter, ageFilter } = choices;
  return { genre: selectedGenre, ...dateRangeFor(dateFilter, today), maxPrice: priceFilter, age: ageFilter };
}

/** True if any filter choice differs between two states. */
export function filterChoicesChanged(a: FilterChoices, b: FilterChoices): boolean {
  return a.selectedGenre !== b.selectedGenre || a.dateFilter !== b.dateFilter || a.priceFilter !== b.priceFilter || a.ageFilter !== b.ageFilter;
}
