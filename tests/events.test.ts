import { describe, expect, it } from 'vitest';
import {
  artistsNotInTitle,
  formatShowDate,
  formatShowTime,
  genreOptions,
  isAdultsOnly,
  isFiltering,
  NO_FILTER,
  loadEvents,
  matchesFilter,
  matchingShows,
  parseEventRows,
  priceLabel,
  searchGenres,
  searchShows,
  showStatusLabel,
  todayString,
  upcomingShows,
  venuesWithShows,
  type ShowEvent,
} from '../src/data/events';

const show = (id: string, venueId: string, date: string, genre: string | null = null, subGenre: string | null = null): ShowEvent => ({
  id,
  name: id,
  date,
  time: '20:00:00',
  status: 'onsale',
  url: `https://www.ticketmaster.ca/event/${id}`,
  venueId,
  genre,
  subGenre,
  artists: [],
  priceMin: null,
  priceMax: null,
  currency: null,
  ageLabel: null,
});

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  source: 'ticketmaster',
  source_id: id,
  venue_id: 'v',
  name: id,
  local_date: '2026-12-01',
  local_time: '20:00:00',
  status: 'onsale',
  url: `https://www.ticketmaster.ca/event/${id}`,
  genre: 'Rock',
  sub_genre: 'Punk',
  artists: ['A Band'],
  price_min: 25.5,
  price_max: 40,
  currency: 'CAD',
  age_restriction: 'All ages',
  ...overrides,
});

describe('parseEventRows', () => {
  it('maps a row to an event', () => {
    expect(parseEventRows([row('a')])).toEqual([
      {
        id: 'ticketmaster:a',
        name: 'a',
        date: '2026-12-01',
        time: '20:00:00',
        status: 'onsale',
        url: 'https://www.ticketmaster.ca/event/a',
        venueId: 'v',
        genre: 'Rock',
        subGenre: 'Punk',
        artists: ['A Band'],
        priceMin: 25.5,
        priceMax: 40,
        currency: 'CAD',
        ageLabel: 'All ages',
      },
    ]);
  });

  it('drops malformed rows and unsafe links', () => {
    const rows = [row('good'), row('link', { url: 'javascript:alert(1)' }), row('date', { local_date: 'soon' }), { source_id: 'partial' }];
    expect(parseEventRows(rows).map((event) => event.name)).toEqual(['good']);
  });

  it('allows a missing time', () => {
    expect(parseEventRows([row('a', { local_time: null })])[0]?.time).toBeNull();
  });

  it('rejects anything that is not a list', () => {
    expect(() => parseEventRows({})).toThrow();
  });
});

describe('loadEvents', () => {
  it('returns null without configuration, and makes no request', async () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response('[]');
    }) as unknown as typeof fetch;
    expect(await loadEvents(undefined, 'key', fetcher)).toBeNull();
    expect(called).toBe(false);
  });

  it('asks only for upcoming events from the view, with the public key', async () => {
    let requested: URL | undefined;
    let headers: Record<string, string> = {};
    const fetcher = (async (input: string, init: RequestInit) => {
      requested = new URL(input);
      headers = init.headers as Record<string, string>;
      return new Response(JSON.stringify([row('a')]));
    }) as unknown as typeof fetch;
    expect(await loadEvents('https://x.supabase.co/', 'sb_publishable_abc', fetcher)).toHaveLength(1);
    expect(requested?.pathname).toBe('/rest/v1/events_with_timing');
    expect(requested?.searchParams.get('timing')).toBe('eq.upcoming');
    expect(headers).toEqual({ apikey: 'sb_publishable_abc' });
  });

  it('reads every page', async () => {
    const offsets: string[] = [];
    const fetcher = (async (input: string) => {
      const offset = new URL(input).searchParams.get('offset')!;
      offsets.push(offset);
      const count = offset === '0' ? 1000 : 3;
      return new Response(JSON.stringify(Array.from({ length: count }, (_, i) => row(`${offset}-${i}`))));
    }) as unknown as typeof fetch;
    expect(await loadEvents('https://x.supabase.co', 'key', fetcher)).toHaveLength(1003);
    expect(offsets).toEqual(['0', '1000']);
  });

  it('returns null on errors', async () => {
    const denied = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    const offline = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await loadEvents('https://x.supabase.co', 'key', denied)).toBeNull();
    expect(await loadEvents('https://x.supabase.co', 'key', offline)).toBeNull();
  });
});

describe('upcomingShows', () => {
  it('keeps this venue from today on', () => {
    const events = [show('past', 'v', '2026-11-05'), show('today', 'v', '2026-11-06'), show('later', 'v', '2026-12-01'), show('other', 'w', '2026-12-01')];
    expect(upcomingShows(events, 'v', '2026-11-06').map((event) => event.id)).toEqual(['today', 'later']);
  });
});

