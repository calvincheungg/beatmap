/**
 * Reads venues that sell through Admit One, using the public embed API that venue websites use to
 * show their listings (gateway.admitone.com/embed/live-events). No key needed. Facts only: title,
 * date, time, price range, age, sold out or cancelled, and the Admit One page as the ticket link.
 *
 * Spotting a suitable site: it loads a script from admitone-master-bucket...fetchEvents.js, and its
 * page sets locationSettings.venue to the Admit One venue ids.
 */
import { ageFrom, decodeText, dollarAmounts, makeShow, torontoDateTime, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

const EMBED = 'https://gateway.admitone.com/embed/live-events';

export interface AdmitOneVenue {
  key: string;
  /** The venue's ids on Admit One, as its own website passes them. */
  admitOneVenueIds: string[];
  /** The venue name Admit One gives its events, so other venues' events are skipped. */
  venueName: string;
  venueId: string;
  defaults: VenueDefaults;
}

export const ADELAIDE_HALL: AdmitOneVenue = {
  key: 'adelaide',
  admitOneVenueIds: ['64a4349ec147b8570f9e83fc', '5f2c38d9b49c224648301825', '6182ec572490d0ef56a4adbe', '6201607c4ece4990eeeb6a3c'],
  venueName: 'Adelaide Hall',
  venueId: 'adelaide-hall',
  defaults: { category: 'Music' },
};

export const QUEEN_ELIZABETH_THEATRE: AdmitOneVenue = {
  key: 'qet',
  admitOneVenueIds: [
    '60ad698c2a3c42001744a78f',
    '6a676533dd7a4bead76b39b7',
    '5f2c38d9b49c22464830180a',
    '5fff3fc4252a3e0017753b8c',
    '60ad698c2a3c42001744a78d',
    '623a293401b1e63c3d61094c',
    '68fa6d3c1dff5fce0420bf70',
  ],
  venueName: 'Queen Elizabeth Theatre',
  venueId: 'queen-elizabeth-theatre',
  defaults: { category: 'Music' },
};

export interface AdmitOneEvent {
  title?: string;
  venue?: string;
  url?: string;
  /** The start, as a UTC time. */
  sort_date?: string;
  age_limit?: string;
  price_range?: string;
  sold_out?: boolean;
  cancelled?: boolean;
}

export function eventsUrl(venue: AdmitOneVenue): string {
  return `${EMBED}?venueId=${venue.admitOneVenueIds.join(',')}`;
}

export function isAllowedUrl(url: string): boolean {
  return url.startsWith(`${EMBED}?venueId=`);
}

export function toShowEvents(events: AdmitOneEvent[], venue: AdmitOneVenue): ShowEvent[] {
  return events.flatMap((event): ShowEvent[] => {
    const name = decodeText(event.title ?? '');
    const start = new Date(event.sort_date ?? '');
    if (!name || Number.isNaN(start.getTime()) || !event.url?.startsWith('https://')) return [];
    if (decodeText(event.venue ?? '').toLowerCase() !== venue.venueName.toLowerCase()) return [];
    const { date, time } = torontoDateTime(start);
    const prices = dollarAmounts(event.price_range ?? '');
    return [
      makeShow(
        {
          // Admit One's event pages end in the event's number.
          id: /-(\d+)\/?$/.exec(event.url)?.[1] ?? event.url,
          name,
          date,
          time,
          status: event.cancelled ? 'cancelled' : event.sold_out ? 'soldout' : undefined,
          url: event.url,
          venueId: venue.venueId,
          priceMin: prices.length > 0 ? Math.min(...prices) : null,
          priceMax: prices.length > 0 ? Math.max(...prices) : null,
          ageLabel: ageFrom(event.age_limit ?? ''),
        },
        venue.defaults,
      ),
    ];
  });
}

export function createFetch(venue: AdmitOneVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, isAllowedUrl, options);
}

export async function fetchShows(venue: AdmitOneVenue, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const body = JSON.parse(await fetchPage(eventsUrl(venue), 'live events')) as { events?: AdmitOneEvent[] };
  return toShowEvents(body.events ?? [], venue);
}
