/**
 * Reads venues that list shows in an Elfsight Event Calendar widget, through the widget's public
 * data (core.service.elfsight.com/p/boot). Facts only: title, date, time, and the price and age
 * found in the event's note (like "19+ · $10 @ Door"). The note itself and images are never stored.
 *
 * Spotting a suitable site: an "elfsight-app-<id>" element and apps.elfsight.com/p/platform.js.
 */
import type { Category } from './categories.ts';
import { ageFrom, decodeText, dollarAmounts, makeShow, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

const BOOT = 'https://core.service.elfsight.com/p/boot/';

export interface ElfsightVenue {
  key: string;
  widgetId: string;
  /** Where visitors go for tickets and details, since these events have no pages of their own. */
  siteUrl: string;
  venueId: string;
  defaults: VenueDefaults;
  /** Calendar event types that aren't shows, like classes or exhibitions, by the names the calendar gives them. */
  skipTypes?: string[];
  /** The category for events of a type, like Film, when the title doesn't say. */
  typeCategories?: Record<string, Category>;
}

export const BOVINE_SEX_CLUB: ElfsightVenue = {
  key: 'bovine',
  widgetId: '235dbcca-3a0a-4622-a874-ce1dd5f36933',
  siteUrl: 'https://www.bovinesexclub.com/',
  venueId: 'bovine-sex-club',
  defaults: { category: 'Music' },
};

/** A cultural centre: concerts, films and festivals, but also classes, clubs and exhibitions, which are left out. */
export const JAPANESE_CANADIAN_CULTURAL_CENTRE: ElfsightVenue = {
  key: 'jccc',
  widgetId: 'c67f7d51-02a2-4530-b8a5-b5190c200231',
  siteUrl: 'https://jccc.on.ca/',
  venueId: 'japanese-canadian-cultural-centre',
  defaults: { category: 'Other' },
  skipTypes: ['Programs', 'Exhibition', 'Facility', 'Registration', 'Announcement'],
  typeCategories: { Film: 'Film' },
};

export interface ElfsightEvent {
  id?: string;
  name?: string;
  start?: { date?: string; time?: string };
  repeatPeriod?: string;
  description?: string;
  isAllDay?: boolean;
  actions?: { link?: { value?: string } | string }[];
  /** Ids of the calendar's event types. */
  eventType?: string[];
}

/** The calendar's event types, from id to name. */
export function readEventTypes(body: unknown, venue: ElfsightVenue): Map<string, string> {
  const widget = (body as { data?: { widgets?: Record<string, { data?: { settings?: { eventTypes?: unknown } } }> } })?.data?.widgets?.[venue.widgetId];
  const types = widget?.data?.settings?.eventTypes;
  if (!Array.isArray(types)) return new Map();
  return new Map(
    types.flatMap((type: { id?: unknown; name?: unknown }) => (typeof type?.id === 'string' && typeof type.name === 'string' ? [[type.id, type.name] as const] : [])),
  );
}

export function bootUrl(venue: ElfsightVenue): string {
  return `${BOOT}?w=${venue.widgetId}`;
}

export function isAllowedUrl(url: string): boolean {
  return /^https:\/\/core\.service\.elfsight\.com\/p\/boot\/\?w=[0-9a-f-]+$/.test(url);
}

/** Finds the calendar's events in the widget data. */
export function readEvents(body: unknown, venue: ElfsightVenue): ElfsightEvent[] {
  const widget = (body as { data?: { widgets?: Record<string, { data?: { settings?: { events?: unknown } } }> } })?.data?.widgets?.[venue.widgetId];
  const events = widget?.data?.settings?.events;
  return Array.isArray(events) ? (events as ElfsightEvent[]) : [];
}

function actionLink(event: ElfsightEvent): string | null {
  for (const action of event.actions ?? []) {
    const link = typeof action.link === 'string' ? action.link : action.link?.value;
    if (link?.startsWith('https://')) return link;
  }
  return null;
}

/**
 * Turns calendar events from today on into shows. Repeating events are skipped, since venues list
 * each show separately and a repeat rule could put shows on the map that won't happen.
 */
export function toShowEvents(events: ElfsightEvent[], venue: ElfsightVenue, today: string, types: Map<string, string> = new Map()): ShowEvent[] {
  return events.flatMap((event): ShowEvent[] => {
    const name = decodeText(event.name ?? '');
    const date = event.start?.date ?? '';
    if (!event.id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return [];
    if (event.repeatPeriod && event.repeatPeriod !== 'noRepeat') return [];
    const typeNames = (event.eventType ?? []).flatMap((id) => types.get(id) ?? []);
    if (typeNames.some((type) => venue.skipTypes?.includes(type))) return [];
    const typeCategory = typeNames.map((type) => venue.typeCategories?.[type]).find((category) => category !== undefined);
    const note = decodeText((event.description ?? '').replace(/<[^>]+>/g, ' '));
    const prices = dollarAmounts(note);
    const time = /^(\d{2}):(\d{2})$/.exec(event.start?.time ?? '');
    return [
      makeShow(
        {
          id: event.id,
          name,
          date,
          time: time && !event.isAllDay ? `${time[1]}:${time[2]}:00` : null,
          url: actionLink(event) ?? venue.siteUrl,
          venueId: venue.venueId,
          priceMin: prices.length > 0 ? Math.min(...prices) : null,
          priceMax: prices.length > 0 ? Math.max(...prices) : null,
          ageLabel: ageFrom(note),
        },
        typeCategory ? { category: typeCategory } : venue.defaults,
      ),
    ];
  });
}

export function createFetch(venue: ElfsightVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, isAllowedUrl, options);
}

export async function fetchShows(venue: ElfsightVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const body: unknown = JSON.parse(await fetchPage(bootUrl(venue), 'calendar'));
  return toShowEvents(readEvents(body, venue), venue, today, readEventTypes(body, venue));
}
