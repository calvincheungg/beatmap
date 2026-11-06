import data from './neighbourhoods.json';
import { venues, type Venue } from './venues';

export interface Neighbourhood {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** The map zoom to show on arrival. */
  zoom: number;
}

/** The zoom for neighbourhoods that come only from the venue list. */
const DERIVED_ZOOM = 15;

/** Adds a search entry, centred on its venues, for any venue neighbourhood missing from the base list. */
export function withVenueNeighbourhoods(base: Neighbourhood[], from: Venue[]): Neighbourhood[] {
  const known = new Set(base.map((area) => area.id));
  const groups = new Map<string, Venue[]>();
  for (const venue of from) {
    if (known.has(venue.neighbourhood)) continue;
    groups.set(venue.neighbourhood, [...(groups.get(venue.neighbourhood) ?? []), venue]);
  }
  const derived = [...groups.entries()].map(([id, group]): Neighbourhood => ({
    id,
    name: group[0]!.neighbourhoodName,
    lat: group.reduce((sum, venue) => sum + venue.lat, 0) / group.length,
    lon: group.reduce((sum, venue) => sum + venue.lon, 0) / group.length,
    zoom: DERIVED_ZOOM,
  }));
  return [...base, ...derived];
}

export const neighbourhoods: Neighbourhood[] = withVenueNeighbourhoods(data, venues);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^the\s+/, '')
    .trim();
}

/** Matches on any part of the name, best first: names starting with the query, then the rest. */
export function searchNeighbourhoods(query: string, from: Neighbourhood[] = neighbourhoods): Neighbourhood[] {
  const wanted = normalize(query);
  if (!wanted) return from;
  const matches = from.filter((area) => normalize(area.name).includes(wanted));
  const startsWith = (area: Neighbourhood) => (normalize(area.name).startsWith(wanted) ? 0 : 1);
  return [...matches].sort((a, b) => startsWith(a) - startsWith(b));
}

export function findNeighbourhood(id: string | null): Neighbourhood | undefined {
  return neighbourhoods.find((area) => area.id === id);
}
