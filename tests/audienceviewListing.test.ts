import { describe, expect, it } from 'vitest';
import {
  articleUrl,
  createSearch,
  fetchFromShowPages,
  fetchListing,
  FLATO_MARKHAM_THEATRE as venue,
  isAllowedUrl,
  listingPageUrl,
  performanceFacts,
  readSessionToken,
  toShowEvents,
} from '../src/data/audienceview';
import { isFresh, readPageCache, writePageCache } from '../src/data/pageCache';

/** A page shaped like the site's: embedded arrays, paging and the session token. */
function page(rows: Record<string, string>[], current = 1, total = 1, token = 'tok1'): string {
  const names = ['id', 'object_type', 'name', 'description', 'short_description', 'start_date_time', 'start_date_date', 'start_date_month', 'start_date_year', 'sales_status', 'availability_status', 'availability_num', 'access', 'venue_name', 'venue_short_description', 'min_price', 'max_price', 'image1'];
  return `<script>var articleContext = { searchNames : [ ${names.map((n) => `"${n}"`).join(', ')} ],
  searchResults : [ ${rows.map((row) => `[ ${names.map((n) => JSON.stringify(row[n] ?? '')).join(', ')} ]`).join(',\n')} ],
  pagination: { current_page: "${current}", page_size: "12", total_pages: "${total}" },
  sToken: "${token}"};</script>`;
}

const listed = (id: string, title: string) => ({ id, object_type: 'A', short_description: title, description: 'Sunday, November 8 | 11AM & 2PM' });
const performance = (id: string, overrides: Record<string, string> = {}) => ({
  id,
  object_type: 'P',
  name: '26Pavlo28Nov26E',
  short_description: 'Pavlo',
  description: 'A long description that must never be kept',
  image1: '/content/Images/pavlo.jpg',
  start_date_time: '20:00',
  start_date_date: '28',
  start_date_month: '10',
  start_date_year: '2026',
  sales_status: 'S',
  availability_status: 'L',
  availability_num: '60',
  access: 'Public',
  venue_name: 'UPDATED Flato Markham Theatre Reserved',
  venue_short_description: 'Flato Markham Theatre',
  min_price: '$20.00',
  max_price: '$88.00',
  ...overrides,
});

describe('listing urls', () => {
  it('starts at the listing page, then pages with the session token', () => {
    expect(listingPageUrl(venue, 1, '')).toBe(articleUrl(venue, venue.listingArticleId!));
    const second = listingPageUrl(venue, 2, '1,abc=');
    expect(second).toContain('sToken=1%2Cabc%3D');
    expect(second).toContain('SearchResultsInfo::current_page=2');
    expect(isAllowedUrl(venue, second)).toBe(true);
    expect(isAllowedUrl(venue, articleUrl(venue, 'x'))).toBe(true);
    expect(isAllowedUrl(venue, `${venue.onlineUrl}default.asp?sToken=1&BOparam::WSorder::cart=1`)).toBe(false);
  });

  it('reads the token for the next page', () => {
    expect(readSessionToken(page([], 1, 6, '1,fe34,ab=='))).toBe('1,fe34,ab==');
    expect(readSessionToken('<html></html>')).toBeNull();
  });
});

describe('fetchListing', () => {
  it('reads every page in one session, sending the cookie back', async () => {
    const requests: { url: string; cookie?: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      requests.push({ url, cookie: (init.headers as Record<string, string>).Cookie });
      const second = url.includes('current_page=2');
      const headers = new Headers();
      if (!second) headers.append('Set-Cookie', 'ASPSESSIONID=abc123; path=/; HttpOnly');
      return new Response(second ? page([listed('b', 'Show B')], 2, 2, 'tok2') : page([listed('a', 'Show A')], 1, 2, 'tok1'), { headers });
    }) as unknown as typeof fetch;
    const shows = await fetchListing(venue, createSearch(venue, { fetcher, wait: async () => {} }));
    expect(shows).toEqual([
      { articleId: 'a', title: 'Show A' },
      { articleId: 'b', title: 'Show B' },
    ]);
    expect(requests[1]!.url).toContain('sToken=tok1');
    expect(requests[1]!.cookie).toBe('ASPSESSIONID=abc123');
  });
});

