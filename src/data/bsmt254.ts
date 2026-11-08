/**
 * Reads BSMT 254's shows from its WordPress site: the events listing for each show's title, date and
 * page, then each show's page for the real start time, prices, age and genre. The listing's times
 * are often when the post was written (like 1:09 pm), so a show page's own time line wins.
 *
 * A show page has lines like `<span class='eventMeta'> / 8pm</span><span class='eventMeta'> /
 * $15 adv / $20 at the door</span>` and `<span class='genre'><span>Genre / Style(s):</span> Reggae</span>`.
 * Descriptions and images are never stored. Show pages are cached, so only new ones are fetched.
 */
import { classifyStyle } from './categories.ts';
import { ageFrom, decodeText, dollarAmounts, makeShow, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export const SITE = 'https://www.bsmt254.com/';
export const LISTING = `${SITE}events/`;
const VENUE_ID = 'bsmt-254';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function isAllowedUrl(url: string): boolean {
  return url === LISTING || /^https:\/\/www\.bsmt254\.com\/event\/[a-z0-9-]+\/$/.test(url);
}

export interface ListedShow {
  url: string;
  name: string;
  date: string;
  /** The listing's time, HH:mm:ss, which is often not the show's. */
  listedTime: string | null;
}

/** What a show's page adds. Saved in the page cache, so keep it plain data. */
export interface PageFacts {
  time: string | null;
  prices: number[];
  ageLabel: string | null;
  genre: string | null;
}

/** "November 28, 2026 1:09 pm" as a date and 24-hour time. */
export function readDateTime(text: string): { date: string; time: string | null } | null {
  const parts = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([ap])m)?/i.exec(text.trim());
  const month = parts ? MONTHS.indexOf(parts[1]!.toLowerCase()) : -1;
  if (!parts || month < 0) return null;
  const date = `${parts[3]}-${String(month + 1).padStart(2, '0')}-${parts[2]!.padStart(2, '0')}`;
  if (!parts[4]) return { date, time: null };
  const hour = (Number(parts[4]) % 12) + (parts[6]!.toLowerCase() === 'p' ? 12 : 0);
  return { date, time: `${String(hour).padStart(2, '0')}:${parts[5]}:00` };
}

/** The shows on the events listing, in order. */
export function readListing(html: string): ListedShow[] {
  return html
    .split(/<a href="(?=https:\/\/www\.bsmt254\.com\/event\/)/)
    .slice(1)
    .flatMap((card): ListedShow[] => {
      const url = card.slice(0, card.indexOf('"'));
      // Only the listing's event cards, not other links to a show.
      if (!card.slice(url.length, url.length + 40).includes('homeEventWrap')) return [];
      const when = readDateTime(decodeText(/class="datePull">([^<]*)</.exec(card)?.[1] ?? ''));
      const name = decodeText(/<h3>([\s\S]*?)<\/h3>/.exec(card)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '');
      if (!isAllowedUrl(url) || !when || !name) return [];
      return [{ url, name, date: when.date, listedTime: when.time }];
    });
}

/** "8pm", "9:30 PM" and the like, as HH:mm:ss. */
function clockTime(text: string): string | null {
  const parts = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/i.exec(text);
  if (!parts) return null;
  const hour = (Number(parts[1]) % 12) + (parts[3]!.toLowerCase() === 'p' ? 12 : 0);
  return hour < 24 ? `${String(hour).padStart(2, '0')}:${parts[2] ?? '00'}:00` : null;
}

/** The time, prices, age and genre lines on a show's page. */
export function readShowPage(html: string): PageFacts {
  const meta = [...html.matchAll(/class=['"]eventMeta['"]>([^<]*)</g)].map((match) => decodeText(match[1]!)).join(' / ');
  // Kept as written. It's matched to a genre when shows are built, so rule changes apply to cached pages.
  const genre = decodeText(/class=['"]genre['"]>\s*<span>[^<]*<\/span>([^<]*)</.exec(html)?.[1] ?? '') || null;
  return { time: clockTime(meta), prices: dollarAmounts(meta), ageLabel: ageFrom(meta), genre };
}

/** A listing time on the quarter hour is believable. Others, like 1:09 pm, are when the post was made. */
function believableTime(time: string | null): string | null {
  return time && Number(time.slice(3, 5)) % 15 === 0 ? time : null;
}

/** The show's style line as a category and Ticketmaster genre. Styles that name no known genre give plain Music. */
export function defaultsFor(style: string | null): VenueDefaults {
  const kind = style ? classifyStyle(style) : null;
  return kind ? { category: kind.category, ...(kind.genre ? { genre: kind.genre } : {}) } : { category: 'Music' };
}

export function toShowEvents(listed: ListedShow[], pages: Map<string, PageFacts>, today: string): ShowEvent[] {
  return listed.flatMap((show): ShowEvent[] => {
    if (show.date < today) return [];
    const page = pages.get(show.url);
    const prices = page?.prices ?? [];
    return [
      makeShow(
        {
          id: show.url.slice(`${SITE}event/`.length).replace(/\/$/, ''),
          name: show.name,
          date: show.date,
          time: page?.time ?? believableTime(show.listedTime),
          url: show.url,
          venueId: VENUE_ID,
          priceMin: prices.length > 0 ? Math.min(...prices) : null,
          priceMax: prices.length > 0 ? Math.max(...prices) : null,
          ageLabel: page?.ageLabel ?? null,
        },
        defaultsFor(page?.genre ?? null),
      ),
    ];
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('bsmt254', isAllowedUrl, options);
}

export interface Bsmt254Result {
  events: ShowEvent[];
  /** Show pages fetched on this run, to be cached. */
  fetched: Map<string, PageFacts>;
  reused: number;
}

/** Reads the listing, then each upcoming show's page unless a fresh copy of its facts is cached. */
export async function fetchShows(
  today: string,
  cached: Map<string, { fetchedAt: string; rows: unknown[] }>,
  isFresh: (fetchedAt: string) => boolean,
  fetchPage: PageFetch = createFetch(),
): Promise<Bsmt254Result> {
  const listed = readListing(await fetchPage(LISTING, 'the events listing')).filter((show) => show.date >= today);
  if (listed.length === 0) throw new Error("bsmt254's listing has no upcoming shows (a new layout?). Stopping.");
  const pages = new Map<string, PageFacts>();
  const fetched = new Map<string, PageFacts>();
  let reused = 0;
  for (const show of listed) {
    if (pages.has(show.url)) continue;
    const cache = cached.get(show.url);
    if (cache && isFresh(cache.fetchedAt) && cache.rows[0]) {
      pages.set(show.url, cache.rows[0] as PageFacts);
      reused++;
      continue;
    }
    const facts = readShowPage(await fetchPage(show.url, show.url.slice(SITE.length)));
    pages.set(show.url, facts);
    fetched.set(show.url, facts);
  }
  return { events: toShowEvents(listed, pages, today), fetched, reused };
}
