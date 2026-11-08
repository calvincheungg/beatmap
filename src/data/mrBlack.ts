/**
 * Reads venues that sell tickets and tables through Mr Black (buy.mrblackapp.com), from the public
 * list of upcoming nights its calendar page uses. Facts only: the night's name, date, start time and
 * lowest ticket price. Descriptions and images are never stored.
 *
 * Spotting a suitable site: links to buy.mrblackapp.com/calendar/<number>. That number is the venue id.
 */
import { decodeText, dollarAmounts, makeShow, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

const API = 'https://buy.mrblackapp.com/api/v1/venue/';
/** The API's own page size. */
const PAGE_SIZE = 10;
/** Weekly nights repeat without end, so reading stops at nights this far ahead. */
const DAYS_AHEAD = 90;
/** A safety limit on result pages. */
const MAX_PAGES = 12;

export interface MrBlackVenue {
  key: string;
  /** Mr Black's number for the venue, from its calendar link. */
  mrBlackId: number;
  venueId: string;
  defaults: VenueDefaults;
}

export const FUTURE: MrBlackVenue = {
  key: 'future',
  mrBlackId: 8769,
  venueId: 'future',
  defaults: { category: 'Music' },
};

export interface MrBlackEvent {
  id?: number;
  name?: string;
  /** YYYY-MM-DD, in the venue's time. */
  date?: string;
  /** HH:mm. */
  startsAt?: string;
  deleted?: boolean;
  hiddenFromCalendar?: boolean;
  /** A weekly night. Its id is the same every week. */
  repeatable?: boolean;
  /** Whether tickets are sold, as opposed to guest list and tables only. */
  ticketsEvent?: boolean;
  /** Like "$30.00". "$0.00" when there's no ticket price. */
  minPrice?: string;
}

export function eventsUrl(venue: MrBlackVenue, page = 0): string {
  return `${API}${venue.mrBlackId}/upcoming/events/webform?fromWeb=true&pageIndex=${page}&pageSize=${PAGE_SIZE}`;
}

/** The calendar page, where visitors buy tickets. */
export function calendarUrl(venue: MrBlackVenue): string {
  return `https://buy.mrblackapp.com/calendar/${venue.mrBlackId}`;
}

/** Only the venue's list of upcoming nights may be requested. */
export function isAllowedUrl(venue: MrBlackVenue, url: string): boolean {
  const prefix = `${API}${venue.mrBlackId}/upcoming/events/webform?fromWeb=true&pageIndex=`;
  return url.startsWith(prefix) && new RegExp(`^\\d+&pageSize=${PAGE_SIZE}$`).test(url.slice(prefix.length));
}

function addDays(date: string, days: number): string {
  const when = new Date(`${date}T12:00:00Z`);
  when.setUTCDate(when.getUTCDate() + days);
  return when.toISOString().slice(0, 10);
}

/**
 * Turns nights from today on into shows. A weekly night with no tickets on sale, like "Alive
 * Saturdays", is the club's standing guest-list night rather than a show, so it's left out.
 */
export function toShowEvents(events: MrBlackEvent[], venue: MrBlackVenue, today: string): ShowEvent[] {
  return events.flatMap((event): ShowEvent[] => {
    const name = decodeText(event.name ?? '');
    const date = event.date ?? '';
    if (!event.id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return [];
    if (event.deleted || event.hiddenFromCalendar || (event.repeatable && !event.ticketsEvent)) return [];
    const time = /^(\d{2}):(\d{2})$/.exec(event.startsAt ?? '');
    const prices = dollarAmounts(event.minPrice ?? '');
    return [
      makeShow(
        {
          // A weekly night keeps its id, so the date tells the weeks apart.
          id: `${event.id}-${date}`,
          name,
          date,
          time: time ? `${time[1]}:${time[2]}:00` : null,
          url: calendarUrl(venue),
          venueId: venue.venueId,
          // The lowest price only. The highest isn't published.
          priceMin: prices[0] ?? null,
          priceMax: prices[0] ?? null,
        },
        venue.defaults,
      ),
    ];
  });
}

export function createFetch(venue: MrBlackVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

/** Reads pages of upcoming nights until they pass the window ahead or run out. */
export async function fetchShows(venue: MrBlackVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const last = addDays(today, DAYS_AHEAD);
  const events: MrBlackEvent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const body: unknown = JSON.parse(await fetchPage(eventsUrl(venue, page), `nights page ${page + 1}`));
    if (!Array.isArray(body)) throw new Error(`${venue.key}: Mr Black sent something other than a list of nights. Stopping.`);
    const nights = body as MrBlackEvent[];
    events.push(...nights.filter((night) => (night.date ?? '') <= last));
    if (nights.length < PAGE_SIZE || nights.some((night) => (night.date ?? '') > last)) break;
  }
  return toShowEvents(events, venue, today);
}
