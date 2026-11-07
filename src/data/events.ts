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
        select: 'source,source_id,venue_id,name,local_date,local_time,status,url,genre,sub_genre',
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

/** What the visitor has narrowed the listings to. Null means no limit. */
export interface ShowFilter {
  genre: string | null;
  from: string | null;
  to: string | null;
}

export const NO_FILTER: ShowFilter = { genre: null, from: null, to: null };

export function isFiltering({ genre, from, to }: ShowFilter): boolean {
  return genre !== null || from !== null || to !== null;
}

/** True if a show fits the filter. A genre matches a show's main genre or its sub-genre. */
export function matchesFilter(event: ShowEvent, { genre, from, to }: ShowFilter): boolean {
  if (genre !== null && event.genre !== genre && event.subGenre !== genre) return false;
  if (from !== null && event.date < from) return false;
  return to === null || event.date <= to;
}

/** A venue's shows from today on, since a page can stay open for days. They're already in date order. */
export function upcomingShows(events: ShowEvent[], venueId: string, today: string, filter: ShowFilter = NO_FILTER): ShowEvent[] {
  return events.filter((event) => event.venueId === venueId && event.date >= today && matchesFilter(event, filter));
}

/** Every show from today on that fits the filter. */
export function matchingShows(events: ShowEvent[], today: string, filter: ShowFilter = NO_FILTER): ShowEvent[] {
  return events.filter((event) => event.date >= today && matchesFilter(event, filter));
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
  genres: GenreCount[];
  /** More specific tags like Punk. A name that's also a main genre appears only there. */
  subGenres: GenreCount[];
}

/** Genres with upcoming shows in the date range, most shows first. The genre filter itself is ignored. */
export function genreOptions(events: ShowEvent[], today: string, filter: ShowFilter = NO_FILTER): GenreOptions {
  const shows = matchingShows(events, today, { ...filter, genre: null });
  const genres = countBy(shows.map((event) => event.genre));
  const mainNames = new Set(genres.map((item) => item.name));
  return { genres, subGenres: countBy(shows.map((event) => event.subGenre)).filter((item) => !mainNames.has(item.name)) };
}

/** Genres and sub-genres matching a search, most shows first. An empty search finds nothing. */
export function searchGenres(query: string, events: ShowEvent[], today: string, filter: ShowFilter = NO_FILTER): GenreCount[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return [];
  const { genres, subGenres } = genreOptions(events, today, filter);
  const startsWith = (item: GenreCount) => (item.name.toLowerCase().startsWith(wanted) ? 0 : 1);
  return [...genres, ...subGenres]
    .filter((item) => item.name.toLowerCase().includes(wanted))
    .sort((a, b) => startsWith(a) - startsWith(b) || b.count - a.count);
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

const STATUS_LABELS: Record<string, string> = {
  rescheduled: 'Rescheduled',
  postponed: 'Postponed',
  offsale: 'Not on sale',
};

/** A label for shows that aren't simply on sale. */
export function showStatusLabel(status: string): string | null {
  return STATUS_LABELS[status] ?? null;
}
