import { MIN_SEARCH_LENGTH, normalizeForSearch } from './search.ts';
import type { ShowEvent } from './ticketmaster.ts';

export type { ShowEvent };

/** Rows per request. Supabase returns at most 1000 at a time by default. */
const PAGE_SIZE = 1000;
/** A limit so a bad response can't loop forever. */
const MAX_PAGES = 20;

/** Turns database rows into events, dropping anything malformed or with an unsafe link. */
export function parseEventRows(rows: unknown): ShowEvent[] {
  if (!Array.isArray(rows)) throw new Error('Expected a list of events');
  return (rows as Record<string, unknown>[]).flatMap((row): ShowEvent[] => {
    const {
      source,
      source_id: sourceId,
      name,
      local_date: date,
      local_time: time,
      status,
      url,
      venue_id: venueId,
      genre,
      sub_genre: subGenre,
      category,
      artists,
      price_min: priceMin,
      price_max: priceMax,
      currency,
      age_restriction: ageLabel,
      image_url: imageUrl,
      first_seen_at: firstSeenAt,
    } = row;
    if (
      typeof source !== 'string' ||
      typeof sourceId !== 'string' ||
      typeof name !== 'string' ||
      typeof venueId !== 'string' ||
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof url !== 'string' ||
      !/^https?:\/\//i.test(url)
    ) {
      return [];
    }
    return [
      {
        id: `${source}:${sourceId}`,
        name,
        date,
        time: typeof time === 'string' ? time : null,
        status: typeof status === 'string' ? status : 'unknown',
        url,
        venueId,
        genre: typeof genre === 'string' ? genre : null,
        subGenre: typeof subGenre === 'string' ? subGenre : null,
        // Rows saved before categories existed all came from Ticketmaster's music listings.
        category: typeof category === 'string' && category ? category : 'Music',
        artists: Array.isArray(artists) ? artists.filter((artist): artist is string => typeof artist === 'string') : [],
        priceMin: typeof priceMin === 'number' ? priceMin : null,
        priceMax: typeof priceMax === 'number' ? priceMax : null,
        currency: typeof currency === 'string' ? currency : null,
        ageLabel: typeof ageLabel === 'string' ? ageLabel : null,
        imageUrl: typeof imageUrl === 'string' && /^https:\/\//i.test(imageUrl) ? imageUrl : null,
        firstSeenAt: typeof firstSeenAt === 'string' && Number.isFinite(Date.parse(firstSeenAt)) ? firstSeenAt : null,
      },
    ];
  });
}

/** Loads upcoming events. Listings are optional, so any failure means the app runs without them. */
export async function loadEvents(
  url: string | undefined,
  publicKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<ShowEvent[] | null> {
  if (!url || !publicKey) return null;
  // Supabase's newer `sb_` keys go only in the apikey header. Older JWT keys need both.
  const headers: Record<string, string> = publicKey.startsWith('sb_')
    ? { apikey: publicKey }
    : { apikey: publicKey, Authorization: `Bearer ${publicKey}` };
  const events: ShowEvent[] = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        // Every column, rather than a list, so a deploy that lands before its migration still loads.
        // parseEventRows treats any column that isn't there yet as unknown.
        select: '*',
        timing: 'eq.upcoming',
        order: 'local_date.asc,local_time.asc,source_id.asc',
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      const response = await fetcher(`${url.replace(/\/$/, '')}/rest/v1/events_with_timing?${params}`, { headers });
      if (!response.ok) return null;
      const rows: unknown = await response.json();
      events.push(...parseEventRows(rows));
      if ((rows as unknown[]).length < PAGE_SIZE) break;
    }
    return events;
  } catch {
    return null;
  }
}

/** Today in the visitor's time zone, as YYYY-MM-DD. */
export function todayString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export type AgeFilter = 'all-ages' | 'adults';

/** What the visitor has narrowed the listings to. Null means no limit. */
export interface ShowFilter {
  genre: string | null;
  from: string | null;
  to: string | null;
  /** The most a show's cheapest ticket can cost. */
  maxPrice: number | null;
  age: AgeFilter | null;
}

