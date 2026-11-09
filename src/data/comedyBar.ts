/**
 * Reads Comedy Bar's shows at both its Toronto locations. It has no calendar: the home page links
 * every show's page (/shows/<name>), and a show page lists its scheduled dates, each with an id
 * like "#2026-12-04-22-00", its ticket prices, and an "Event Location" that says which club it's at.
 *
 * Show pages are cached for a few days, and a run fetches at most a set number, so the first runs
 * build up the cache gradually. Facts only: title, dates and times, prices, and the show's page.
 */
import { decodeText, dollarAmounts, makeShow } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export const SITE = 'https://comedybar.ca/';
/** New show pages fetched per run. The rest wait for the next run. */
const MAX_PAGES_PER_RUN = 120;

/** Comedy Bar's clubs, by text in a show's "Event Location", and their ids in the venue CSV. */
const CLUBS: { address: RegExp; venueId: string }[] = [
  { address: /\b945 Bloor\b/i, venueId: 'comedy-bar' },
  { address: /\b2800 Danforth\b/i, venueId: 'comedy-bar-danforth' },
];

export function isAllowedUrl(url: string): boolean {
  return url === SITE || /^https:\/\/comedybar\.ca\/shows\/[a-z0-9-]+$/.test(url);
}

/** What a show page gives. Saved in the page cache, so keep it plain data. */
export interface ShowFacts {
  title: string;
  /** The venue id of the club it's at, or null for elsewhere (like the Ottawa affiliate). */
  venueId: string | null;
  /** Each scheduled date and 24-hour time. */
  dates: { date: string; time: string }[];
  prices: number[];
}

/** Every show page the home page links to. */
export function listShowUrls(html: string): string[] {
  const slugs = [...html.matchAll(/href="(?:https:\/\/comedybar\.ca)?\/shows\/([a-z0-9-]+)"/gi)].map((match) => match[1]!.toLowerCase());
  return [...new Set(slugs)].map((slug) => `${SITE}shows/${slug}`);
}

export function readShowPage(html: string): ShowFacts | null {
  const title = decodeText(/<h1[^>]*page-header[^>]*>([\s\S]*?)<span/.exec(html)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '');
  if (!title) return null;
  const location = decodeText(/Event Location:([\s\S]*?)<\/div>/.exec(html)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '');
  const club = CLUBS.find(({ address }) => address.test(location));
  const dates = [...html.matchAll(/data-target="#(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})"/g)].map((match) => ({ date: match[1]!, time: `${match[2]}:${match[3]}:00` }));
  // Ticket prices are in the booking form, like "General Admission $ 20.00".
  const form = /<form action="\/public\/Event\/AddToCart"[\s\S]*?<\/form>/.exec(html)?.[0] ?? '';
  const prices = [...new Set(dollarAmounts(decodeText(form.replace(/<[^>]+>/g, ' '))))];
  return { title, venueId: club?.venueId ?? null, dates: [...new Map(dates.map((when) => [`${when.date} ${when.time}`, when])).values()], prices };
}

export function toShowEvents(pages: Map<string, ShowFacts | null>, today: string): ShowEvent[] {
  return [...pages].flatMap(([url, facts]): ShowEvent[] => {
    if (!facts?.venueId) return [];
    const slug = url.slice(`${SITE}shows/`.length);
    return facts.dates
      .filter((when) => when.date >= today)
      .map((when) =>
        makeShow(
          {
            id: `${slug}-${when.date}-${when.time.slice(0, 5)}`,
            name: facts.title,
            date: when.date,
            time: when.time,
            url,
            venueId: facts.venueId!,
            priceMin: facts.prices.length > 0 ? Math.min(...facts.prices) : null,
            priceMax: facts.prices.length > 0 ? Math.max(...facts.prices) : null,
          },
          { category: 'Comedy' },
        ),
      );
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('comedybar', isAllowedUrl, options);
}

export interface ComedyBarResult {
  events: ShowEvent[];
  /** Show pages fetched on this run, to be cached. Null for a page that isn't a show. */
  fetched: Map<string, ShowFacts | null>;
  reused: number;
  deferred: number;
}

/** Reads the home page's show links, then each show page unless its facts are cached and fresh. */
export async function fetchShows(
  today: string,
  cached: Map<string, { fetchedAt: string; rows: unknown[] }>,
  isFresh: (fetchedAt: string) => boolean,
  fetchPage: PageFetch = createFetch(),
): Promise<ComedyBarResult> {
  const urls = listShowUrls(await fetchPage(SITE, 'the home page'));
  if (urls.length === 0) throw new Error("comedybar's home page links no shows (a new layout?). Stopping.");
  const pages = new Map<string, ShowFacts | null>();
  const fetched = new Map<string, ShowFacts | null>();
  let reused = 0;
  let deferred = 0;
  for (const url of urls) {
    const cache = cached.get(url);
    const known = cache ? ((cache.rows[0] as ShowFacts | undefined) ?? null) : undefined;
    if (cache && isFresh(cache.fetchedAt)) {
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
    const facts = readShowPage(await fetchPage(url, url.slice(SITE.length)));
    pages.set(url, facts);
    fetched.set(url, facts);
  }
  if (fetched.size > 0 && [...fetched.values()].every((facts) => facts === null)) {
    throw new Error("comedybar's show pages have no show details (a new layout?). Stopping.");
  }
  return { events: toShowEvents(pages, today), fetched, reused, deferred };
}
