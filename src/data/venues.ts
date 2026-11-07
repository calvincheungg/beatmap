import raw from './toronto_music_venues.csv?raw';
import { MIN_SEARCH_LENGTH, normalizeForSearch } from './search.ts';
import { parseVenues, type Venue } from './venueParser.ts';

export { parseVenues, safeWebsite, slugify, type Venue } from './venueParser.ts';

/** Edit src/data/toronto_music_venues.csv to change these. See the README. */
export const venues: Venue[] = parseVenues(raw);

const MAX_VENUE_RESULTS = 6;

/** Venues by name, ignoring a leading "The". Names starting with the search come first. */
export function searchVenues(query: string, from: Venue[] = venues, limit = MAX_VENUE_RESULTS): Venue[] {
  const wanted = normalizeForSearch(query).replace(/^the\s+/, '');
  if (wanted.length < MIN_SEARCH_LENGTH) return [];
  const comparable = (venue: Venue) => normalizeForSearch(venue.name).replace(/^the\s+/, '');
  const startsWith = (venue: Venue) => (comparable(venue).startsWith(wanted) ? 0 : 1);
  return from
    .filter((venue) => comparable(venue).includes(wanted))
    .sort((a, b) => startsWith(a) - startsWith(b))
    .slice(0, limit);
}

export function venuesIn(neighbourhoodId: string): Venue[] {
  return venues.filter((venue) => venue.neighbourhood === neighbourhoodId);
}