export const NO_FILTER: ShowFilter = { genre: null, from: null, to: null, maxPrice: null, age: null };

export function isFiltering({ genre, from, to, maxPrice, age }: ShowFilter): boolean {
  return genre !== null || from !== null || to !== null || maxPrice !== null || age !== null;
}

/** True for an age label like "19+". */
export function isAdultsOnly(ageLabel: string | null): boolean {
  return ageLabel !== null && /^\d+\+$/.test(ageLabel);
}

/**
 * True if a show fits the filter. A genre matches a show's main genre or its sub-genre. Price and
 * age filters leave out shows whose listing doesn't give a price or age, since they can't be checked.
 */
export function matchesFilter(event: ShowEvent, { genre, from, to, maxPrice, age }: ShowFilter): boolean {
  if (genre !== null && event.genre !== genre && event.subGenre !== genre && event.category !== genre) return false;
  if (from !== null && event.date < from) return false;
  if (to !== null && event.date > to) return false;
  if (maxPrice !== null && (event.priceMin === null || event.priceMin > maxPrice)) return false;
  if (age === 'all-ages' && event.ageLabel !== 'All ages') return false;
  return age !== 'adults' || isAdultsOnly(event.ageLabel);
}

/** A venue's shows from today on, since a page can stay open for days. They're already in date order. */
export function upcomingShows(events: ShowEvent[], venueId: string, today: string, filter: ShowFilter = NO_FILTER): ShowEvent[] {
  return events.filter((event) => event.venueId === venueId && event.date >= today && matchesFilter(event, filter));
}

export function isCancelled(event: Pick<ShowEvent, 'status'>): boolean {
  return event.status === 'cancelled';
}

/**
 * Every show from today on that fits the filter. Cancelled shows are left out, so they don't count
 * towards pins, genres or totals. Only a venue's own list shows them.
 */
export function matchingShows(events: ShowEvent[], today: string, filter: ShowFilter = NO_FILTER): ShowEvent[] {
  return events.filter((event) => event.date >= today && !isCancelled(event) && matchesFilter(event, filter));
}

/** The venues with at least one upcoming show that fits the filter. */
export function venuesWithShows(events: ShowEvent[], today: string, filter: ShowFilter = NO_FILTER): Set<string> {
  return new Set(matchingShows(events, today, filter).map((event) => event.venueId));
}

export interface GenreCount {
  name: string;
  count: number;
}

