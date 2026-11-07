/** Saves events to Supabase through its REST API. Runs only in the sync script, using the service key. */
import type { ShowEvent } from './ticketmaster.ts';

const SOURCE = 'ticketmaster';
const BATCH_SIZE = 500;
/** Past events are kept this long, then deleted. */
export const RETENTION_DAYS = 30;
/** A sync that finds far fewer events than are stored is probably a partial failure. */
const MIN_SAFE_RATIO = 0.5;

export interface StoreConfig {
  url: string;
  serviceKey: string;
  fetcher?: typeof fetch;
}

/** Supabase's newer `sb_` keys go only in the apikey header. Older JWT keys need both headers. */
export function authHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

/** A date in Toronto as YYYY-MM-DD. */
export function torontoDate(when: Date): string {
  return when.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

/** The first date to keep: this many days before the given Toronto date. */
export function retentionCutoff(today: string, days: number = RETENTION_DAYS): string {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

/** True if removing unlisted events looks safe, given how many we fetched and how many upcoming ones are stored. */
export function isSafeToPrune(fetched: number, stored: number): boolean {
  return fetched >= stored * MIN_SAFE_RATIO;
}

export interface SyncResult {
  saved: number;
  pruned: boolean;
}

/** Saves events, removes upcoming ones no longer listed, and deletes those past the retention period. */
export async function syncEvents(events: ShowEvent[], runStart: Date, config: StoreConfig): Promise<SyncResult> {
  const fetcher = config.fetcher ?? fetch;
  const base = `${config.url.replace(/\/$/, '')}/rest/v1/events`;
  const headers = { ...authHeaders(config.serviceKey), 'Content-Type': 'application/json' };
  const today = torontoDate(runStart);
  const fetchedAt = runStart.toISOString();

  const check = async (response: Response, action: string): Promise<Response> => {
    // Headers hold the key, so errors include only the status and Supabase's message.
    if (!response.ok) throw new Error(`Supabase ${action} failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
    return response;
  };

  const upcoming = new URLSearchParams({ select: 'source_id', source: `eq.${SOURCE}`, local_date: `gte.${today}`, limit: '1' });
  const counted = await check(
    await fetcher(`${base}?${upcoming}`, { headers: { ...headers, Prefer: 'count=exact' } }),
    'count',
  );
  const stored = Number(counted.headers.get('content-range')?.split('/')[1] ?? 0);

  for (let start = 0; start < events.length; start += BATCH_SIZE) {
    const rows = events.slice(start, start + BATCH_SIZE).map((event) => ({
      source: SOURCE,
      source_id: event.id,
      venue_id: event.venueId,
      name: event.name,
      local_date: event.date,
      local_time: event.time,
      status: event.status,
      url: event.url,
      genre: event.genre,
      sub_genre: event.subGenre,
      artists: event.artists,
      price_min: event.priceMin,
      price_max: event.priceMax,
      currency: event.currency,
      age_restriction: event.ageLabel,
      fetched_at: fetchedAt,
    }));
    await check(
      await fetcher(`${base}?on_conflict=source,source_id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      }),
      'save',
    );
  }

  // Cancelled and removed shows stop appearing in the fetch, so they're the ones left behind here.
  const pruned = isSafeToPrune(events.length, stored);
  if (pruned) {
    const stale = new URLSearchParams({ source: `eq.${SOURCE}`, local_date: `gte.${today}`, fetched_at: `lt.${fetchedAt}` });
    await check(await fetcher(`${base}?${stale}`, { method: 'DELETE', headers }), 'remove unlisted');
  }

  const expired = new URLSearchParams({ source: `eq.${SOURCE}`, local_date: `lt.${retentionCutoff(today)}` });
  await check(await fetcher(`${base}?${expired}`, { method: 'DELETE', headers }), 'remove expired');

  return { saved: events.length, pruned };
}
