/**
 * Reads show listings from venue sites that publish schema.org Event data on each event's page,
 * the structured data meant for search engines. Wix's Events pages do, as do many WordPress
 * event plugins. Only facts are kept (title, date, time, price range, availability, status), and
 * the event's own page is the ticket link. Descriptions and images are never stored.
 *
 * How it works: a listing page (often the home page) links to every upcoming event's page. Each
 * event page is read for its Event data. The sync script caches what it reads for a few days.
 *
 * Spotting a suitable site: an event page's source has
 * <script type="application/ld+json"> with "@type": "Event", a startDate and offers.
 */
import { classifyShow } from './categories.ts';
import { decodeText, dollarAmounts, torontoDateTime, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, HttpStatusError, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export interface SchemaEventVenue {
  /** A short name for the event source, like "redwood". */
  key: string;
  /** The site's address, ending in a slash. */
  siteUrl: string;
  /** The page that links to every upcoming event. */
  listingUrl: string;
  /** Where event pages live on the site, like "event-details/". */
  eventPath: string;
  /** The venue's id in src/data/toronto_music_venues.csv. */
  venueId: string;
  /** Text the event's address must contain, so events the venue lists elsewhere are skipped. */
  addressIncludes: string;
  /**
   * True when the listing page itself carries every event's data, so no event pages are read.
   * Each event's link is then its own url, or its ticket offer's.
   */
  eventsOnListing?: boolean;
  /** What shows count as when the title rules can't tell, for venues that only host one kind. */
  defaults?: VenueDefaults;
  /**
   * True when the page's own "Date and time" text is right and its Event data's time isn't. Leah
   * Posluns' Event data is an hour late outside daylight time, so the shown time is used instead.
   */
  preferShownTime?: boolean;
}

export const GEARY_WAREHOUSE: SchemaEventVenue = {
  key: 'geary',
  siteUrl: 'https://www.gearywarehouse.com/',
  listingUrl: 'https://www.gearywarehouse.com/',
  eventPath: 'events/',
  venueId: 'geary-avenue-warehouse',
  addressIncludes: '209 Geary',
  eventsOnListing: true,
  defaults: { category: 'Music' },
};

/** A WordPress comedy club whose home page carries ComedyEvent data for the next week or so, with prices. */
export const BACKROOM_COMEDY_CLUB: SchemaEventVenue = {
  key: 'backroom',
  siteUrl: 'https://backroomcomedyclub.com/',
  listingUrl: 'https://backroomcomedyclub.com/',
  eventPath: 'product/',
  venueId: 'backroom-comedy-club',
  addressIncludes: '814 Bloor',
  eventsOnListing: true,
  defaults: { category: 'Comedy' },
};

/**
 * The Second City's Toronto shows. Each show page's Event data holds only its next three showtimes,
 * so that's all that's known at a time. Its addresses are blank, but every show the Toronto page
 * links is at One York Street, so no address is required.
 */
export const SECOND_CITY_TORONTO: SchemaEventVenue = {
  key: 'secondcity',
  siteUrl: 'https://www.secondcity.com/',
  listingUrl: 'https://www.secondcity.com/toronto',
  eventPath: 'shows/toronto/',
  venueId: 'the-second-city-toronto',
  addressIncludes: '',
  defaults: { category: 'Comedy' },
};

export const LEAH_POSLUNS_THEATRE: SchemaEventVenue = {
  key: 'leah',
  siteUrl: 'https://www.leahposlunstheatre.com/',
  listingUrl: 'https://www.leahposlunstheatre.com/events',
  eventPath: 'event/',
  venueId: 'leah-posluns-theatre',
  addressIncludes: '4588 Bathurst',
  preferShownTime: true,
};

export const REDWOOD_THEATRE: SchemaEventVenue = {
  key: 'redwood',
  siteUrl: 'https://www.theredwoodtheatre.com/',
  // The home page's events list holds every upcoming event.
  listingUrl: 'https://www.theredwoodtheatre.com/',
  eventPath: 'event-details/',
  venueId: 'the-redwood-theatre',
  addressIncludes: '1300 Gerrard',
};

/** The facts kept from an event page. */
export interface EventFacts {
  name: string;
  /** As published, like 2026-12-18T19:00:00-05:00: the venue's local time with its offset. */
  startDate: string;
  lowPrice: string | null;
  highPrice: string | null;
  currency: string | null;
  /** schema.org availability, like InStock or SoldOut. */
  availability: string | null;
  /** schema.org event status, like EventScheduled or EventCancelled. */
  eventStatus: string | null;
  address: string;
  /** The event's own page, or failing that its ticket offer's page. */
  link: string | null;
}

/** Only the listing page and event pages may be requested, never checkout or account pages. */
export function isAllowedUrl(venue: SchemaEventVenue, url: string): boolean {
  if (/checkout|cart|order|account|login|signin|ticket-form|registration/i.test(url)) return false;
  return url === venue.listingUrl || new RegExp(`^${escapeRegExp(venue.siteUrl + venue.eventPath)}[a-z0-9-]+$`, 'i').test(url);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every event page the listing links to, in order, without duplicates. */
export function listEventUrls(html: string, venue: SchemaEventVenue): string[] {
  const pattern = new RegExp(`${escapeRegExp(venue.siteUrl + venue.eventPath)}([a-z0-9-]+)`, 'gi');
  const relative = new RegExp(`href="/${escapeRegExp(venue.eventPath)}([a-z0-9-]+)"`, 'gi');
  const slugs = [...html.matchAll(pattern), ...html.matchAll(relative)].map((match) => match[1]!.toLowerCase());
  return [...new Set(slugs)].map((slug) => `${venue.siteUrl}${venue.eventPath}${slug}`);
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

function clean(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

/** "https://schema.org/SoldOut" as "SoldOut". */
const term = (value: unknown): string | null => clean(value).split('/').pop() || null;

function findEvents(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(findEvents);
  if (!value || typeof value !== 'object') return [];
  const node = value as Record<string, unknown>;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  const self = types.some((type) => typeof type === 'string' && /Event$/.test(type)) ? [node] : [];
  return [...self, ...findEvents(node['@graph'])];
}

/** Reads the Event facts from a page's schema.org data. Unreadable blocks are skipped. */
export function readEventFacts(html: string): EventFacts[] {
  const blocks = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  return [...blocks].flatMap(([, json]) => {
    try {
      return findEvents(JSON.parse(json!));
    } catch {
      return [];
    }
  }).flatMap((event): EventFacts[] => {
    const name = clean(event.name);
    const startDate = clean(event.startDate);
    if (!name || !startDate) return [];
    const rawOffers = event.offers;
    const offers = (Array.isArray(rawOffers) ? rawOffers[0] : rawOffers) as Record<string, unknown> | undefined;
    const location = event.location as Record<string, unknown> | undefined;
    const address = location?.address;
    return [
      {
        name,
        startDate,
        lowPrice: clean(offers?.lowPrice ?? offers?.price) || null,
        highPrice: clean(offers?.highPrice ?? offers?.price) || null,
        currency: clean(offers?.priceCurrency) || null,
        availability: term(offers?.availability),
        eventStatus: term(event.eventStatus),
        address: typeof address === 'string' ? clean(address) : clean((address as Record<string, unknown> | undefined)?.streetAddress),
        link: [event.url, offers?.url].map(clean).find((url) => url.startsWith('https://')) ?? null,
      },
    ];
  });
}

function kindOf(name: string, venue: SchemaEventVenue): ReturnType<typeof classifyShow> {
  const kind = classifyShow(name);
  return kind.category === 'Other' && venue.defaults ? { category: venue.defaults.category, genre: venue.defaults.genre ?? null, subGenre: null } : kind;
}

/** Every amount in a price field, which some sites fill with a range like "$35 - $50". */
function amounts(value: string | null): number[] {
  // Zero is unknown, never free, as with the other sources.
  return [...(value ?? '').replace(/,(?=\d{3})/g, '').matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).filter((amount) => amount > 0);
}

const STATUSES: Record<string, string> = {
  EventCancelled: 'cancelled',
  EventPostponed: 'postponed',
  EventRescheduled: 'rescheduled',
};

/** Turns an event page's facts into shows at the venue, linked to that page. */
/**
 * The start as Toronto date and time. A time with a zone, like "2026-11-17T01:30:00Z", is
 * converted. A local time, like "2026-12-18T19:00:00-05:00" or "2026-12-18T19:00", gives the same
 * clock time, and a bare date has no time.
 */
export function localStart(startDate: string): { date: string; time: string | null } | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(startDate.trim());
  if (!match) return null;
  if (!match[2]) return { date: match[1]!, time: null };
  if (!match[3]) return { date: match[1]!, time: `${match[2]}:00` };
  const moment = new Date(startDate.trim());
  return Number.isNaN(moment.getTime()) ? null : torontoDateTime(moment);
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** The date and start time shown after a "Date and time" label, like "November 16, 2026 7:30 pm", as local time. */
export function shownStart(html: string): string | null {
  const text = decodeText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '));
  const match = /date and time\s*:?\s*([a-z]+) (\d{1,2}),? (\d{4})\s+(\d{1,2}):(\d{2})\s*([ap])\.?m/i.exec(text);
  const month = MONTH_NAMES.indexOf(match?.[1]?.toLowerCase() ?? '');
  if (!match || month < 0) return null;
  const hours = (Number(match[4]) % 12) + (match[6]!.toLowerCase() === 'p' ? 12 : 0);
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2]!.padStart(2, '0')}T${String(hours).padStart(2, '0')}:${match[5]}`;
}

/** A price shown on the page next to a "Price" label, like "Price | $35 - $50", for Event data without one. */
export function labelledPrices(html: string): string[] {
  const text = decodeText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '));
  const label = /\bprice\b\s*:?\s*((?:\$\s?\d+(?:\.\d{2})?\s*(?:-|–|to)?\s*)+)/i.exec(text);
  return label ? dollarAmounts(label[1]!).map(String) : [];
}

export function toShowEvents(pages: Map<string, EventFacts[]>, venue: SchemaEventVenue): ShowEvent[] {
  const events: ShowEvent[] = [];
  for (const [url, facts] of pages) {
    // A page with several performances (a comedy club's early and late shows) needs each one's start in its id.
    const several = facts.length > 1;
    for (const fact of facts) {
      const start = localStart(fact.startDate);
      if (!start || !fact.address.toLowerCase().includes(venue.addressIncludes.toLowerCase())) continue;
      const pageId = url.startsWith(venue.siteUrl) ? url.slice(venue.siteUrl.length) : url;
      const prices = [...amounts(fact.lowPrice), ...amounts(fact.highPrice)];
      const priceMin = prices.length > 0 ? Math.min(...prices) : null;
      const priceMax = prices.length > 0 ? Math.max(...prices) : null;
      const status = STATUSES[fact.eventStatus ?? ''] ?? (fact.availability === 'SoldOut' ? 'soldout' : 'onsale');
      events.push({
        // The page's address is the show's lasting identity on the site.
        id: several ? `${pageId}#${start.date}T${start.time ?? ''}` : pageId,
        name: fact.name,
        date: start.date,
        time: start.time,
        status,
        url,
        venueId: venue.venueId,
        ...kindOf(fact.name, venue),
        artists: [],
        priceMin,
        priceMax: priceMin === null ? null : Math.max(priceMax ?? priceMin, priceMin),
        currency: priceMin === null ? null : (fact.currency ?? 'CAD'),
        ageLabel: null,
        imageUrl: null,
        firstSeenAt: null,
      });
    }
  }
  return events.sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
}

