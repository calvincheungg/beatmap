/**
 * Reads venues whose WordPress sites use The Events Calendar plugin, through the plugin's public
 * REST API (/wp-json/tribe/events/v1/events), which exists to share events. Facts only: title,
 * date, time, price when given, and the event's page as the link.
 *
 * Spotting a suitable site: links to /wp-json/tribe/events/v1/ or an "?ical=1" feed, and
 * "tribe-events" all through the page source.
 */
import { ageFrom, decodeText, dollarAmounts, makeShow, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export interface TribeVenue {
  key: string;
  /** The site's address, ending in a slash. */
  siteUrl: string;
  venueId: string;
  defaults: VenueDefaults;
  /** Words the site adds to every title, like Wiggle Room's "| 4AM LAST CALL |", removed with their separators. */
  titleNoise?: RegExp;
}

export const JAZZ_BISTRO: TribeVenue = {
  key: 'jazzbistro',
  siteUrl: 'https://jazzbistro.ca/',
  venueId: 'jazz-bistro',
  defaults: { category: 'Music', genre: 'Jazz' },
};

export const GROSSMANS_TAVERN: TribeVenue = {
  key: 'grossmans',
  siteUrl: 'https://grossmanstavern.com/',
  venueId: 'grossman-s-tavern',
  // Toronto's long-running blues bar.
  defaults: { category: 'Music', genre: 'Blues' },
};

export const JUNCTION_UNDERGROUND: TribeVenue = {
  key: 'junction',
  siteUrl: 'https://junctionunderground.ca/',
  venueId: 'junction-underground',
  defaults: { category: 'Music' },
};

export const CASTROS_LOUNGE: TribeVenue = {
  key: 'castros',
  siteUrl: 'https://castroslounge.com/',
  venueId: 'castro-s-lounge',
  defaults: { category: 'Music' },
};

export const WIGGLE_ROOM: TribeVenue = {
  key: 'wiggle',
  siteUrl: 'https://wiggleroomtoronto.com/',
  venueId: 'wiggle-room',
  // A late-night DJ club.
  defaults: { category: 'Music' },
  titleNoise: /4\s*AM\s+LAST\s+CALL/gi,
};

/** Removes a venue's title noise, then any separators left dangling at either end. */
export function cleanTitle(title: string, noise: RegExp | undefined): string {
  if (!noise) return title;
  return title
    .replace(noise, '')
    .replace(/(\s*\|\s*){2,}/g, ' | ')
    .replace(/^[\s|]+|[\s|]+$/g, '');
}

/** A safety limit on result pages. */
const MAX_PAGES = 10;

export interface TribeEvent {
  id?: number;
  title?: string;
  url?: string;
  start_date?: string;
  all_day?: boolean;
  cost?: string;
  cost_details?: { values?: (string | number)[] };
  hide_from_listings?: boolean;
  status?: string;
}

interface TribePage {
  events?: TribeEvent[];
  total_pages?: number;
}

export function eventsUrl(venue: TribeVenue, today: string, page = 1): string {
  const params = new URLSearchParams({ start_date: today, per_page: '50' });
  if (page > 1) params.set('page', String(page));
  return `${venue.siteUrl}wp-json/tribe/events/v1/events?${params}`;
}

/** Only the events API may be requested. */
export function isAllowedUrl(venue: TribeVenue, url: string): boolean {
  return url.startsWith(`${venue.siteUrl}wp-json/tribe/events/v1/events?`);
}

export function toShowEvents(events: TribeEvent[], venue: TribeVenue): ShowEvent[] {
  return events.flatMap((event): ShowEvent[] => {
    const start = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(event.start_date ?? '');
    const name = cleanTitle(decodeText(event.title ?? ''), venue.titleNoise);
    if (!event.id || !start || !name || !event.url?.startsWith('https://') || event.hide_from_listings || event.status !== 'publish') return [];
    const values = (event.cost_details?.values ?? []).map(Number).filter((value) => Number.isFinite(value) && value > 0);
    // Some sites encode the dollar sign, like "&#036;5.00".
    const cost = decodeText(event.cost ?? '');
    const prices = values.length > 0 ? values : dollarAmounts(cost);
    return [
      makeShow(
        {
          id: String(event.id),
          name,
          date: start[1]!,
          time: event.all_day ? null : `${start[2]}:00`,
          url: event.url,
          venueId: venue.venueId,
          priceMin: prices.length > 0 ? Math.min(...prices) : null,
          priceMax: prices.length > 0 ? Math.max(...prices) : null,
          ageLabel: ageFrom(cost),
        },
        venue.defaults,
      ),
    ];
  });
}

export function createFetch(venue: TribeVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

/** Reads every page of upcoming events from today. */
export async function fetchShows(venue: TribeVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const events: TribeEvent[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = JSON.parse(await fetchPage(eventsUrl(venue, today, page), `events page ${page}`)) as TribePage;
    events.push(...(body.events ?? []));
    if (page >= (body.total_pages ?? 1)) break;
  }
  return toShowEvents(events, venue);
}