describe('genres', () => {
  const today = '2026-11-06';
  const events = [
    show('old', 'gone', '2026-11-01', 'Polka'),
    show('a', 'v', '2026-12-01', 'Rock', 'Punk'),
    show('b', 'v', '2026-12-02', 'Rock', 'Emo'),
    show('c', 'w', '2026-12-03', 'Pop', 'K-Pop'),
    show('d', 'w', '2026-12-04', null, null),
  ];

  const genre = (name: string | null) => ({ ...NO_FILTER, genre: name });

  it('matches a genre or sub-genre, and no filter matches everything', () => {
    expect(matchesFilter(events[1]!, genre('Rock'))).toBe(true);
    expect(matchesFilter(events[1]!, genre('Punk'))).toBe(true);
    expect(matchesFilter(events[1]!, genre('Pop'))).toBe(false);
    expect(matchesFilter(events[4]!, genre(null))).toBe(true);
    expect(matchesFilter(events[4]!, genre('Rock'))).toBe(false);
  });

  it('matches dates inclusively, on either or both ends', () => {
    const day = events[1]!; // 2026-12-01
    expect(matchesFilter(day, { ...NO_FILTER, from: '2026-12-01', to: '2026-12-01' })).toBe(true);
    expect(matchesFilter(day, { ...NO_FILTER, from: '2026-12-02' })).toBe(false);
    expect(matchesFilter(day, { ...NO_FILTER, to: '2026-11-30' })).toBe(false);
  });

  it('combines genre and dates', () => {
    expect(matchingShows(events, today, { ...NO_FILTER, genre: 'Rock', from: '2026-12-02' }).map((event) => event.id)).toEqual(['b']);
  });

  it('filters by the cheapest ticket, leaving out shows without a price', () => {
    const cheap: ShowEvent = { ...show('cheap', 'v', '2026-12-01'), priceMin: 20, priceMax: 60 };
    const dear: ShowEvent = { ...show('dear', 'v', '2026-12-01'), priceMin: 80, priceMax: 80 };
    const unknown = show('unknown', 'v', '2026-12-01');
    expect(matchingShows([cheap, dear, unknown], today, { ...NO_FILTER, maxPrice: 50 }).map((event) => event.id)).toEqual(['cheap']);
    expect(matchingShows([cheap, dear, unknown], today, { ...NO_FILTER, maxPrice: 80 }).map((event) => event.id)).toEqual(['cheap', 'dear']);
  });

  it('filters by age, leaving out shows that do not say', () => {
    const allAges: ShowEvent = { ...show('all', 'v', '2026-12-01'), ageLabel: 'All ages' };
    const adults: ShowEvent = { ...show('adults', 'v', '2026-12-01'), ageLabel: '19+' };
    const unknown = show('unknown', 'v', '2026-12-01');
    const ids = (age: 'all-ages' | 'adults') => matchingShows([allAges, adults, unknown], today, { ...NO_FILTER, age }).map((event) => event.id);
    expect(ids('all-ages')).toEqual(['all']);
    expect(ids('adults')).toEqual(['adults']);
    expect(isAdultsOnly('18+')).toBe(true);
    expect(isAdultsOnly('All ages')).toBe(false);
  });

  it('knows when a filter is on', () => {
    expect(isFiltering(genre(null))).toBe(false);
    expect(isFiltering(genre('Rock'))).toBe(true);
    expect(isFiltering({ ...NO_FILTER, from: today })).toBe(true);
    expect(isFiltering({ ...NO_FILTER, maxPrice: 25 })).toBe(true);
    expect(isFiltering({ ...NO_FILTER, age: 'adults' })).toBe(true);
  });

  it('filters a venue', () => {
    expect(upcomingShows(events, 'v', today, genre('Emo')).map((event) => event.id)).toEqual(['b']);
    expect(upcomingShows(events, 'w', today, genre('Rock'))).toEqual([]);
    expect(upcomingShows(events, 'v', today)).toHaveLength(2);
  });

  it('finds venues with a matching upcoming show', () => {
    expect(venuesWithShows(events, today, genre('Rock'))).toEqual(new Set(['v']));
    expect(venuesWithShows(events, today, genre('Polka'))).toEqual(new Set());
    expect(venuesWithShows(events, today)).toEqual(new Set(['v', 'w']));
  });

  it('lists main genres and sub-genres separately, most shows first', () => {
    expect(genreOptions(events, today)).toEqual({
      genres: [
        { name: 'Rock', count: 2 },
        { name: 'Pop', count: 1 },
      ],
      subGenres: [
        { name: 'Emo', count: 1 },
        { name: 'K-Pop', count: 1 },
        { name: 'Punk', count: 1 },
      ],
    });
  });

  it('counts genres within the date range, ignoring the genre choice', () => {
    const options = genreOptions(events, today, { ...NO_FILTER, genre: 'Pop', from: '2026-12-02', to: '2026-12-02' });
    expect(options.genres).toEqual([{ name: 'Rock', count: 1 }]);
    expect(options.subGenres).toEqual([{ name: 'Emo', count: 1 }]);
  });

  it('searches genres and sub-genres, best match first', () => {
    expect(searchGenres('emo', events, today)).toEqual([{ name: 'Emo', count: 1 }]);
    expect(searchGenres('POP', events, today).map((item) => item.name)).toEqual(['Pop', 'K-Pop']);
    expect(searchGenres('', events, today)).toEqual([]);
    expect(searchGenres('polka', events, today)).toEqual([]);
  });
});

