/** Remembers facts from venues' show pages in Supabase, so pages are fetched only every few days. Script only. */
import type { SearchRow } from './audienceview.ts';
import { authHeaders, type StoreConfig } from './eventStore.ts';

/** A show page is fetched again once its facts are this old. */
export const CACHE_DAYS = 3;
/** Pages not used for this long are removed, since their shows have gone. */
const CACHE_KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CachedPage {
  fetchedAt: string;
  rows: SearchRow[];
}

export function isFresh(fetchedAt: string, now: Date, days: number = CACHE_DAYS): boolean {
  const age = now.getTime() - Date.parse(fetchedAt);
  return Number.isFinite(age) && age >= 0 && age < days * DAY_MS;
}

function endpoint(config: StoreConfig): string {
  return `${config.url.replace(/\/$/, '')}/rest/v1/venue_page_cache`;
}

async function check(response: Response, action: string): Promise<Response> {
  // Headers hold the key, so errors include only the status and Supabase's message.
  if (!response.ok) throw new Error(`Supabase cache ${action} failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  return response;
}

export async function readPageCache(config: Required<Pick<StoreConfig, 'source'>> & StoreConfig): Promise<Map<string, CachedPage>> {
  const fetcher = config.fetcher ?? fetch;
  const params = new URLSearchParams({ select: 'url,fetched_at,rows', source: `eq.${config.source}` });
  const response = await check(await fetcher(`${endpoint(config)}?${params}`, { headers: authHeaders(config.serviceKey) }), 'read');
  const rows = (await response.json()) as { url?: unknown; fetched_at?: unknown; rows?: unknown }[];
  return new Map(
    rows.flatMap((row) =>
      typeof row.url === 'string' && typeof row.fetched_at === 'string' && Array.isArray(row.rows)
        ? [[row.url, { fetchedAt: row.fetched_at, rows: row.rows as SearchRow[] }] as const]
        : [],
    ),
  );
}

/** Saves freshly fetched pages and removes ones unused for a month. */
export async function writePageCache(
  config: Required<Pick<StoreConfig, 'source'>> & StoreConfig,
  pages: Map<string, SearchRow[]>,
  now: Date,
): Promise<void> {
  const fetcher = config.fetcher ?? fetch;
  const headers = { ...authHeaders(config.serviceKey), 'Content-Type': 'application/json' };
  if (pages.size > 0) {
    const body = [...pages].map(([url, rows]) => ({ url, source: config.source, fetched_at: now.toISOString(), rows }));
    await check(
      await fetcher(`${endpoint(config)}?on_conflict=url`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(body),
      }),
      'save',
    );
  }
  const old = new Date(now.getTime() - CACHE_KEEP_DAYS * DAY_MS).toISOString();
  const params = new URLSearchParams({ source: `eq.${config.source}`, fetched_at: `lt.${old}` });
  await check(await fetcher(`${endpoint(config)}?${params}`, { method: 'DELETE', headers }), 'clean up');
}
