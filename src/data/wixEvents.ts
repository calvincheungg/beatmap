/**
 * Reads venues whose Wix sites list shows with the Wix Events widget, from the event data the
 * widget embeds in the page. Facts only: title, start time, cancelled, price range when Wix sells
 * the tickets, and a ticket link (the external one when the venue sells elsewhere, the event's Wix
 * page when it has one, otherwise the venue's listing page).
 *
 * Spotting a suitable site: "events-viewer" scripts from static.parastorage.com, and the page source
 * holding events with "scheduling", "slug" and "registration".
 */
import { decodeText, dollarAmounts, makeShow, torontoDateTime, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export interface WixVenue {
  key: string;
  /** The page that shows the events widget. */
  listingUrl: string;
  /** Text the event's address must contain, so events elsewhere are skipped. */
  addressIncludes: string;
  venueId: string;
  defaults: VenueDefaults;
}

export const THE_CAMERON_HOUSE: WixVenue = {
  key: 'cameron',
  listingUrl: 'https://www.thecameron.com/shows',
  addressIncludes: '408 Queen',
  venueId: 'the-cameron-house',
  defaults: { category: 'Music' },
};

/** Wix's event status for a cancelled event. */
const CANCELLED = 3;
/**
 * Wix's registration type for tickets sold through Wix. Other types (walk-in, or tickets sold
 * elsewhere) still carry a "sold out" flag that means nothing, so it's only trusted for this one.
 */
const WIX_TICKETS = 2;

export interface WixEvent {
  id?: string;
  title?: string;
  slug?: string;
  status?: number;
  scheduling?: { config?: { scheduleTbd?: boolean; startDate?: string } };
  location?: { address?: string };
  eventPageUrl?: { base?: string; path?: string };
  registration?: {
    type?: number;
    external?: { registration?: string };
    ticketing?: { lowestPrice?: string; highestPrice?: string; soldOut?: boolean };
  };
}

export function isAllowedUrl(venue: WixVenue, url: string): boolean {
  return url === venue.listingUrl;
}

/** Finds the end of a JSON array in page text, skipping brackets inside strings. */
function arrayEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '[') depth++;
    else if (char === ']' && --depth === 0) return i;
  }
  return -1;
}

/** Every event in the widget data embedded in a page, without duplicates. */
export function readEvents(html: string): WixEvent[] {
  const events = new Map<string, WixEvent>();
  for (const match of html.matchAll(/"events":\[/g)) {
    const start = match.index! + match[0].length - 1;
    const end = arrayEnd(html, start);
    if (end < 0) continue;
    try {
      const list = JSON.parse(html.slice(start, end + 1)) as unknown[];
      for (const item of list) {
        const event = item as WixEvent;
        if (event && typeof event === 'object' && event.id && event.scheduling) events.set(event.id, event);
      }
    } catch {
      // Not every "events" array in a page is event data.
    }
  }
  return [...events.values()];
}

/** Turns widget events from today on into shows at the venue. */
export function toShowEvents(events: WixEvent[], venue: WixVenue, today: string): ShowEvent[] {
  return events.flatMap((event): ShowEvent[] => {
    const name = decodeText(event.title ?? '');
    const start = new Date(event.scheduling?.config?.startDate ?? '');
    if (!event.id || !name || event.scheduling?.config?.scheduleTbd || Number.isNaN(start.getTime())) return [];
    if (!(event.location?.address ?? '').toLowerCase().includes(venue.addressIncludes.toLowerCase())) return [];
    const { date, time } = torontoDateTime(start);
    if (date < today) return [];
    const external = event.registration?.external?.registration;
    const page = event.eventPageUrl?.base && event.eventPageUrl.path ? `${event.eventPageUrl.base}${event.eventPageUrl.path}` : null;
    const url = [external, page].find((link): link is string => typeof link === 'string' && link.startsWith('https://')) ?? venue.listingUrl;
    const ticketing = event.registration?.type === WIX_TICKETS ? event.registration.ticketing : undefined;
    const prices = dollarAmounts(`${ticketing?.lowestPrice ?? ''} ${ticketing?.highestPrice ?? ''}`);
    return [
      makeShow(
        {
          id: event.id,
          name,
          date,
          time,
          status: event.status === CANCELLED ? 'cancelled' : ticketing?.soldOut ? 'soldout' : undefined,
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

export function createFetch(venue: WixVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

export async function fetchShows(venue: WixVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const events = readEvents(await fetchPage(venue.listingUrl, 'the listing'));
  if (events.length === 0) throw new Error(`${venue.key}'s page has no events widget data (a new layout?). Stopping.`);
  return toShowEvents(events, venue, today);
}
