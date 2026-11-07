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

/** True if a show fits the genre filter. A null filter matches everything. */
export function matchesGenre(event: ShowEvent, genre: string | null): boolean {
  return genre === null || event.genre === genre || event.subGenre === genre;
}

/** A venue's shows from today on, since a page can stay open for days. They're already in date order. */
export function upcomingShows(events: ShowEvent[], venueId: string, today: string, genre: string | null = null): ShowEvent[] {
  return events.filter((event) => event.venueId === venueId && event.date >= today && matchesGenre(event, genre));
}

/** The venues with at least one upcoming show that fits the genre filter. */
export function venuesWithShows(events: ShowEvent[], today: string, genre: string | null = null): Set<string> {
  return new Set(events.filter((event) => event.date >= today && matchesGenre(event, genre)).map((event) => event.venueId));
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

/** Main genres with upcoming shows, most shows first. These fill the filter dropdown. */
export function genreOptions(events: ShowEvent[], today: string): GenreCount[] {
  return countBy(events.filter((event) => event.date >= today).map((event) => event.genre));
}

/** Genres and sub-genres matching a search, most shows first. An empty search finds nothing. */
export function searchGenres(query: string, events: ShowEvent[], today: string): GenreCount[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return [];
  const upcoming = events.filter((event) => event.date >= today);
  // Main genres count every show in them, so they take priority over a sub-genre of the same name.
  const main = countBy(upcoming.map((event) => event.genre));
  const mainNames = new Set(main.map((item) => item.name));
  const sub = countBy(upcoming.map((event) => event.subGenre)).filter((item) => !mainNames.has(item.name));
  const startsWith = (item: GenreCount) => (item.name.toLowerCase().startsWith(wanted) ? 0 : 1);
  return [...main, ...sub]
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
