import { describe, expect, it } from 'vitest';
import { createFetch, fetchShows, isAllowedUrl, isLastPage, listingUrl, parseWhen, RCM_HALLS, readCards, toShowEvents } from '../src/data/rcmusic';

const [koerner, mazzoleni] = RCM_HALLS as [(typeof RCM_HALLS)[0], (typeof RCM_HALLS)[0]];

/** A card shaped like rcmusic.com's. */
function card(title: string, when: string, slug: string, image = 'https://media.example/x_440x400.png'): string {
  return `<div class="cell tps-card-item tps-card-item-2-buttons"><a class="tps-card-item-image" style="background-image:url(&#x27;${image}&#x27;)" href="/concert/${slug}"></a><div class="tps-card-item-inner"><div class="tps-card-item-date"><div class="tps-card-item-date-inner">${when}</div></div><a class="tps-card-item-title h4 separator-left" href="/concert/${slug}">${title}</a><div class="tps-card-item-text"><a href="/tickets/seats/426801">Buy Tickets</a></div></div></div>`;
}

const pager = (last: boolean) =>
  `<div id="tps-aws-results-pager" class="tps-aws-results-pager-wrapper"><a class="pager-navs pager-next ${last ? 'disabled' : 'false'}" href="#">Next</a></div>`;
const page = (cards: string[], last = true) => `<div class="tps-aws-results">${cards.join('')}${pager(last)}</div>`;

describe('readCards', () => {
  it('reads title, date, page and image, decoding entities', () => {
    expect(readCards(page([card('B&eacute;la Fleck &amp; Friends', 'Nov 13, 2026 8:00 PM', 'bela-fleck-444601')]))).toEqual([
      { title: 'B&eacute;la Fleck & Friends', when: 'Nov 13, 2026 8:00 PM', path: '/concert/bela-fleck-444601', image: 'https://media.example/x_440x400.png' },
    ]);
  });
});

describe('parseWhen', () => {
  it('reads 12-hour times, including noon and midnight', () => {
    expect(parseWhen('Nov 08, 2026 3:00 PM')).toEqual({ date: '2026-11-08', time: '15:00:00' });
    expect(parseWhen('Dec 1, 2026 12:00 PM')).toEqual({ date: '2026-12-01', time: '12:00:00' });
    expect(parseWhen('Jan 02, 2027 12:30 AM')).toEqual({ date: '2027-01-02', time: '00:30:00' });
    expect(parseWhen('Mar 05, 2027')).toEqual({ date: '2027-03-05', time: null });
    expect(parseWhen('Sometime soon')).toBeNull();
  });
});

describe('toShowEvents', () => {
  it('links each concert to its page, with no price, at the right hall', () => {
    const [show] = toShowEvents(readCards(page([card('Garrick Ohlsson, piano', 'Nov 08, 2026 3:00 PM', 'garrick-ohlsson-piano-426801')])), koerner);
    expect(show).toMatchObject({
      id: 'garrick-ohlsson-piano-426801@2026-11-08T15:00:00',
      name: 'Garrick Ohlsson, piano',
      date: '2026-11-08',
      time: '15:00:00',
      status: 'onsale',
      url: 'https://www.rcmusic.com/concert/garrick-ohlsson-piano-426801',
      venueId: 'koerner-hall',
      category: 'Music',
      priceMin: null,
      priceMax: null,
      imageUrl: null,
    });
  });

  it('reads postponed and cancelled concerts from the image or title', () => {
    const shows = toShowEvents(
      readCards(
        page([
          card('Roby Lakatos', 'Dec 02, 2026 7:00 PM', 'roby-lakatos-447601', 'https://media.example/POSTPONED_Roby_Lakatos_440x400.jpg'),
          card('CANCELLED: Quartet Night', 'Dec 03, 2026 7:00 PM', 'quartet-1'),
        ]),
      ),
      mazzoleni,
    );
    expect(toShowEvents(readCards(page([card('Punch Brothers', 'Nov 17, 2026 7:00 PM', 'punch-1')])), koerner)[0]?.category).toBe('Music');
    expect(shows.map((show) => [show.name, show.status])).toEqual([
      ['Roby Lakatos', 'postponed'],
      ['Quartet Night', 'cancelled'],
    ]);
  });
});

describe('urls', () => {
  it('builds listing pages and allows nothing else', () => {
    expect(listingUrl(koerner, 1)).toBe('https://www.rcmusic.com/concerts?fq=eventvenue%7C%7CKoerner+Hall');
    expect(listingUrl(mazzoleni, 3)).toBe('https://www.rcmusic.com/concerts?fq=eventvenue%7C%7CMazzoleni+Concert+Hall&page=3');
    expect(isAllowedUrl(listingUrl(mazzoleni, 3))).toBe(true);
    expect(isAllowedUrl('https://www.rcmusic.com/tickets/seats/426801')).toBe(false);
    expect(isAllowedUrl('https://www.rcmusic.com/concert/garrick-ohlsson-piano-426801')).toBe(false);
  });

  it('knows the last page from a disabled Next button or a missing pager', () => {
    expect(isLastPage(page([], false))).toBe(false);
    expect(isLastPage(page([], true))).toBe(true);
    expect(isLastPage('<div>no pager</div>')).toBe(true);
  });
});

describe('fetchShows', () => {
  it('reads each hall page by page until the last', async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      if (url.includes('Koerner') && !url.includes('page=')) return new Response(page([card('A Concert', 'Nov 08, 2026 3:00 PM', 'a-1')], false));
      if (url.includes('Koerner')) return new Response(page([card('B Concert', 'Nov 09, 2026 3:00 PM', 'b-2')], true));
      return new Response(page([card('C Recital', 'Nov 10, 2026 7:30 PM', 'c-3')], true));
    }) as unknown as typeof fetch;
    const { events, pages } = await fetchShows(createFetch({ fetcher, wait: async () => {} }));
    expect(pages).toBe(3);
    expect(requested).toEqual([listingUrl(koerner, 1), listingUrl(koerner, 2), listingUrl(mazzoleni, 1)]);
    expect(events.map((event) => [event.name, event.venueId])).toEqual([
      ['A Concert', 'koerner-hall'],
      ['B Concert', 'koerner-hall'],
      ['C Recital', 'mazzoleni-concert-hall'],
    ]);
  });

  it('stops when a listing has no concert list at all', async () => {
    const fetcher = (async () => new Response('<html>new layout</html>')) as unknown as typeof fetch;
    await expect(fetchShows(createFetch({ fetcher }))).rejects.toThrow('new layout');
  });
});
