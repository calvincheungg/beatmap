import { describe, expect, it } from 'vitest';
import { authHeaders, isSafeToPrune, retentionCutoff, syncEvents, torontoDate } from '../src/data/eventStore';
import type { ShowEvent } from '../src/data/ticketmaster';

const event = (id: string): ShowEvent => ({
  id,
  name: id,
  date: '2026-12-01',
  time: '20:00:00',
  status: 'onsale',
  url: 'https://www.ticketmaster.ca/x',
  venueId: 'v',
  genre: 'Rock',
  subGenre: null,
});

interface Call {
  method: string;
  url: URL;
  body: unknown;
  headers: Record<string, string>;
}

function fakeSupabase(stored: number, failOn?: string) {
  const calls: Call[] = [];
  const fetcher = (async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({
      method,
      url: new URL(input),
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: init.headers as Record<string, string>,
    });
    if (failOn === method) return new Response('denied', { status: 401 });
    if (method === 'GET') return new Response('[]', { headers: { 'content-range': `0-0/${stored}` } });
    return new Response(null, { status: 201 });
  }) as unknown as typeof fetch;
  return { calls, config: { url: 'https://x.supabase.co/', serviceKey: 'sb_secret_SECRET', fetcher } };
}

const runStart = new Date('2026-11-06T18:00:00Z');

describe('dates', () => {
  it('uses the Toronto date, not UTC', () => {
    expect(torontoDate(new Date('2026-11-07T02:00:00Z'))).toBe('2026-11-06');
  });

  it('keeps 30 days back, across month ends', () => {
    expect(retentionCutoff('2026-11-06')).toBe('2026-10-07');
    expect(retentionCutoff('2026-03-01')).toBe('2026-01-30');
  });
});

describe('authHeaders', () => {
  it('sends new keys only as apikey, and old ones as a bearer token too', () => {
    expect(authHeaders('sb_secret_x')).toEqual({ apikey: 'sb_secret_x' });
    expect(authHeaders('eyJ.old')).toEqual({ apikey: 'eyJ.old', Authorization: 'Bearer eyJ.old' });
  });
});

describe('isSafeToPrune', () => {
  it('blocks when far fewer events than usual arrive', () => {
    expect(isSafeToPrune(600, 650)).toBe(true);
    expect(isSafeToPrune(100, 650)).toBe(false);
    expect(isSafeToPrune(5, 0)).toBe(true);
  });
});

describe('syncEvents', () => {
  it('saves rows, then removes unlisted and expired events', async () => {
    const { calls, config } = fakeSupabase(1);
    expect(await syncEvents([event('a')], runStart, config)).toEqual({ saved: 1, pruned: true });

    const save = calls.find((call) => call.method === 'POST')!;
    expect(save.url.searchParams.get('on_conflict')).toBe('source,source_id');
    expect(save.headers.Prefer).toContain('merge-duplicates');
    expect(save.body).toEqual([
      {
        source: 'ticketmaster',
        source_id: 'a',
        venue_id: 'v',
        name: 'a',
        local_date: '2026-12-01',
        local_time: '20:00:00',
        status: 'onsale',
        url: 'https://www.ticketmaster.ca/x',
        genre: 'Rock',
        sub_genre: null,
        fetched_at: '2026-11-06T18:00:00.000Z',
      },
    ]);

    const [stale, expired] = calls.filter((call) => call.method === 'DELETE');
    expect(stale!.url.searchParams.get('local_date')).toBe('gte.2026-11-06');
    expect(stale!.url.searchParams.get('fetched_at')).toBe('lt.2026-11-06T18:00:00.000Z');
    expect(stale!.url.searchParams.get('source')).toBe('eq.ticketmaster');
    expect(expired!.url.searchParams.get('local_date')).toBe('lt.2026-10-07');
    expect(expired!.url.searchParams.get('source')).toBe('eq.ticketmaster');
  });

  it('saves in batches', async () => {
    const { calls, config } = fakeSupabase(0);
    await syncEvents(Array.from({ length: 1200 }, (_, i) => event(String(i))), runStart, config);
    expect(calls.filter((call) => call.method === 'POST').map((call) => (call.body as unknown[]).length)).toEqual([500, 500, 200]);
  });

  it('keeps unlisted events after a suspiciously small fetch, but still expires old ones', async () => {
    const { calls, config } = fakeSupabase(650);
    expect((await syncEvents([event('a')], runStart, config)).pruned).toBe(false);
    const deletes = calls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.url.searchParams.get('local_date')).toBe('lt.2026-10-07');
  });

  it('stops before deleting if saving fails, without exposing the key', async () => {
    const { calls, config } = fakeSupabase(1, 'POST');
    const error = await syncEvents([event('a')], runStart, config).catch((caught: unknown) => caught);
    expect(String(error)).toContain('401');
    expect(String(error)).not.toContain('SECRET');
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });
});
