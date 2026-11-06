import type { LonLatBounds } from './map/projection';

/** The area users can reach. Must fit inside the extract made by scripts/fetch-data.sh. */
export const MAP_BOUNDS: LonLatBounds = { west: -79.9, south: 43.47, east: -78.97, north: 44 };

export const PMTILES_URL: string = import.meta.env.VITE_PMTILES_URL ?? '/data/gta.pmtiles';
