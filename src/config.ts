import type { LonLatBounds } from './map/projection';

/** Area loaded in Milestone 1: downtown Toronto. */
export const MAP_BOUNDS: LonLatBounds = { west: -79.45, south: 43.62, east: -79.32, north: 43.69 };

/** The most detailed zoom in the Protomaps basemap. */
export const TILE_ZOOM = 15;

export const PMTILES_URL: string = import.meta.env.VITE_PMTILES_URL ?? '/data/gta.pmtiles';
