import { describe, expect, it } from 'vitest';
import * as tz from '../src/data/tranzac';

/** An event page's Nuxt payload: a flat array where an object's values are positions of other entries. */
function eventPage(slug: string, title: string, start: string, description = ''): string {
  const payload = [{ data: 1 }, { event: 2 }, { slug: 3, title: 4, startDate: 5, description: 6, rooms: 7 }, slug, title, start, description, ['Southern Cross']];
  return `<html><body><h1>${title}</h1><p>Wednesday, November 11, 2026, 2:30AM</p><script type="application/json" id="__NUXT_DATA__" data-ssr="true">${JSON.stringify(payload)}</script></body></html>`;
}

function sitemap(entries: [string, string][]): string {
  return `<?xml version="1.0"?><urlset>${entries.map(([loc, lastmod]) => `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`).join('')}</urlset>`;
}

describe('Tranzac event pages', () => {
  it("reads the page's own event from its payload, not the UTC time printed on the page", () => {
    const facts = tz.readEventPage(
      eventPage('dimetapp-2026-11-10', 'DIMETAPP', '2026-11-10T21:30:00-05:00', '<p>Four improvisers. $10 suggested, 19+</p>'),
      'https://tranzac.org/events/dimetapp-2026-11-10',
    );
    expect(facts).toEqual({ title: 'DIMETAPP', start: '2026-11-10T21:30:00-05:00', prices: [10], ageLabel: '19+' });
    expect(tz.readEventPage('<html>no payload</html>', 'https://tranzac.org/events/x')).toBeNull();
    expect(tz.readEventPage(eventPage('other-show', 'Other', '2026-11-10T20:00:00-05:00'), 'https://tranzac.org/events/x')).toBeNull();
  });

  it('builds shows in Toronto time, leaving out past events, room bookings and open hours', () => {
    const pages = new Map<string, tz.EventFacts | null>([
      ['https://tranzac.org/events/dimetapp-2026-11-10', { title: 'DIMETAPP', start: '2026-11-11T02:30:00Z', prices: [], ageLabel: null }],
      ['https://tranzac.org/events/old-2026-11-01', { title: 'Old', start: '2026-11-01T20:00:00-04:00', prices: [], ageLabel: null }],
      ['https://tranzac.org/events/zine-2026-11-10', { title: 'Toronto Zine Library Open Hours', start: '2026-11-10T18:00:00-05:00', prices: [], ageLabel: null }],
      ['https://tranzac.org/events/private-event11', { title: 'Private Event', start: '2026-11-10T18:00:00-05:00', prices: [], ageLabel: null }],
      ['https://tranzac.org/events/empty', null],
    ]);
    const shows = tz.toShowEvents(pages, '2026-11-09');
    expect(shows.map((show) => [show.id, show.date, show.time, show.venueId, show.category])).toEqual([['dimetapp-2026-11-10', '2026-11-10', '21:30:00', 'tranzac-club', 'Music']]);
  });

  it('picks dated pages in the window ahead, nearest first, then recently changed undated ones, never room bookings', () => {
    const pages = tz.readSitemap(
      sitemap([
        ['https://tranzac.org/events/later-2026-11-20', '2026-11-01T00:00:00Z'],
        ['https://tranzac.org/events/soon-2026-11-10', '2026-11-01T00:00:00Z'],
        ['https://tranzac.org/events/past-2026-11-01', '2026-11-01T00:00:00Z'],
        ['https://tranzac.org/events/far-2027-03-01', '2026-11-01T00:00:00Z'],
        ['https://tranzac.org/events/opera-pub11', '2026-11-08T00:00:00Z'],
        ['https://tranzac.org/events/old-undated', '2025-01-01T00:00:00Z'],
        ['https://tranzac.org/events/private-booking-2026-11-12', '2026-11-08T00:00:00Z'],
        ['https://tranzac.org/about', '2026-11-08T00:00:00Z'],
      ]),
    );
    expect(tz.pagesToRead(pages, '2026-11-09')).toEqual([
      'https://tranzac.org/events/soon-2026-11-10',
      'https://tranzac.org/events/later-2026-11-20',
      'https://tranzac.org/events/opera-pub11',
    ]);
  });

  it('reuses fresh cached pages and finished events, and asks only for allowed addresses', async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      if (url === tz.SITEMAP) {
        return new Response(
          sitemap([
            ['https://tranzac.org/events/a-2026-11-10', '2026-11-01T00:00:00Z'],
            ['https://tranzac.org/events/b-2026-11-11', '2026-11-01T00:00:00Z'],
            ['https://tranzac.org/events/done', '2026-11-08T00:00:00Z'],
          ]),
        );
      }
      return new Response(eventPage('b-2026-11-11', 'B', '2026-11-11T20:00:00-05:00'));
    }) as unknown as typeof fetch;
    const cached = new Map([
      ['https://tranzac.org/events/a-2026-11-10', { fetchedAt: 'fresh', rows: [{ title: 'A', start: '2026-11-10T20:00:00-05:00', prices: [], ageLabel: null }] }],
      ['https://tranzac.org/events/done', { fetchedAt: 'stale', rows: [{ title: 'Done', start: '2026-11-02T20:00:00-05:00', prices: [], ageLabel: null }] }],
    ]);
    const result = await tz.fetchShows('2026-11-09', cached, (fetchedAt) => fetchedAt === 'fresh', tz.createFetch({ fetcher, wait: async () => {} }));
    expect(requested).toEqual([tz.SITEMAP, 'https://tranzac.org/events/b-2026-11-11']);
    expect(result.reused).toBe(2);
    expect(result.events.map((show) => show.name)).toEqual(['A', 'B']);
    expect(tz.isAllowedUrl('https://tranzac.org/api/events')).toBe(false);
    expect(tz.isAllowedUrl('https://tranzac.org/calendar')).toBe(false);
  });

  it('stops when event pages no longer hold event data', async () => {
    const fetcher = (async (url: string) =>
      new Response(url === tz.SITEMAP ? sitemap([['https://tranzac.org/events/a-2026-11-10', '2026-11-01T00:00:00Z']]) : '<html>new layout</html>')) as unknown as typeof fetch;
    await expect(tz.fetchShows('2026-11-09', new Map(), () => false, tz.createFetch({ fetcher, wait: async () => {} }))).rejects.toThrow('no event data');
  });
});
