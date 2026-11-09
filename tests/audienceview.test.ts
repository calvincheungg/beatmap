import { describe, expect, it } from 'vitest';
import {
  articleUrl,
  createSearch,
  fetchSearchRows,
  findArticleId,
  isArticleUrl,
  linkShowPages,
  hasMorePages,
  isAllowedUrl,
  parseEmbeddedResults,
  parseMoney,
  RICHMOND_HILL_CENTRE as venue,
  searchUrl,
  showUrl,
  toShowEvents,
  USER_AGENT,
} from '../src/data/audienceview';
import { classifyShow } from '../src/data/categories';

const FIELDS = [
  'id', 'object_type', 'category', 'name', 'short_description', 'start_date_time', 'start_date_date', 'start_date_month',
  'start_date_year', 'sales_status', 'availability_status', 'availability_num', 'access', 'venue_name', 'series_name',
  'min_price', 'max_price',
] as const;

type Row = Partial<Record<(typeof FIELDS)[number], string>>;

const performance = (overrides: Row = {}): Row => ({
  id: 'E0D16154-8A41-437B-99A1-9355D4A84F11',
  object_type: 'P',
  category: '',
  name: 'renter_daalband_20270205',
  short_description: 'DAAL BAND LIVE IN TORONTO',
  start_date_time: '20:00',
  start_date_date: '5',
  start_date_month: '1',
  start_date_year: '2027',
  sales_status: 'S',
  availability_status: 'E',
  availability_num: '441',
  access: 'Public',
  venue_name: 'Richmond Hill Centre for the Performing Arts',
  series_name: 'DAAL BAND LIVE IN TORONTO',
  min_price: '$93.77',
  max_price: '$143.77',
  ...overrides,
});

/** A search page shaped like the real one: the arrays sit inside a JavaScript object, not JSON. */
function page(rows: Row[], totalPages = 1): string {
  const cells = (row: Row) => `[ ${FIELDS.map((field) => JSON.stringify(row[field] ?? '')).join(', ')}, ["1","2"], "" ]`;
  return `<html><script>
var articleContext = {  searchHeaders : [ "Id" ],
  searchNames : [ ${FIELDS.map((field) => `"${field}"`).join(', ')}, "options", "" ],
  searchResults : [
    ${rows.map(cells).join(',\n    ')}
  ],
  searchLabels: { no_results_message: "We\\'re sorry, there are no events [matching] your search." },
  pagination: { current_page: "1", page_size: "20", total_pages: "${totalPages}" },
  sToken: "1,abc"};
</script></html>`;
}

describe('parseEmbeddedResults', () => {
  it('pairs field names with each row, coping with JavaScript-only escapes and brackets in strings', () => {
    // The page writes an apostrophe as \', which JSON doesn't allow.
    const html = page([performance({ short_description: "Sophie's [Surprise]" })]).replace("Sophie's", "Sophie\\'s");
    const [row] = parseEmbeddedResults(html)!;
    expect(row).toMatchObject({ id: 'E0D16154-8A41-437B-99A1-9355D4A84F11', object_type: 'P', min_price: '$93.77', options: ['1', '2'] });
    expect(row!.short_description).toBe("Sophie's [Surprise]");
  });

  it('reads a search with no matches as empty, and a page that is not the site as null, like a bot check', () => {
    const noMatches = '<script>var articleContext = { searchLabels: { no_results_message: "We\\\'re sorry" }, sToken: "1"};</script>';
    expect(parseEmbeddedResults(noMatches)).toEqual([]);
    expect(parseEmbeddedResults('<html><title>Just a moment...</title></html>')).toBeNull();
  });

  it('knows when a search filled more than one page', () => {
    expect(hasMorePages(page([], 2))).toBe(true);
    expect(hasMorePages(page([], 1))).toBe(false);
  });
});