export interface SchemaFetchResult {
  /** Facts for every listed event page, cached or fresh. */
  pages: Map<string, EventFacts[]>;
  /** Pages fetched this run, to save in the cache. */
  fetched: Map<string, EventFacts[]>;
  reused: number;
}

export function createFetch(venue: SchemaEventVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

/** Reads the listing, then each event page, reusing cached facts that are still fresh. */
export async function fetchEventPages(
  venue: SchemaEventVenue,
  fetchPage: PageFetch,
  cached: Map<string, { fetchedAt: string; rows: unknown[] }>,
  isFresh: (fetchedAt: string) => boolean,
): Promise<SchemaFetchResult> {
  const listing = await fetchPage(venue.listingUrl, 'the listing');
  if (venue.eventsOnListing) {
    // Every event is described on the listing page, linked to its own or its ticket page.
    const pages = new Map<string, EventFacts[]>();
    for (const fact of readEventFacts(listing)) {
      const url = fact.link ?? `${venue.listingUrl}#${encodeURIComponent(`${fact.startDate} ${fact.name}`)}`;
      pages.set(url, [...(pages.get(url) ?? []), fact]);
    }
    if (pages.size === 0) throw new Error(`${venue.key}'s listing has no event data (a new layout?). Stopping.`);
    return { pages, fetched: new Map(), reused: 0 };
  }
  const urls = listEventUrls(listing, venue);
  if (urls.length === 0) throw new Error(`${venue.key}'s listing links to no events (a new layout?). Stopping.`);
  const pages = new Map<string, EventFacts[]>();
  const fetched = new Map<string, EventFacts[]>();
  let reused = 0;
  for (const url of urls) {
    const cache = cached.get(url);
    if (cache && isFresh(cache.fetchedAt)) {
      pages.set(url, cache.rows as unknown as EventFacts[]);
      reused++;
      continue;
    }
    let html: string;
    try {
      html = await fetchPage(url, url.slice(venue.siteUrl.length));
    } catch (error) {
      // A listing can link a show page that's been taken down. Missing isn't refused, so carry on.
      if (error instanceof HttpStatusError && error.status === 404) continue;
      throw error;
    }
    const prices = labelledPrices(html);
    const shown = venue.preferShownTime ? shownStart(html) : null;
    // Event data without a price falls back to the price the page shows.
    const facts = readEventFacts(html)
      .map((fact) => (fact.lowPrice || prices.length === 0 ? fact : { ...fact, lowPrice: prices[0]!, highPrice: prices.at(-1)!, currency: fact.currency ?? 'CAD' }))
      .map((fact) => (shown ? { ...fact, startDate: shown } : fact));
    fetched.set(url, facts);
    pages.set(url, facts);
  }
  return { pages, fetched, reused };
}
