import { describe, expect, it } from 'vitest';
import {
  formatShowDate,
  formatShowTime,
  genreOptions,
  loadEvents,
  matchesGenre,
  parseEventRows,
  searchGenres,
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

  it('matches a genre or sub-genre, and null matches everything', () => {
    expect(matchesGenre(events[1]!, 'Rock')).toBe(true);
    expect(matchesGenre(events[1]!, 'Punk')).toBe(true);
    expect(matchesGenre(events[1]!, 'Pop')).toBe(false);
    expect(matchesGenre(events[4]!, null)).toBe(true);
    expect(matchesGenre(events[4]!, 'Rock')).toBe(false);
  });

  it('filters a venue by genre', () => {
    expect(upcomingShows(events, 'v', today, 'Emo').map((event) => event.id)).toEqual(['b']);
    expect(upcomingShows(events, 'w', today, 'Rock')).toEqual([]);
    expect(upcomingShows(events, 'v', today)).toHaveLength(2);
  });

  it('finds venues with a matching upcoming show', () => {
    expect(venuesWithShows(events, today, 'Rock')).toEqual(new Set(['v']));
    expect(venuesWithShows(events, today, 'Polka')).toEqual(new Set());
    expect(venuesWithShows(events, today)).toEqual(new Set(['v', 'w']));
  });

  it('lists upcoming main genres, most shows first, skipping empty ones', () => {
    expect(genreOptions(events, today)).toEqual([
      { name: 'Rock', count: 2 },
      { name: 'Pop', count: 1 },
    ]);
  });

  it('searches genres and sub-genres, best match first', () => {
    expect(searchGenres('emo', events, today)).toEqual([{ name: 'Emo', count: 1 }]);
    expect(searchGenres('POP', events, today).map((item) => item.name)).toEqual(['Pop', 'K-Pop']);
    expect(searchGenres('', events, today)).toEqual([]);
    expect(searchGenres('polka', events, today)).toEqual([]);
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

  it('labels only unusual statuses', () => {
    expect(showStatusLabel('rescheduled')).toBe('Rescheduled');
    expect(showStatusLabel('onsale')).toBeNull();
  });

  it('gives today in local time', () => {
    expect(todayString(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06');
  });
});
