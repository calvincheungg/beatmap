/**
 * Reads venues that sell on Showpass, through Showpass's public discovery API
 * (showpass.com/api/public/discovery). No key needed. Facts only: title, date, time, price range
 * from the ticket types, sold out or cancelled, and the Showpass page as the ticket link.
 *
 * Spotting a suitable site: an iframe from showpass.com/w/tickets/events/list/<venue id>/.
 */
import { decodeText, makeShow, torontoDateTime, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

const DISCOVERY = 'https://www.showpass.com/api/public/discovery/';
/** A safety limit on result pages. */
const MAX_PAGES = 10;

export interface ShowpassVenue {
  key: string;
  /** The venue's id on Showpass, from its widget's address. */
  showpassVenueId: number;
  venueId: string;
  defaults: VenueDefaults;
}

export const BURDOCK_MUSIC_HALL: ShowpassVenue = {
  key: 'burdock',
  showpassVenueId: 17330,
  venueId: 'burdock-music-hall',
  defaults: { category: 'Music' },
};

export const HUGHS_ROOM: ShowpassVenue = {
  key: 'hughs',
  showpassVenueId: 5705,
  venueId: 'hugh-s-room',
  defaults: { category: 'Music' },
};

/** Multi-show packages that Showpass lists alongside shows, like "November Folk Bundle". */
const NOT_A_SHOW = /\b(bundle|package|series pass|season pass|gift card|subscription|membership)\b/i;

export interface ShowpassEvent {
  slug?: string;
  name?: string;
  /** The start, as a UTC time. */
  starts_on?: string;
  date_time_to_be_determined?: boolean;
  frontend_details_url?: string;
  status?: string;
  sold_out?: boolean;
  inventory_sold_out?: boolean;
  venue?: { id?: number };
  sub_items?: { price?: string }[];
}

export function eventsUrl(venue: ShowpassVenue): string {
  return `${DISCOVERY}?venue__in=${venue.showpassVenueId}&page_size=50`;
}

/** Only the discovery API may be requested, including its own next-page links. */
export function isAllowedUrl(url: string): boolean {
  return url.startsWith(`${DISCOVERY}?`);
}

export function toShowEvents(events: ShowpassEvent[], venue: ShowpassVenue): ShowEvent[] {
  return events.flatMap((event): ShowEvent[] => {
    const name = decodeText(event.name ?? '');
    const start = new Date(event.starts_on ?? '');
    const url = event.frontend_details_url ?? '';
    if (!name || Number.isNaN(start.getTime()) || event.date_time_to_be_determined || !url.startsWith('https://')) return [];
    if (event.venue?.id !== venue.showpassVenueId || NOT_A_SHOW.test(name)) return [];
    const { date, time } = torontoDateTime(start);
    const prices = (event.sub_items ?? []).map((item) => Number.parseFloat(item.price ?? '')).filter((price) => Number.isFinite(price) && price > 0);
    const cancelled = /cancel/i.test(event.status ?? '');
    return [
      makeShow(
        {
          id: event.slug || url,
          name,
          date,
          time,
          status: cancelled ? 'cancelled' : event.sold_out || event.inventory_sold_out ? 'soldout' : undefined,
          url,
          venueId: venue.venueId,
          priceMin: prices.length > 0 ? Math.min(...prices) : null,
          priceMax: prices.length > 0 ? Math.max(...prices) : null,
        },
        venue.defaults,
      ),
    ];
  });
}

export function createFetch(venue: ShowpassVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, isAllowedUrl, options);
}

/** Reads every page of the venue's events. */
export async function fetchShows(venue: ShowpassVenue, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const events: ShowpassEvent[] = [];
  let next: string | null = eventsUrl(venue);
  for (let page = 1; next && page <= MAX_PAGES; page++) {
    const body = JSON.parse(await fetchPage(next, `events page ${page}`)) as { results?: ShowpassEvent[]; next?: string | null };
    events.push(...(body.results ?? []));
    next = body.next ?? null;
  }
  return toShowEvents(events, venue);
}
