import { describe, expect, it } from 'vitest';
import {
  createFetch,
  fetchShows,
  isAllowedUrl,
  listingUrl,
  parsePerformance,
  productionUrl,
  readProduction,
  readProductionIds,
  SCARBOROUGH_VILLAGE_THEATRE as venue,
} from '../src/data/artsPeople';

/** A production page shaped like Arts People's, with each performance in its own small table. */
function production(title: string, performances: [string, string][]): string {
  const rows = performances
    .map(([when, note]) => `<TR><TD><TABLE><TR><TD><span class="normal" id="x">${when}</span></TD></TR><TR><TD>${note}</TD></TR></TABLE></TD></TR>`)
    .join('');
  return `<meta property="og:title" content="${title}" /><p>A description that is never kept</p>
<TABLE ID="TBLperformances" class="htable">${rows}</TABLE>
<p>*This performance is sold out.</p><p>Regular - $34</p><p>12 and under - $28</p><p>A non-refundable ticketing fee of $3 is included.</p>`;
}

describe('parsePerformance', () => {
  it('reads dates with ordinal days and 12-hour times', () => {
    expect(parsePerformance('Sat, Nov 7th, 2026 at 8:00 pm')).toEqual({ date: '2026-11-07', time: '20:00:00' });
    expect(parsePerformance('Sun, Nov 22nd, 2026 at 12:30 pm')).toEqual({ date: '2026-11-22', time: '12:30:00' });
    expect(parsePerformance('Thu, Jan 1st, 2027')).toEqual({ date: '2027-01-01', time: null });
  });
});

describe('readProduction', () => {
  it('reads each performance with its own status, and the price range without the fee', () => {
    const html = production('Anything Goes &amp; More', [
      ['Sat, Nov 7th, 2026 at 8:00 pm', 'This performance no longer on sale online. Please call the box office.'],
      ['Sun, Nov 8th, 2026 at 2:00 pm', '*See below'],
      ['Thu, Nov 12th, 2026 at 8:00 pm', ''],
      ['Thu, Nov 5th, 2026 at 8:00 pm', ''],
    ]);
    const shows = readProduction(html, '314082', venue, '2026-11-07');
    expect(shows.map((show) => [show.date, show.time, show.status])).toEqual([
      ['2026-11-07', '20:00:00', 'offsale'],
      ['2026-11-08', '14:00:00', 'soldout'],
      ['2026-11-12', '20:00:00', 'onsale'],
    ]);
    expect(shows[0]).toMatchObject({
      id: '314082@2026-11-07T20:00:00',
      name: 'Anything Goes & More',
      priceMin: 28,
      priceMax: 34,
      category: 'Theatre',
      url: 'https://app.arts-people.com/?show=314082',
      venueId: 'scarborough-village-theatre',
    });
    expect(JSON.stringify(shows)).not.toContain('never kept');
  });

  it('gives nothing without a name or a performance list', () => {
    expect(readProduction('<TABLE ID="TBLperformances"></TABLE>', '1', venue, '2026-11-07')).toEqual([]);
    expect(readProduction('<meta property="og:title" content="X" />', '1', venue, '2026-11-07')).toEqual([]);
  });
});

describe('fetchShows', () => {
  it('reads the box office, then each production page, and allows nothing else', async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      if (url === listingUrl(venue)) return new Response('<a href="/?show=1">Buy</a><a href="/?show=2">Buy</a><a href="/?show=1">Buy</a>');
      return new Response(production(url.endsWith('=1') ? 'One' : 'Two', [['Sat, Nov 14th, 2026 at 8:00 pm', '']]));
    }) as unknown as typeof fetch;
    const shows = await fetchShows(venue, '2026-11-07', createFetch(venue, { fetcher, wait: async () => {} }));
    expect(requested).toEqual([listingUrl(venue), productionUrl('1'), productionUrl('2')]);
    expect(shows.map((show) => show.name)).toEqual(['One', 'Two']);
    expect(readProductionIds('<a href="/?show=9">')).toEqual(['9']);
    expect(isAllowedUrl(venue, 'https://app.arts-people.com/index.php?cart=tscar')).toBe(false);
  });

  it('stops when the box office lists no productions', async () => {
    const fetcher = (async () => new Response('<html>new layout</html>')) as unknown as typeof fetch;
    await expect(fetchShows(venue, '2026-11-07', createFetch(venue, { fetcher }))).rejects.toThrow('no productions');
  });
});
