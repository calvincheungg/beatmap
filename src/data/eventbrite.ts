/**
 * Reads events at venues that sell tickets on Eventbrite, through Eventbrite's official API
 * (v3, "list events by venue"). Needs a free private token, kept in EVENTBRITE_TOKEN. The token
 * goes in a header only, never in an address, and never appears in errors.
 *
 * Facts kept: title, date, time, price range, sold out or cancelled, and the Eventbrite page as
 * the ticket link. Descriptions and images are left behind.
 */
import { classifyShow, type Category } from './categories.ts';
import type { ShowEvent } from './ticketmaster.ts';

const API = 'https://www.eventbriteapi.com/v3';
/** Eventbrite's category id for music. */
const MUSIC_CATEGORY = '103';
/** A safety limit on result pages per venue. */
const MAX_PAGES = 10;

export interface EventbriteVenue {
  /** A short name for the event source, like "lula". */
  key: string;
  /**
   * The venue's ids on Eventbrite. A venue can have several records, one per organizer setup.
   * Find them from an event's id: GET /v3/events/{id}/ gives venue_id.
   */
  eventbriteVenueIds: string[];
  /** The venue's id in src/data/toronto_music_venues.csv. */
  venueId: string;
  /** What shows count as when the title rules can't tell, like Comedy at a comedy club. */
  defaultCategory?: Category;
}

export const LULA_LOUNGE: EventbriteVenue = {
  key: 'lula',
  // Both records are Lula Lounge at 1585 Dundas St W, used by the same organizer.
  eventbriteVenueIds: ['30994669', '247689783'],
  venueId: 'lula-lounge',
};

/** SoCap Comedy (The Social Capital Theatre), 154 Danforth Ave. It has no website of its own. */
export const SOCAP_COMEDY: EventbriteVenue = {
  key: 'socap',
  // The theatre's own record, and one a promoter made for the same room.
  eventbriteVenueIds: ['99470539', '295416236'],
  venueId: 'socap-comedy',
  defaultCategory: 'Comedy',
};

interface Money {
  major_value?: string;
  currency?: string;
}

export interface ApiEvent {
  id?: string;
  name?: { text?: string };
  url?: string;
  start?: { local?: string };
  status?: string;
  category_id?: string | null;
  online_event?: boolean;
  is_free?: boolean;
  ticket_availability?: {
    is_sold_out?: boolean;
    minimum_ticket_price?: Money | null;
    maximum_ticket_price?: Money | null;
  };
}

interface ApiPage {
  events?: ApiEvent[];
  pagination?: { has_more_items?: boolean; page_number?: number };
}

/** One page of a venue record's events: live ones plus any cancelled. It pages by number, 50 at a time. */
export function venueEventsUrl(eventbriteVenueId: string, page = 1): string {
  const params = new URLSearchParams({ status: 'live,canceled', order_by: 'start_asc', expand: 'ticket_availability' });
  if (page > 1) params.set('page', String(page));
  return `${API}/venues/${encodeURIComponent(eventbriteVenueId)}/events/?${params}`;
}

function money(value: Money | null | undefined): number | null {
  const amount = Number.parseFloat(value?.major_value ?? '');
  // Zero is unknown, never free, as with the other sources.
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function statusOf(event: ApiEvent): string {
  if (event.status === 'canceled' || event.status === 'cancelled') return 'cancelled';
  return event.ticket_availability?.is_sold_out ? 'soldout' : 'onsale';
}

/** Turns API events into shows at the venue. Online events and incomplete records are skipped. */
export function toShowEvents(events: ApiEvent[], venue: EventbriteVenue): ShowEvent[] {
  return events
    .flatMap((event): ShowEvent[] => {
      const name = event.name?.text?.replace(/\s+/g, ' ').trim();
      const start = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(event.start?.local ?? '');
      if (!event.id || !name || !start || !event.url?.startsWith('https://') || event.online_event) return [];
      const priceMin = money(event.ticket_availability?.minimum_ticket_price);
      const priceMax = money(event.ticket_availability?.maximum_ticket_price);
      const kind = classifyShow(name);
      // Eventbrite says when an event is music, which titles like "Salsa Saturday" don't.
      const fallback = venue.defaultCategory ?? (event.category_id === MUSIC_CATEGORY ? 'Music' : null);
      const musical = kind.category === 'Other' && fallback ? { ...kind, category: fallback } : kind;
      return [
        {
          id: event.id,
          name,
          date: start[1]!,
          time: `${start[2]}:00`,
          status: statusOf(event),
          url: event.url,
          venueId: venue.venueId,
          ...musical,
          artists: [],
          priceMin,
          priceMax: priceMin === null ? null : Math.max(priceMax ?? priceMin, priceMin),
          currency: priceMin === null ? null : (event.ticket_availability?.minimum_ticket_price?.currency ?? 'CAD'),
          ageLabel: null,
          imageUrl: null,
          firstSeenAt: null,
        },
      ];
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

/** Reads every page of each of the venue's records. Stops at the first error. */
export async function fetchVenueEvents(venue: EventbriteVenue, token: string, fetcher: typeof fetch = fetch): Promise<ApiEvent[]> {
  if (venue.eventbriteVenueIds.length === 0) throw new Error(`${venue.key} has no Eventbrite venue id yet.`);
  const events = new Map<string, ApiEvent>();
  for (const id of venue.eventbriteVenueIds) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await fetcher(venueEventsUrl(id, page), { headers: { Authorization: `Bearer ${token}` } });
      // The token is only in the request's headers, so the status alone is safe to report.
      if (!response.ok) throw new Error(`Eventbrite returned ${response.status} for ${venue.key}. Stopping.`);
      const body = (await response.json()) as ApiPage;
      for (const event of body.events ?? []) if (event.id) events.set(event.id, event);
      if (!body.pagination?.has_more_items) break;
    }
  }
  return [...events.values()];
}