describe('searchShows', () => {
  const today = '2026-11-06';
  const tribute: ShowEvent = { ...show('tribute', 'v', '2026-12-05'), name: 'Everybody Knows Leonard Cohen', artists: ['Feist', 'Rufus Wainwright'] };
  const bjork: ShowEvent = { ...show('bjork', 'w', '2026-12-01'), name: 'An Evening', artists: ['Björk'] };
  const past: ShowEvent = { ...show('past', 'v', '2026-11-01'), name: 'Old Feist Show', artists: ['Feist'] };
  const titled: ShowEvent = { ...show('titled', 'w', '2026-11-20'), name: 'Dead Tired w/ Single Wound', artists: [] };
  const events = [past, titled, bjork, tribute];

  it('finds support acts that are not in the title, naming the artist', () => {
    expect(searchShows('feist', events, today)).toEqual([{ show: tribute, artist: 'Feist' }]);
  });

  it('finds shows with no artist list by their title', () => {
    expect(searchShows('single wound', events, today)).toEqual([{ show: titled, artist: null }]);
  });

  it('ignores case and accents, and skips past shows', () => {
    expect(searchShows('BJORK', events, today)[0]?.artist).toBe('Björk');
    expect(searchShows('old feist', events, today)).toEqual([]);
  });

  it('needs two letters', () => {
    expect(searchShows('f', events, today)).toEqual([]);
    expect(searchShows('  ', events, today)).toEqual([]);
  });

  it('puts names starting with the search first, then the soonest, up to the limit', () => {
    const a: ShowEvent = { ...show('a', 'v', '2026-11-10'), name: 'The Rock Band' };
    const b: ShowEvent = { ...show('b', 'v', '2026-12-10'), name: 'Rock Night' };
    const c: ShowEvent = { ...show('c', 'v', '2026-12-20'), name: 'Rock Party' };
    expect(searchShows('rock', [a, b, c], today).map((match) => match.show.id)).toEqual(['b', 'c', 'a']);
    expect(searchShows('rock', [a, b, c], today, 1)).toHaveLength(1);
  });

  it('lists only artists missing from the title', () => {
    expect(artistsNotInTitle({ ...tribute, artists: ['Feist', 'Leonard Cohen'] })).toEqual(['Feist']);
  });
});

describe('formatting', () => {
  it('formats dates without shifting the day', () => {
    expect(formatShowDate('2026-12-04')).toBe('Fri, Dec 4');
    expect(formatShowDate('2027-01-01')).toBe('Fri, Jan 1');
  });

  it('formats times in 12 hours', () => {
    expect(formatShowTime('19:30:00')).toBe('7:30 PM');
    expect(formatShowTime('00:05:00')).toBe('12:05 AM');
    expect(formatShowTime('12:00:00')).toBe('12:00 PM');
    expect(formatShowTime(null)).toBeNull();
  });

  it('shows one price as it is, and a range as the lowest price', () => {
    expect(priceLabel({ priceMin: 24.92, priceMax: 24.92, currency: 'CAD' })).toBe('$24.92');
    expect(priceLabel({ priceMin: 100, priceMax: 100, currency: 'CAD' })).toBe('$100');
    expect(priceLabel({ priceMin: 100, priceMax: 250, currency: 'CAD' })).toBe('From $100');
    expect(priceLabel({ priceMin: 8.1, priceMax: 13.58, currency: 'CAD' })).toBe('From $8.10');
  });

  it('shows nothing when the price is unknown', () => {
    expect(priceLabel({ priceMin: null, priceMax: null, currency: null })).toBeNull();
  });

  it('names any currency other than Canadian dollars', () => {
    expect(priceLabel({ priceMin: 50, priceMax: 50, currency: 'USD' })).toBe('USD $50');
    expect(priceLabel({ priceMin: 50, priceMax: 50, currency: null })).toBe('$50');
  });

  it('labels only unusual statuses', () => {
    expect(showStatusLabel('rescheduled')).toBe('Rescheduled');
    expect(showStatusLabel('onsale')).toBeNull();
  });

  it('gives today in local time', () => {
    expect(todayString(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06');
  });
});
