/** A rectangle in degrees. */
export interface LonLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Where the map opens: downtown Toronto. */
export const MAP_CENTER = { lat: 43.6532, lon: -79.3832 } as const;

/** The area users can reach. Must fit inside the extract made by scripts/fetch-data.sh. */
export const MAP_BOUNDS: LonLatBounds = { west: -79.9, south: 43.47, east: -78.97, north: 44 };

/** Written by scripts/fetch-events.ts. */
export const EVENTS_URL = '/data/events.json';

export const PMTILES_URL: string = import.meta.env.VITE_PMTILES_URL ?? '/data/gta.pmtiles';
