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
    const { source, source_id: sourceId, name, local_date: date, local_time: time, status, url, venue_id: venueId } = row;
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
        select: 'source,source_id,venue_id,name,local_date,local_time,status,url',
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

/** A venue's shows from today on, since the file can be a few days old. They're already in date order. */
export function upcomingShows(events: ShowEvent[], venueId: string, today: string): ShowEvent[] {
  return events.filter((event) => event.venueId === venueId && event.date >= today);
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
