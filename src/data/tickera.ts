/**
 * Reads venues whose WordPress sites sell tickets with the Tickera plugin (show pages at
 * /tc-events/<name>/). A listing page links each show with its date; each show's page gives the
 * full name, the date and time, and the ticket table's prices. Facts only: descriptions and
 * images are never stored. Past shows are skipped before their pages are requested.
 *
 * Spotting a suitable site: links to /tc-events/ and "tc_event_date" in a show page's source.
 */
import { decodeText, dollarAmounts, makeShow, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export interface TickeraVenue {
  key: string;
  /** The site's address, ending in a slash. */
  siteUrl: string;
  /** The page that lists every upcoming show with its date. */
  listingUrl: string;
  venueId: string;
  defaults: VenueDefaults;
  /** Phrases removed from show names, like "returns to the Linsmore Tavern!". */
  nameTrims: RegExp[];
}

export const LINSMORE_TAVERN: TickeraVenue = {
  key: 'linsmore',
  siteUrl: 'https://www.linsmoretavern.com/',
  listingUrl: 'https://www.linsmoretavern.com/',
  venueId: 'linsmore-tavern',
  defaults: { category: 'Music' },
  nameTrims: [/\s*[-–,:]?\s*\b(?:returns? to|live at|brings the party to|at)\s+the\s+linsmore\b.*$/i, /\s*[-–,:]?\s*\blive at the linsmore\b.*$/i],
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** A safety limit on show pages read per run. */
const MAX_SHOWS = 60;

export interface ListedShow {
  url: string;
  /** From the listing, as YYYY-MM-DD, so past shows can be skipped. Null when the listing has none. */
  date: string | null;
}

export function isAllowedUrl(venue: TickeraVenue, url: string): boolean {
  return url === venue.listingUrl || new RegExp(`^${venue.siteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}tc-events/[a-z0-9-]+/$`, 'i').test(url);
}

/** The show links on the listing, each with the date shown next to it (day.month.year). */
export function readListing(html: string, venue: TickeraVenue): ListedShow[] {
  const shows = new Map<string, ListedShow>();
  for (const block of html.split(/<date>/i).slice(1)) {
    const date = /^(\d{2})\.(\d{2})\.(\d{4})<\/date>/.exec(block);
    const link = /href="([^"]+\/tc-events\/[^"]+\/)"/.exec(block)?.[1];
    if (!link || !isAllowedUrl(venue, link) || shows.has(link)) continue;
    shows.set(link, { url: link, date: date ? `${date[3]}-${date[2]}-${date[1]}` : null });
  }
  return [...shows.values()];
}

/** "November 6, 2026 9:30 pm" as a date and 24-hour time. */
export function parseWhen(text: string): { date: string; time: string | null } | null {
  const match = /([a-z]+) (\d{1,2}),? (\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([ap])\.?m)?/i.exec(text);
  const month = MONTHS.indexOf(match?.[1]?.toLowerCase() ?? '');
  if (!match || month < 0) return null;
  const date = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
  if (!match[4]) return { date, time: null };
  const hours = (Number(match[4]) % 12) + (match[6]!.toLowerCase() === 'p' ? 12 : 0);
  return { date, time: `${String(hours).padStart(2, '0')}:${match[5]}:00` };
}

/** One show page. Names are trimmed of the venue's stock phrases. */
export function readShowPage(html: string, url: string, venue: TickeraVenue, today: string): ShowEvent | null {
  const fullName = decodeText(/<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? '');
  const name = venue.nameTrims.reduce((text, trim) => text.replace(trim, ''), fullName).trim() || fullName;
  const when = parseWhen(decodeText(/class="tc_event_date_title_front"[^>]*>(?:<[^>]+>)*([^<]+)</.exec(html)?.[1] ?? ''));
  if (!name || !when || when.date < today) return null;
  // The ticket table follows its "Ticket Type | Price" heading. Its prices are the show's.
  const tableStart = html.search(/ticket type/i);
  const table = tableStart >= 0 ? decodeText(html.slice(tableStart, tableStart + 4000).replace(/<[^>]+>/g, ' ')) : '';
  const prices = dollarAmounts(table.replace(/\$\s+(\d)/g, '$$$1'));
  const soldOut = /sold out/i.test(table) && !/add to cart/i.test(table);
  return makeShow(
    {
      id: url.slice(venue.siteUrl.length),
      name,
      date: when.date,
      time: when.time,
      status: soldOut ? 'soldout' : undefined,
      url,
      venueId: venue.venueId,
      priceMin: prices.length > 0 ? Math.min(...prices) : null,
      priceMax: prices.length > 0 ? Math.max(...prices) : null,
    },
    venue.defaults,
  );
}

export function createFetch(venue: TickeraVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

export async function fetchShows(venue: TickeraVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const listed = readListing(await fetchPage(venue.listingUrl, 'the listing'), venue);
  if (listed.length === 0) throw new Error(`${venue.key}'s listing links to no shows (a new layout?). Stopping.`);
  const upcoming = listed.filter((show) => show.date === null || show.date >= today).slice(0, MAX_SHOWS);
  const shows: ShowEvent[] = [];
  for (const { url } of upcoming) {
    const show = readShowPage(await fetchPage(url, url.slice(venue.siteUrl.length)), url, venue, today);
    if (show) shows.push(show);
  }
  return shows;
}