describe('toShowEvents', () => {
  const parse = (rows: Row[]) => toShowEvents(parseEmbeddedResults(page(rows))!, venue);

  it('keeps only the facts, with a link back to the venue', () => {
    expect(parse([performance()])).toEqual([
      {
        id: 'E0D16154-8A41-437B-99A1-9355D4A84F11',
        name: 'DAAL BAND LIVE IN TORONTO',
        date: '2027-02-05',
        time: '20:00:00',
        status: 'onsale',
        url: showUrl(venue, 'DAAL BAND LIVE IN TORONTO'),
        venueId: 'richmond-hill-centre-for-the-performing-arts',
        genre: null,
        subGenre: null,
        category: 'Music',
        artists: [],
        priceMin: 93.77,
        priceMax: 143.77,
        currency: 'CAD',
        ageLabel: null,
        imageUrl: null,
        firstSeenAt: null,
      },
    ]);
  });

  it("drops test listings, add-ons, other venues' shows and private ones", () => {
    const rows = [
      performance({ id: 'fake', short_description: 'Fake Event 2026', category: 'Fake Event' }),
      performance({ id: 'debit', short_description: 'DEBIT TEST - FAKE PAGE (1)' }),
      performance({ id: 'bar', short_description: 'Bar Add On 1 - Event' }),
      performance({ id: 'away', venue_name: 'Villanova College' }),
      performance({ id: 'private', access: 'Private' }),
      performance({ id: 'bundle', object_type: 'B' }),
      performance({ id: 'nodate', start_date_year: '' }),
      performance({ id: 'keep' }),
    ];
    expect(parse(rows).map((show) => show.id)).toEqual(['keep']);
  });

  it('removes the venue prefix and reads sold out and off-sale shows', () => {
    const [soldOut, offSale] = parse([
      performance({ id: 'a', short_description: 'RHCPA Presents - Five for Fighting with Strings', availability_status: 'S' }),
      performance({ id: 'b', start_date_date: '6', sales_status: 'C' }),
    ]);
    expect(soldOut).toMatchObject({ name: 'Five for Fighting with Strings', status: 'soldout' });
    expect(offSale?.status).toBe('offsale');
  });

  it('treats a missing or zero price as unknown', () => {
    expect(parse([performance({ min_price: '$0.00', max_price: '$0.00' })])[0]).toMatchObject({ priceMin: null, priceMax: null, currency: null });
    expect(parseMoney('$1,250.50')).toBe(1250.5);
  });
});

describe('urls', () => {
  it('searches performances in a date range, and allows only searches', () => {
    const url = searchUrl(venue, '2026-12-25', '2026-12-31');
    expect(url).toContain('object_type_filter=P');
    expect(url).toContain('search_from=2026-12-25');
    expect(isAllowedUrl(venue, url)).toBe(true);
    expect(isAllowedUrl(venue, showUrl(venue, 'Elvis'))).toBe(true);
    expect(isAllowedUrl(venue, 'https://www.rhcentre.ca/Online/seatSearch.asp?x=1')).toBe(false);
    expect(isAllowedUrl(venue, 'https://www.rhcentre.ca/Online/default.asp?doWork::WScontent::search=1&BOparam::WSorder::cart=1')).toBe(false);
    expect(isAllowedUrl(venue, 'https://example.com/Online/default.asp?doWork::WScontent::search=1&x')).toBe(false);
  });
});

describe('fetchSearchRows', () => {
  const run = async (respond: (from: string, to: string) => Response) => {
    const requests: { url: string; agent: string }[] = [];
    const waits: number[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      requests.push({ url, agent: (init.headers as Record<string, string>)['User-Agent']! });
      const params = new URL(url).search;
      const from = /search_from=([\d-]+)/.exec(params)![1]!;
      const to = /search_to=([\d-]+)/.exec(params)![1]!;
      return respond(from, to);
    }) as unknown as typeof fetch;
    const rows = await fetchSearchRows(venue, { today: '2026-11-07', fetcher, wait: async (ms) => void waits.push(ms) });
    return { rows, requests, waits };
  };

  it('covers the next year in windows, two seconds apart, as BeatMap', async () => {
    const { rows, requests, waits } = await run(() => new Response(page([performance()])));
    expect(requests.length).toBe(13);
    expect(requests[0]!.url).toContain('search_from=2026-11-07');
    expect(requests.at(-1)!.url).toContain('search_to=2027-11-07');
    expect(new Set(requests.map((request) => request.agent))).toEqual(new Set([USER_AGENT]));
    expect(waits).toEqual(Array(12).fill(2000));
    expect(rows.length).toBe(13);
  });

  it('splits a window that fills a page', async () => {
    let first = true;
    const { requests } = await run((from) => {
      const full = from === '2026-11-07' && first;
      first = false;
      return new Response(page([], full ? 2 : 1));
    });
    expect(requests[1]!.url).toContain('search_from=2026-11-07');
    expect(requests[1]!.url).toContain('search_to=2026-11-21');
    expect(requests[2]!.url).toContain('search_from=2026-11-22');
  });

  it('stops at an error or a page without results, without retrying', async () => {
    await expect(run(() => new Response('blocked', { status: 403 }))).rejects.toThrow('403');
    await expect(run(() => new Response('<title>Just a moment...</title>'))).rejects.toThrow('Stopping');
  });
});