function countBy(names: (string | null)[]): GenreCount[] {
  const counts = new Map<string, number>();
  for (const name of names) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface GenreOptions {
  /** Music, Dance, Theatre and so on. Empty when every show is in one category, since there's nothing to choose. */
  categories: GenreCount[];
  genres: GenreCount[];
  /** More specific tags like Punk. A name that's also a main genre appears only there. */
  subGenres: GenreCount[];
}

/** Genres with upcoming shows in the date range, most shows first. The genre filter itself is ignored. */
export function genreOptions(events: ShowEvent[], today: string, filter: ShowFilter = NO_FILTER): GenreOptions {
  const shows = matchingShows(events, today, { ...filter, genre: null });
  const genres = countBy(shows.map((event) => event.genre));
  const mainNames = new Set(genres.map((item) => item.name));
  const categories = countBy(shows.map((event) => event.category));
  return {
    categories: categories.length > 1 ? categories : [],
    genres,
    subGenres: countBy(shows.map((event) => event.subGenre)).filter((item) => !mainNames.has(item.name)),
  };
}

/** Categories, genres and sub-genres matching a search, most shows first. An empty search finds nothing. */
export function searchGenres(query: string, events: ShowEvent[], today: string, filter: ShowFilter = NO_FILTER): GenreCount[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return [];
  const { categories, genres, subGenres } = genreOptions(events, today, filter);
  const startsWith = (item: GenreCount) => (item.name.toLowerCase().startsWith(wanted) ? 0 : 1);
  return [...categories, ...genres, ...subGenres]
    .filter((item) => item.name.toLowerCase().includes(wanted))
    .sort((a, b) => startsWith(a) - startsWith(b) || b.count - a.count);
}

const MAX_SHOW_RESULTS = 8;

export interface ShowMatch {
  show: ShowEvent;
  /** The artist that matched, or null if the show's title did. */
  artist: string | null;
}

/** Upcoming shows by artist or title, regardless of filters, leaving out cancelled ones. Names starting with the search come first, then soonest. */
export function searchShows(query: string, events: ShowEvent[], today: string, limit = MAX_SHOW_RESULTS): ShowMatch[] {
  const wanted = normalizeForSearch(query);
  if (wanted.length < MIN_SEARCH_LENGTH) return [];
  const ranked: { match: ShowMatch; rank: number }[] = [];
  for (const show of events) {
    if (show.date < today || isCancelled(show)) continue;
    const artist = show.artists.find((name) => normalizeForSearch(name).includes(wanted)) ?? null;
    const title = normalizeForSearch(show.name);
    if (!artist && !title.includes(wanted)) continue;
    const startsWith = artist ? normalizeForSearch(artist).startsWith(wanted) : title.startsWith(wanted);
    ranked.push({ match: { show, artist }, rank: startsWith ? 0 : 1 });
  }
  // Events are already in date order, and this sort keeps that order within each rank.
  return ranked.sort((a, b) => a.rank - b.rank).slice(0, limit).map((item) => item.match);
}

/** Artists on the bill that the show's title doesn't mention. */
export function artistsNotInTitle(show: ShowEvent): string[] {
  const title = normalizeForSearch(show.name);
  return show.artists.filter((artist) => !title.includes(normalizeForSearch(artist)));
}

/** Formats 2026-12-04 as "Fri, Dec 4". Dates are built locally, so they can't shift a day across time zones. */
export function formatShowDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Formats 19:30:00 as "7:30 PM". */
export function formatShowTime(time: string | null): string | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${match[2]} ${suffix}`;
}

function formatMoney(amount: number, currency: string | null): string {
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  // Listings are in Canadian dollars. Any other currency gets named, so a price is never misread.
  return currency && currency !== 'CAD' ? `${currency} $${text}` : `$${text}`;
}

/** "$25" for one price, "From $25" for a range, and null when the price isn't known. */
export function priceLabel({ priceMin, priceMax, currency }: Pick<ShowEvent, 'priceMin' | 'priceMax' | 'currency'>): string | null {
  if (priceMin === null) return null;
  const price = formatMoney(priceMin, currency);
  return priceMax !== null && priceMax > priceMin ? `From ${price}` : price;
}

/** A note for shows that aren't on sale. Cancelled, rescheduled and postponed shows get stamps instead. */
export function showStatusLabel(status: string): string | null {
  return status === 'offsale' ? 'Not on sale' : null;
}

export type StampKind = 'cancelled' | 'soldout' | 'rescheduled' | 'postponed' | 'new';

export interface Stamp {
  kind: StampKind;
  label: string;
}

/** A show counts as just added for this long after a sync first sees it. */
export const JUST_ADDED_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True if a sync first saw the show within the last few days. */
export function isJustAdded(firstSeenAt: string | null, now: Date, days: number = JUST_ADDED_DAYS): boolean {
  if (firstSeenAt === null) return false;
  const seen = Date.parse(firstSeenAt);
  return Number.isFinite(seen) && now.getTime() - seen < days * DAY_MS;
}

/** The rubber stamp for a show, if any. A change of plans beats being new. */
export function showStamp(show: Pick<ShowEvent, 'status' | 'firstSeenAt'>, now: Date): Stamp | null {
  if (isCancelled(show)) return { kind: 'cancelled', label: 'Cancelled' };
  if (show.status === 'soldout') return { kind: 'soldout', label: 'Sold out' };
  if (show.status === 'rescheduled') return { kind: 'rescheduled', label: 'Rescheduled' };
  if (show.status === 'postponed') return { kind: 'postponed', label: 'Postponed' };
  return isJustAdded(show.firstSeenAt, now) ? { kind: 'new', label: 'Just added' } : null;
}

/** A small tilt between -3 and 3 degrees that's the same for a show on every render. */
export function stampTilt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 7) - 3;
}
