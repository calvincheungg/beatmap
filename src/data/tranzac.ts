/**
 * Reads the Tranzac Club's events. Its calendar is drawn in the browser from an API that robots.txt
 * rules out, so this uses what it allows: the sitemap, then each event's page. An event page holds
 * the event in its Nuxt payload (<script id="__NUXT_DATA__">) with an exact start like
 * "2026-11-10T21:30:00-05:00". The page's visible time is printed in UTC, so it isn't used.
 *
 * Event pages are named like /events/dimetapp-2026-11-10. Undated names (/events/opera-pub11) are
 * read only when the sitemap says they changed recently. Facts only: title, start, and the price and
 * age found in the description. The description and images are never stored. Pages are cached, and
 * an event that's over is never fetched again.
 */
import { ageFrom, decodeText, dollarAmounts, makeShow, torontoDateTime } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export const SITE = 'https://tranzac.org/';
export const SITEMAP = `${SITE}sitemap.xml`;
const VENUE_ID = 'tranzac-club';
/** Dated event pages this far ahead are read. */
const DAYS_AHEAD = 30;
/** Undated event pages changed within this many days are read. */
const RECENT_DAYS = 30;
/** New pages fetched per run, nearest first. The rest wait for the next run. */
const MAX_PAGES_PER_RUN = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isAllowedUrl(url: string): boolean {
  return url === SITEMAP || /^https:\/\/tranzac\.org\/events\/[a-z0-9-]+$/.test(url);
}

/** What an event page gives. Saved in the page cache, so keep it plain data. */
export interface EventFacts {
  title: string;
  /** ISO with offset, like "2026-11-10T21:30:00-05:00". */
  start: string;
  prices: number[];
  ageLabel: string | null;
}

export interface SitemapEvent {
  url: string;
  /** The date in the page's name, if it has one. */
  date: string | null;
  lastmod: string | null;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every event page in the sitemap. */
export function readSitemap(xml: string): SitemapEvent[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap((match): SitemapEvent[] => {
    const url = /<loc>([^<]+)<\/loc>/.exec(match[1]!)?.[1]?.trim() ?? '';
    if (!isAllowedUrl(url) || url === SITEMAP) return [];
    const date = /-(\d{4}-\d{2}-\d{2})$/.exec(url)?.[1] ?? null;
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(match[1]!)?.[1]?.trim() ?? null;
    return [{ url, date, lastmod }];
  });
}

/** The pages worth reading today: dated ones in the window ahead, nearest first, then recently changed undated ones. */
export function pagesToRead(pages: SitemapEvent[], today: string): string[] {
  const last = addDays(today, DAYS_AHEAD);
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - RECENT_DAYS * DAY_MS).toISOString();
  const dated = pages.filter((page) => page.date && page.date >= today && page.date <= last).sort((a, b) => a.date!.localeCompare(b.date!));
  const undated = pages.filter((page) => !page.date && page.lastmod && page.lastmod >= since).sort((a, b) => b.lastmod!.localeCompare(a.lastmod!));
  // Room bookings, like /events/private-booking-2026-11-09, aren't worth a request.
  return [...dated, ...undated].map((page) => page.url).filter((url) => !url.startsWith(`${SITE}events/private-`));
}

/**
 * Finds the page's own event in its Nuxt payload: a flat array in which an object's values are the
 * positions of other entries. Null when the page doesn't hold one.
 */
export function readEventPage(html: string, url: string): EventFacts | null {
  const payload = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!payload) return null;
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const entries: unknown[] = data;
  const value = (ref: unknown): unknown => (typeof ref === 'number' && Number.isInteger(ref) ? entries[ref] : undefined);
  const slug = url.slice(`${SITE}events/`.length);
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const fields = entry as Record<string, unknown>;
    if (value(fields.slug) !== slug) continue;
    const title = value(fields.title);
    const start = value(fields.startDate);
    if (typeof title !== 'string' || typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start)) continue;
    const description = value(fields.description);
    const note = typeof description === 'string' ? decodeText(description.replace(/<[^>]+>/g, ' ')) : '';
    return { title: decodeText(title), start, prices: dollarAmounts(note), ageLabel: ageFrom(note) };
  }
  return null;
}

/** Room bookings and open hours aren't shows. */
function isNotAShow(title: string): boolean {
  return /\bprivate\s+(booking|event|party|rental)\b|\bopen\s+hours\b|^closed\b/i.test(title);
}

export function toShowEvents(pages: Map<string, EventFacts | null>, today: string): ShowEvent[] {
  return [...pages].flatMap(([url, facts]): ShowEvent[] => {
    if (!facts || isNotAShow(facts.title)) return [];
    const when = new Date(facts.start);
    if (Number.isNaN(when.getTime())) return [];
    const { date, time } = torontoDateTime(when);
    if (date < today) return [];
    return [
      makeShow(
        {
          id: url.slice(`${SITE}events/`.length),
          name: facts.title,
          date,
          time,
          url,
          venueId: VENUE_ID,
          priceMin: facts.prices.length > 0 ? Math.min(...facts.prices) : null,
          priceMax: facts.prices.length > 0 ? Math.max(...facts.prices) : null,
          ageLabel: facts.ageLabel,
        },
        // Mostly bands, residencies and jams. Comedy, film and talks are picked out by the title rules.
        { category: 'Music' },
      ),
    ];
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('tranzac', isAllowedUrl, options);
}

export interface TranzacResult {
  events: ShowEvent[];
  /** Event pages fetched on this run, to be cached. Null for a page without an event. */
  fetched: Map<string, EventFacts | null>;
  reused: number;
  /** Pages left for the next run because of the per-run limit. */
  deferred: number;
}

/** Reads the sitemap, then each event page worth reading unless its facts are cached and fresh or the event is over. */
export async function fetchShows(
  today: string,
  cached: Map<string, { fetchedAt: string; rows: unknown[] }>,
  isFresh: (fetchedAt: string) => boolean,
  fetchPage: PageFetch = createFetch(),
): Promise<TranzacResult> {
  const urls = pagesToRead(readSitemap(await fetchPage(SITEMAP, 'the sitemap')), today);
  if (urls.length === 0) throw new Error("tranzac's sitemap lists no upcoming events (a new layout?). Stopping.");
  const pages = new Map<string, EventFacts | null>();
  const fetched = new Map<string, EventFacts | null>();
  let reused = 0;
  let deferred = 0;
  for (const url of urls) {
    const cache = cached.get(url);
    const known = cache ? ((cache.rows[0] as EventFacts | undefined) ?? null) : undefined;
    const over = known ? torontoDateTime(new Date(known.start)).date < today : false;
    if (cache && (isFresh(cache.fetchedAt) || over)) {
      pages.set(url, known ?? null);
      reused++;
      continue;
    }
    if (fetched.size >= MAX_PAGES_PER_RUN) {
      // Older facts are better than none until the page's turn comes.
      if (known) pages.set(url, known);
      deferred++;
      continue;
    }
    const facts = readEventPage(await fetchPage(url, url.slice(SITE.length)), url);
    pages.set(url, facts);
    fetched.set(url, facts);
  }
  if (fetched.size > 0 && [...fetched.values()].every((facts) => facts === null)) {
    throw new Error("tranzac's event pages have no event data (a new layout?). Stopping.");
  }
  return { events: toShowEvents(pages, today), fetched, reused, deferred };
}
