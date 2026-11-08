/**
 * Reads companies that sell tickets on Arts People (app.arts-people.com), a box office used by many
 * community and small theatres. The organization's box-office page lists its productions; each
 * production's page lists its performances, prices, and which are sold out. Facts only: the
 * production's name, each performance's date and time, the price range and status, with the
 * production page as the ticket link. Descriptions and images are never stored.
 *
 * Spotting a suitable site: ticket links to app.arts-people.com/index.php?ticketing=<code>.
 */
import { decodeText, makeShow, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

const SITE = 'https://app.arts-people.com/';

export interface ArtsPeopleVenue {
  key: string;
  /** The organization's code in Arts People's addresses, like "tscar". */
  organization: string;
  venueId: string;
  defaults: VenueDefaults;
}

export const SCARBOROUGH_VILLAGE_THEATRE: ArtsPeopleVenue = {
  key: 'svt',
  organization: 'tscar',
  venueId: 'scarborough-village-theatre',
  // Theatre Scarborough is a theatre company, so unplaced titles are plays and musicals.
  defaults: { category: 'Theatre' },
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** A safety limit on productions read per run. */
const MAX_PRODUCTIONS = 40;

export function listingUrl(venue: ArtsPeopleVenue): string {
  return `${SITE}index.php?ticketing=${venue.organization}`;
}

export function productionUrl(id: string): string {
  return `${SITE}?show=${id}`;
}

/** Only the box-office listing and production pages may be requested, never checkout or seats. */
export function isAllowedUrl(venue: ArtsPeopleVenue, url: string): boolean {
  return url === listingUrl(venue) || /^https:\/\/app\.arts-people\.com\/\?show=\d+$/.test(url);
}

/** The production ids the box-office page links to, in order. */
export function readProductionIds(html: string): string[] {
  return [...new Set([...html.matchAll(/href="\/\?show=(\d+)"/g)].map((match) => match[1]!))];
}

/** "Sat, Nov 7th, 2026 at 8:00 pm" as a date and 24-hour time. */
export function parsePerformance(text: string): { date: string; time: string | null } | null {
  const match = /([a-z]{3})[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})(?: at (\d{1,2}):(\d{2}) ?([ap])\.?m)?/i.exec(text);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]!.toLowerCase());
  if (month < 0) return null;
  const date = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
  if (!match[4]) return { date, time: null };
  const hours = (Number(match[4]) % 12) + (match[6]!.toLowerCase() === 'p' ? 12 : 0);
  return { date, time: `${String(hours).padStart(2, '0')}:${match[5]}:00` };
}

/** One production page's performances. */
export function readProduction(html: string, id: string, venue: ArtsPeopleVenue, today: string): ShowEvent[] {
  const name = decodeText(/<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? '');
  if (!name) return [];
  // The performance list starts at its table, whose id the page writes in capitals.
  const listStart = html.search(/id="TBLperformances"/i);
  if (listStart < 0) return [];
  const text = decodeText(html.slice(listStart).replace(/<[^>]+>/g, ' '));
  // Prices follow the performances, like "Regular - $34". The fee note has no dash before its amount.
  const prices = [...text.matchAll(/-\s*\$(\d+(?:\.\d{2})?)/g)].map((match) => Number(match[1])).filter((price) => price > 0);
  // Each performance's status note sits between its date and the next one.
  const dates = [...text.matchAll(/[A-Z][a-z]{2}, [A-Z][a-z]{2}\.? \d{1,2}(?:st|nd|rd|th)?, \d{4}(?: at \d{1,2}:\d{2} ?[ap]m)?/g)];
  const rows = dates.map((match, index) => text.slice(match.index, dates[index + 1]?.index ?? text.length));
  return rows.flatMap((row): ShowEvent[] => {
    const when = parsePerformance(row);
    if (!when || when.date < today) return [];
    const status = /\*see below/i.test(row) ? 'soldout' : /no longer on sale online/i.test(row) ? 'offsale' : undefined;
    return [
      makeShow(
        {
          id: `${id}@${when.date}${when.time ? `T${when.time}` : ''}`,
          name,
          date: when.date,
          time: when.time,
          status,
          url: productionUrl(id),
          venueId: venue.venueId,
          priceMin: prices.length > 0 ? Math.min(...prices) : null,
          priceMax: prices.length > 0 ? Math.max(...prices) : null,
        },
        venue.defaults,
      ),
    ];
  });
}

export function createFetch(venue: ArtsPeopleVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

export async function fetchShows(venue: ArtsPeopleVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const ids = readProductionIds(await fetchPage(listingUrl(venue), 'the box office')).slice(0, MAX_PRODUCTIONS);
  if (ids.length === 0) throw new Error(`${venue.key}'s box office lists no productions (a new layout?). Stopping.`);
  const shows: ShowEvent[] = [];
  for (const id of ids) shows.push(...readProduction(await fetchPage(productionUrl(id), `production ${id}`), id, venue, today));
  return shows;
}