describe('show pages', () => {
  it('keeps only performance facts, tagged with their page', () => {
    const [facts] = performanceFacts([performance('p1'), listed('other', 'Other') as never], 'art1');
    expect(facts).toMatchObject({ id: 'p1', article_id: 'art1', min_price: '$20.00' });
    expect(facts).not.toHaveProperty('description');
    expect(facts).not.toHaveProperty('image1');
  });

  it('turns facts into shows that link to their own page, matching the short venue name', () => {
    const [show] = toShowEvents(performanceFacts([performance('p1')], 'art1'), venue);
    expect(show).toMatchObject({ name: 'Pavlo', date: '2026-11-28', time: '20:00:00', priceMin: 20, priceMax: 88, venueId: 'flato-markham-theatre' });
    expect(show!.url).toBe(articleUrl(venue, 'art1'));
  });

  it('reuses fresh cached pages and fetches new or old ones', async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      if (url.includes(venue.listingArticleId!)) return new Response(page([listed('fresh', 'Fresh'), listed('old', 'Old'), listed('new', 'New')]));
      return new Response(page([performance(url.includes('old') ? 'p-old' : 'p-new')]));
    }) as unknown as typeof fetch;
    const cached = new Map([
      [articleUrl(venue, 'fresh'), { fetchedAt: 'recent', rows: [{ id: 'p-fresh' }] }],
      [articleUrl(venue, 'old'), { fetchedAt: 'stale', rows: [{ id: 'p-stale' }] }],
    ]);
    const result = await fetchFromShowPages(venue, createSearch(venue, { fetcher, wait: async () => {} }), cached, (at) => at === 'recent');
    expect(result.reused).toBe(1);
    expect([...result.fetched.keys()]).toEqual([articleUrl(venue, 'old'), articleUrl(venue, 'new')]);
    expect(result.rows.map((row) => row.id)).toEqual(['p-fresh', 'p-old', 'p-new']);
    expect(urls).toHaveLength(3);
  });
});

describe('page cache', () => {
  const now = new Date('2026-11-08T12:00:00Z');

  it('counts pages under three days old as fresh', () => {
    expect(isFresh('2026-11-06T12:00:01Z', now)).toBe(true);
    expect(isFresh('2026-11-05T12:00:00Z', now)).toBe(false);
    expect(isFresh('not a date', now)).toBe(false);
  });

  it('reads and saves pages for one source, and clears old ones', async () => {
    const calls: { method: string; url: URL; body?: unknown }[] = [];
    const fetcher = (async (input: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? 'GET', url: new URL(input), body: init.body ? JSON.parse(init.body as string) : undefined });
      if (!init.method) return new Response(JSON.stringify([{ url: 'https://a', fetched_at: '2026-11-07T00:00:00Z', rows: [{ id: 'p' }] }, { url: 5 }]));
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const config = { url: 'https://x.supabase.co', serviceKey: 'sb_secret_x', source: 'audienceview:flato', fetcher };

    expect(await readPageCache(config)).toEqual(new Map([['https://a', { fetchedAt: '2026-11-07T00:00:00Z', rows: [{ id: 'p' }] }]]));
    await writePageCache(config, new Map([['https://b', [{ id: 'q' }]]]), now);
    const save = calls.find((call) => call.method === 'POST')!;
    expect(save.body).toEqual([{ url: 'https://b', source: 'audienceview:flato', fetched_at: now.toISOString(), rows: [{ id: 'q' }] }]);
    const clean = calls.find((call) => call.method === 'DELETE')!;
    expect(clean.url.searchParams.get('source')).toBe('eq.audienceview:flato');
    expect(clean.url.searchParams.get('fetched_at')).toBe('lt.2026-10-09T12:00:00.000Z');
  });
});
