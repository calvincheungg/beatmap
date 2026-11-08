/**
 * Reads venues whose Wix sites show events with Boomtech's Event Calendar app. The calendar's data
 * comes from Boomtech's API, which needs the anonymous app token Wix gives every visitor's browser,
 * so a run makes two requests: the site's public token endpoint, then the published calendar.
 * These are the same requests a visitor's browser makes. They're internal APIs, so they may change.
 *
 * Facts only: title, local start time, the venue's own categories, and a ticket link when one is
 * given. Descriptions and images are never stored. Repeating entries are skipped, so the map never
 * invents dates.
 *
 * Spotting a suitable site: an iframe from calendar.boomte.ch/widget on a Wix site.
 */
import { classifyShow, type Category } from './categories.ts';
import { decodeText, makeShow } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

/** Boomtech Event Calendar's app id on Wix. */
const BOOMTECH_APP = '13b4a028-00fa-7133-242f-4628106b8c91';
const CALENDAR_API = 'https://calendar.apiboomtech.com/api/published_calendar';

export interface BoomtechVenue {
  key: string;
  /** The Wix site's address, ending in a slash. */
  siteUrl: string;
  /** The calendar widget's component id on the page. */
  compId: string;
  /** Where visitors see the calendar, used as the link when an event has no ticket page. */
  listingUrl: string;
  /** Text the event's address must contain. */
  addressIncludes: string;
  venueId: string;
}

export const FREE_TIMES_CAFE: BoomtechVenue = {
  key: 'freetimes',
  siteUrl: 'https://www.freetimescafe.com/',
  compId: 'comp-kw6rllyd',
  listingUrl: 'https://www.freetimescafe.com/entertainment',
  addressIncludes: 'college',
  venueId: 'free-times-cafe',
};

export interface BoomtechEvent {
  id?: string | number;
  title?: string;
  /** Local time at the venue, like "2026-11-07T20:00". */
  start?: string;
  all_day?: string | boolean;
  link?: string;
  /** Boomtech sends these as Python-style text, like "{'address': '...'}". */
  venue?: unknown;
  repeat?: unknown;
  categories?: unknown;
}

/** Reads Boomtech's Python-style text fields, like "[{'name': 'Comedy'}]". */
function loose(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/'/g, '"'));
  } catch {
    return value;
  }
}

/** The venue's categories, mapped to ours. Null means the listing isn't a show, like a brunch. */
export function categorize(names: string[], title: string): { category: Category; genre: string | null } | null {
  const has = (pattern: RegExp) => names.some((name) => pattern.test(name));
  if (has(/comedy|improv/i)) return { category: 'Comedy', genre: null };
  if (has(/poetry|spoken word|reading|book/i)) return { category: 'Talks', genre: null };
  if (has(/trivia|quiz|bingo/i)) return { category: 'Games', genre: null };
  if (has(/music|open mic|klezmer|jazz|folk|blues|concert/i)) {
    const genre = has(/jazz/i) ? 'Jazz' : has(/klezmer/i) ? 'Klezmer' : has(/folk/i) ? 'Folk' : has(/blues/i) ? 'Blues' : classifyShow(title).genre;
    return { category: 'Music', genre };
  }
  // Without a show category, only keep it if the title clearly is one.
  const kind = classifyShow(title);
  return kind.category === 'Other' ? null : { category: kind.category, genre: kind.genre };
}

export function tokenUrl(venue: BoomtechVenue): string {
  return `${venue.siteUrl}_api/v1/access-tokens`;
}

export function calendarUrl(venue: BoomtechVenue, instance: string): string {
  return `${CALENDAR_API}?comp_id=${encodeURIComponent(venue.compId)}&instance=${encodeURIComponent(instance)}`;
}

export function isAllowedUrl(venue: BoomtechVenue, url: string): boolean {
  return url === tokenUrl(venue) || url.startsWith(`${CALENDAR_API}?comp_id=${encodeURIComponent(venue.compId)}&instance=`);
}

/** Turns calendar events from today on into shows. */
export function toShowEvents(events: BoomtechEvent[], venue: BoomtechVenue, today: string): ShowEvent[] {
  return events.flatMap((event): ShowEvent[] => {
    const name = decodeText(event.title ?? '');
    const start = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(event.start ?? '');
    if (!event.id || !name || !start || start[1]! < today) return [];
    const repeat = loose(event.repeat) as { type?: string } | null;
    if (repeat && typeof repeat === 'object' && repeat.type) return [];
    const venueInfo = loose(event.venue) as { address?: string } | null;
    if (!(venueInfo?.address ?? '').toLowerCase().includes(venue.addressIncludes)) return [];
    const categories = loose(event.categories);
    const names = Array.isArray(categories) ? categories.map((item) => String((item as { name?: unknown }).name ?? '')) : [];
    const kind = categorize(names, name);
    if (!kind) return [];
    const allDay = event.all_day === true || event.all_day === '1';
    return [
      makeShow(
        {
          id: String(event.id),
          name,
          date: start[1]!,
          time: allDay ? null : `${start[2]}:00`,
          url: event.link?.startsWith('https://') ? event.link : venue.listingUrl,
          venueId: venue.venueId,
        },
        { category: kind.category, ...(kind.genre ? { genre: kind.genre } : {}) },
      ),
    ];
  });
}

export function createFetch(venue: BoomtechVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

export async function fetchShows(venue: BoomtechVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const tokens = JSON.parse(await fetchPage(tokenUrl(venue), 'the app token')) as { apps?: Record<string, { instance?: string }> };
  const instance = tokens.apps?.[BOOMTECH_APP]?.instance;
  if (!instance) throw new Error(`${venue.key}'s site gave no calendar token (the app may be gone). Stopping.`);
  const calendar = JSON.parse(await fetchPage(calendarUrl(venue, instance), 'the calendar')) as { events?: BoomtechEvent[] };
  return toShowEvents(calendar.events ?? [], venue, today);
}
