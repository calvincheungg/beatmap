import type { ShowEvent } from './ticketmaster.ts';

export type { ShowEvent };

/** Reads the file written by scripts/fetch-events.ts, dropping anything malformed or with an unsafe link. */
export function parseEventsFile(data: unknown): ShowEvent[] {
  const events = (data as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) throw new Error('Not an events file');
  return (events as Partial<ShowEvent>[]).filter(
    (event): event is ShowEvent =>
      typeof event.id === 'string' &&
      typeof event.name === 'string' &&
      typeof event.venueId === 'string' &&
      typeof event.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(event.date) &&
      typeof event.url === 'string' &&
      /^https?:\/\//i.test(event.url),
  );
}

/** Loads events for the app. The file is optional, so failure means the app runs without listings. */
export async function loadEvents(url: string, fetcher: typeof fetch = fetch): Promise<ShowEvent[] | null> {
  try {
    const response = await fetcher(url);
    if (!response.ok) return null;
    return parseEventsFile(await response.json());
  } catch {
    // Dev servers answer a missing file with HTML, which fails to parse.
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