describe('show pages', () => {
  const article = (id: string, name: string, title: string): Row => ({ id, object_type: 'A', name, short_description: title });
  const rowsOf = (rows: Row[]) => parseEmbeddedResults(page(rows))!;

  it('finds the page whose name starts with one of the show dates, preferring the same title', () => {
    const rows = rowsOf([
      performance(),
      article('other', '20261112RHCPAPresentsCALBillyJoel-S17', 'Classic Albums Live: Billy Joel'),
      article('daal', '20270205DaalBand-R', 'DAAL BAND LIVE IN TORONTO'),
      article('sameday', '20270205SomethingElse-R', 'Something Else'),
    ]);
    expect(findArticleId(rows, 'DAAL BAND LIVE IN TORONTO', ['2027-02-05'])).toBe('daal');
    expect(findArticleId(rows, 'Classic Albums Live: Billy Joel', ['2026-11-11', '2026-11-12'])).toBe('other');
    expect(findArticleId(rows, 'Nothing Matches', ['2030-01-01'])).toBeNull();
  });

  it('builds a direct link to the page that works without a session', () => {
    const url = articleUrl(venue, '4DC7F095-13A4-43B2-B116-2F4A803DD4EA');
    expect(url).toBe(
      'https://www.rhcentre.ca/Online/default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=4DC7F095-13A4-43B2-B116-2F4A803DD4EA',
    );
    expect(isArticleUrl(url)).toBe(true);
    expect(isArticleUrl(showUrl(venue, 'x'))).toBe(false);
  });

  it('reuses known pages, looks up new ones once per title, and keeps the search link when none is found', async () => {
    const shows = toShowEvents(
      rowsOf([
        performance({ id: 'p1', short_description: 'Known Show' }),
        performance({ id: 'p2', short_description: 'DAAL BAND LIVE IN TORONTO' }),
        performance({ id: 'p3', short_description: 'DAAL BAND LIVE IN TORONTO', start_date_date: '6' }),
        performance({ id: 'p4', short_description: 'Lost Show' }),
      ]),
      venue,
    );
    const searched: string[] = [];
    const fetcher = (async (url: string) => {
      searched.push(decodeURIComponent(/search_criteria=([^&]*)/.exec(url)![1]!));
      return new Response(page(url.includes('DAAL') ? [article('daal', '20270205DaalBand-R', 'DAAL BAND LIVE IN TORONTO')] : []));
    }) as unknown as typeof fetch;
    const known = new Map([['Known Show', articleUrl(venue, 'known')]]);
    const missing = await linkShowPages(shows, venue, known, createSearch(venue, { fetcher, wait: async () => {} }));

    expect(searched).toEqual(['DAAL BAND LIVE IN TORONTO', 'Lost Show']);
    expect(missing).toBe(1);
    const urlOf = (id: string) => shows.find((show) => show.id === id)!.url;
    expect(urlOf('p1')).toBe(articleUrl(venue, 'known'));
    expect(urlOf('p2')).toBe(articleUrl(venue, 'daal'));
    expect(urlOf('p3')).toBe(articleUrl(venue, 'daal'));
    expect(urlOf('p4')).toBe(showUrl(venue, 'Lost Show'));
  });
});

describe('classifyShow', () => {
  it('sorts shows into categories, with a genre when the title is clear', () => {
    const cases: [string, string, string | null][] = [
      ['The Nutcracker by Victoria Ballet Company', 'Dance', null],
      ['Fast Times 80s Dance Party!', 'Music', null],
      ['Dance Division 018 | NOV 27 | Guaranteed dancing', 'Music', null],
      ['Alice in Wonderland. A Christmas Musical', 'Theatre', null],
      ['The Reel Thing Film Series', 'Film', null],
      ['RHPO A Holiday Dream', 'Music', 'Classical'],
      ["Bizet's Carmen", 'Theatre', null],
      ['Rising Stars: Classical Recital Series Mira Kardan', 'Music', 'Classical'],
      ['First Ladies of Jazz', 'Music', 'Jazz'],
      ['DAAL BAND LIVE IN TORONTO', 'Music', null],
      ['Matthew Good and His Band featuring Kevin Fox and His String Quartet', 'Music', null],
      ['Алиса в Стране Чудес. Главная Ёлка Торонто', 'Family', null],
      ["Sophie's Surprise", 'Other', null],
      ['Trivia Night @ Castros', 'Games', null],
      ['Little Magic Sam', 'Music', 'Blues'],
      ['Little Magic Sam Band (BACKROOM)', 'Music', 'Blues'],
      ['Big Little Magic Samantha', 'Other', null],
      ['Dogs Do Magic Show', 'Family', null],
    ];
    for (const [title, category, genre] of cases) expect(classifyShow(title), title).toMatchObject({ category, genre });
    expect(classifyShow('Classic Albums Live: The Beatles').subGenre).toBe('Tribute');
    expect(classifyShow('Beatlemania: The Liverpool 4').subGenre).toBe('Tribute');
    expect(classifyShow('The Eagles Tribute Band').subGenre).toBe('Tribute');
    expect(classifyShow('Tapestry The Carole King Songbook').subGenre).toBe('Tribute');
    for (const title of ['Brass Transit', 'Canadian Brass', 'Adaptive Performances: Ladom Ensemble', 'Holly Cole: Swinging Christmas 2026']) {
      expect(classifyShow(title).category, title).toBe('Music');
    }
  });
});
