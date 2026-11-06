import raw from './toronto_music_venues.csv?raw';
import { parseVenues, type Venue } from './venueParser.ts';

export { parseVenues, safeWebsite, slugify, type Venue } from './venueParser.ts';

/** Edit src/data/toronto_music_venues.csv to change these. See the README. */
export const venues: Venue[] = parseVenues(raw);

export function venuesIn(neighbourhoodId: string): Venue[] {
  return venues.filter((venue) => venue.neighbourhood === neighbourhoodId);
}
