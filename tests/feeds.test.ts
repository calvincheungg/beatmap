import { describe, expect, it } from 'vitest';
import * as admitOne from '../src/data/admitOne';
import * as elfsight from '../src/data/elfsightCalendar';
import { ageFrom, decodeText, dollarAmounts, makeShow, statusFromTitle, torontoDateTime } from '../src/data/feedShow';
import * as showpass from '../src/data/showpass';
import * as tribe from '../src/data/tribeEvents';

describe('feed helpers', () => {
  it('decodes entities and reads prices and ages from free text', () => {
    expect(decodeText('The Tim Hamel Quartet&#8217;s &#8220;Hour&#8221; &amp; more')).toBe('The Tim Hamel Quartet’s “Hour” & more');
    expect(dollarAmounts('$15 adv / $20 door, $0 for members')).toEqual([15, 20]);
    expect(ageFrom('19+ Doors 9pm')).toBe('19+');
    expect(ageFrom('All Ages matinee, 19+ evening')).toBe('All ages');
    expect(ageFrom('$19+ tax')).toBeNull();
    expect(statusFromTitle('CANCELLED: Quartet Night')).toBe('cancelled');
  });

  it("uses the venue's default kind when the title rules can't tell", () => {
    const facts = { id: '1', name: 'The Noah Kosta Quintet', date: '2026-11-08', time: '18:00:00', url: 'https://x/1', venueId: 'jazz-bistro' };
    expect(makeShow(facts, { category: 'Music', genre: 'Jazz' })).toMatchObject({ category: 'Music', genre: 'Jazz', status: 'onsale', priceMin: null });
    expect(makeShow({ ...facts, name: 'Comedy Night' }, { category: 'Music', genre: 'Jazz' })).toMatchObject({ category: 'Comedy', genre: null });
    expect(makeShow({ ...facts, name: 'Trivia Night @ Castros' }, { category: 'Music' })).toMatchObject({ category: 'Games', genre: null });
    expect(makeShow({ ...facts, priceMin: 0, priceMax: 25 }, { category: 'Music' })).toMatchObject({ priceMin: 25, priceMax: 25, currency: 'CAD' });
  });

  it('turns a UTC moment into Toronto date and time, across daylight saving', () => {
    expect(torontoDateTime(new Date('2026-11-08T01:00:00.000Z'))).toEqual({ date: '2026-11-07', time: '20:00:00' });
    expect(torontoDateTime(new Date('2026-07-01T23:30:00.000Z'))).toEqual({ date: '2026-07-01', time: '19:30:00' });
  });
});

describe('tribe events (Jazz Bistro)', () => {
  const venue = tribe.JAZZ_BISTRO;
  const event = (overrides: Partial<tribe.TribeEvent> = {}): tribe.TribeEvent => ({
    id: 10586,
    title: 'The Tim Hamel Quartet&#8217;s Hour',
    url: 'https://jazzbistro.ca/event/hour-158/',
    start_date: '2026-11-07 17:00:00',
    all_day: false,
    cost: '',
    cost_details: { values: [] },
    status: 'publish',
    ...overrides,
  });

  it('reads facts, with costs when given', () => {
    const [plain, priced] = tribe.toShowEvents([event(), event({ id: 2, cost: '$20 – $35', cost_details: { values: ['20', '35'] } })], venue);
    expect(plain).toMatchObject({ id: '10586', name: 'The Tim Hamel Quartet’s Hour', date: '2026-11-07', time: '17:00:00', venueId: 'jazz-bistro', genre: 'Jazz', priceMin: null });
    expect(priced).toMatchObject({ priceMin: 20, priceMax: 35 });
    const [encoded] = tribe.toShowEvents([event({ id: 3, cost: '&#036;5.00' })], venue);
    expect(encoded).toMatchObject({ priceMin: 5, priceMax: 5 });
  });

  it('skips hidden, unpublished and incomplete events', () => {
    expect(tribe.toShowEvents([event({ hide_from_listings: true }), event({ status: 'draft' }), event({ start_date: '' })], venue)).toEqual([]);
  });

  it('pages through the API, which is the only address allowed', async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify({ events: [event({ id: requested.length })], total_pages: 2 }));
    }) as unknown as typeof fetch;
    const shows = await tribe.fetchShows(venue, '2026-11-07', tribe.createFetch(venue, { fetcher, wait: async () => {} }));
    expect(shows.map((show) => show.id)).toEqual(['1', '2']);
    expect(requested).toEqual([tribe.eventsUrl(venue, '2026-11-07'), tribe.eventsUrl(venue, '2026-11-07', 2)]);
    expect(tribe.isAllowedUrl(venue, 'https://jazzbistro.ca/event/hour-158/')).toBe(false);
  });

  it("removes a venue's title noise and the separators it leaves", () => {
    const venue = tribe.WIGGLE_ROOM;
    const [show] = tribe.toShowEvents(
      [event({ title: 'Sunday SerVice: SHERA | Manzone &#038; Strong | 4AM LAST CALL |', url: 'https://wiggleroomtoronto.com/event/x/' })],
      venue,
    );
    expect(show).toMatchObject({ name: 'Sunday SerVice: SHERA | Manzone & Strong', venueId: 'wiggle-room' });
    expect(tribe.cleanTitle('Ohh Yea Bud! | 4AM LAST CALL', venue.titleNoise)).toBe('Ohh Yea Bud!');
    expect(tribe.cleanTitle('A | B', undefined)).toBe('A | B');
  });
});

describe('Admit One (Adelaide Hall)', () => {
  const venue = admitOne.ADELAIDE_HALL;
  const event = (overrides: Partial<admitOne.AdmitOneEvent> = {}): admitOne.AdmitOneEvent => ({
    title: 'The Darcys',
    venue: 'Adelaide Hall',
    url: 'https://admitone.com/events/the-darcys-toronto-166763',
    sort_date: '2026-11-08T01:00:00.000Z',
    age_limit: '19+',
    price_range: 'Free',
    sold_out: false,
    cancelled: false,
    ...overrides,
  });

  it("reads facts in Toronto time, and treats the embed's 'Free' as unknown", () => {
    expect(admitOne.toShowEvents([event()], venue)[0]).toMatchObject({
      id: '166763',
      date: '2026-11-07',
      time: '20:00:00',
      ageLabel: '19+',
      priceMin: null,
      url: 'https://admitone.com/events/the-darcys-toronto-166763',
      venueId: 'adelaide-hall',
    });
  });

  it("reads prices, sold out and cancelled shows, and skips other venues' events", () => {
    const shows = admitOne.toShowEvents(
      [
        event({ url: 'https://admitone.com/events/a-1', price_range: '$25.00 - $40.00', sold_out: true }),
        event({ url: 'https://admitone.com/events/b-2', cancelled: true }),
        event({ url: 'https://admitone.com/events/c-3', venue: 'Velvet Underground' }),
      ],
      venue,
    );
    expect(shows.map((show) => [show.id, show.status, show.priceMin, show.priceMax])).toEqual([
      ['1', 'soldout', 25, 40],
      ['2', 'cancelled', null, null],
    ]);
  });

  it('asks only the embed API, with every venue id', () => {
    expect(admitOne.eventsUrl(venue)).toBe(`https://gateway.admitone.com/embed/live-events?venueId=${venue.admitOneVenueIds.join(',')}`);
    expect(admitOne.isAllowedUrl(admitOne.eventsUrl(venue))).toBe(true);
    expect(admitOne.isAllowedUrl('https://admitone.com/events/the-darcys-toronto-166763')).toBe(false);
  });
});

describe('Elfsight calendar (Bovine Sex Club)', () => {
  const venue = elfsight.BOVINE_SEX_CLUB;
  const event = (overrides: Partial<elfsight.ElfsightEvent> = {}): elfsight.ElfsightEvent => ({
    id: 'e1',
    name: 'SUBSUN W/ Slow Hand Of Death',
    start: { date: '2026-11-10', time: '21:00' },
    repeatPeriod: 'noRepeat',
    description: '<div><strong>SUBSUN</strong></div><br><div>19+</div><div>Doors 9pm</div><div>$15 adv / $20 @ Door</div>',
    actions: [],
    ...overrides,
  });
  const boot = (events: elfsight.ElfsightEvent[]) => ({ data: { widgets: { [venue.widgetId]: { data: { settings: { events } } } } } });

  it("reads the calendar's events, with price and age from the note but never the note itself", () => {
    const [show] = elfsight.toShowEvents(elfsight.readEvents(boot([event()]), venue), venue, '2026-11-07');
    expect(show).toMatchObject({ id: 'e1', date: '2026-11-10', time: '21:00:00', priceMin: 15, priceMax: 20, ageLabel: '19+', url: venue.siteUrl, category: 'Music' });
    expect(JSON.stringify(show)).not.toContain('Doors');
  });

  it('skips past and repeating events, and uses a ticket link when one is given', () => {
    const shows = elfsight.toShowEvents(
      [
        event({ id: 'old', start: { date: '2026-11-01', time: '21:00' } }),
        event({ id: 'weekly', repeatPeriod: 'weekly' }),
        event({ id: 'linked', actions: [{ link: { value: 'https://www.ticketweb.ca/event/x' } }] }),
      ],
      venue,
      '2026-11-07',
    );
    expect(shows.map((show) => [show.id, show.url])).toEqual([['linked', 'https://www.ticketweb.ca/event/x']]);
  });

  it('asks only for the widget data', () => {
    expect(elfsight.isAllowedUrl(elfsight.bootUrl(venue))).toBe(true);
    expect(elfsight.isAllowedUrl('https://core.service.elfsight.com/p/boot/?w=x&extra=1')).toBe(false);
    expect(elfsight.readEvents({ unexpected: true }, venue)).toEqual([]);
  });
});

describe('Elfsight calendar with event types (JCCC)', () => {
  const venue = elfsight.JAPANESE_CANADIAN_CULTURAL_CENTRE;
  const types = [
    { id: 'ev', name: 'Event' },
    { id: 'film', name: 'Film' },
    { id: 'prog', name: 'Programs' },
    { id: 'exh', name: 'Exhibition' },
  ];
  const event = (id: string, name: string, eventType: string[]): elfsight.ElfsightEvent => ({
    id,
    name,
    start: { date: '2026-12-05', time: '14:00' },
    repeatPeriod: 'noRepeat',
    eventType,
    actions: [{ link: { value: `https://jccc.on.ca/event/${id}` } }],
  });
  const body = { data: { widgets: { [venue.widgetId]: { data: { settings: { eventTypes: types, events: [] } } } } } };

  it('leaves out classes and exhibitions, and gives films the Film category', () => {
    const shows = elfsight.toShowEvents(
      [
        event('film', 'ALL THE LOVERS IN THE NIGHT', ['ev', 'film']),
        event('recital', 'Aimi Kobayashi Piano Recital', ['ev']),
        event('dinner', 'The Ishizue Award Dinner', ['ev']),
        event('cooking', 'Cooking for Active Seniors', ['ev', 'prog']),
        event('indigo', 'A life of creativity in Indigo', ['exh']),
      ],
      venue,
      '2026-11-08',
      elfsight.readEventTypes(body, venue),
    );
    expect(shows.map((show) => [show.id, show.category])).toEqual([
      ['film', 'Film'],
      ['recital', 'Music'],
      ['dinner', 'Other'],
    ]);
    expect(shows[0]).toMatchObject({ venueId: 'japanese-canadian-cultural-centre', url: 'https://jccc.on.ca/event/film' });
  });

  it('reads no types from unexpected data', () => {
    expect(elfsight.readEventTypes({ unexpected: true }, venue).size).toBe(0);
  });
});

describe('Showpass (Burdock Music Hall)', () => {
  const venue = showpass.BURDOCK_MUSIC_HALL;
  const event = (overrides: Partial<showpass.ShowpassEvent> = {}): showpass.ShowpassEvent => ({
    slug: 'sheal-w-claire-davis',
    name: 'SHEAL w/ Claire Davis',
    starts_on: '2026-11-09T01:00:00Z',
    frontend_details_url: 'https://www.showpass.com/sheal-w-claire-davis/',
    status: 'sp_event_active',
    sold_out: false,
    inventory_sold_out: false,
    venue: { id: 17330 },
    sub_items: [{ price: '22.00' }, { price: '35.00' }],
    ...overrides,
  });

  it('reads facts in Toronto time, with prices from the ticket types', () => {
    expect(showpass.toShowEvents([event()], venue)[0]).toMatchObject({
      id: 'sheal-w-claire-davis',
      date: '2026-11-08',
      time: '20:00:00',
      priceMin: 22,
      priceMax: 35,
      status: 'onsale',
      url: 'https://www.showpass.com/sheal-w-claire-davis/',
      venueId: 'burdock-music-hall',
    });
  });

  it("reads sold out and cancelled shows, and skips undated or other venues' shows", () => {
    const shows = showpass.toShowEvents(
      [
        event({ slug: 'a', inventory_sold_out: true }),
        event({ slug: 'b', status: 'sp_event_cancelled' }),
        event({ slug: 'c', date_time_to_be_determined: true }),
        event({ slug: 'd', venue: { id: 1 } }),
        event({ slug: 'e', name: 'November Folk Bundle' }),
      ],
      venue,
    );
    expect(shows.map((show) => [show.id, show.status])).toEqual([
      ['a', 'soldout'],
      ['b', 'cancelled'],
    ]);
  });

  it("follows the API's next links, and allows nothing else", async () => {
    const requested: string[] = [];
    const next = 'https://www.showpass.com/api/public/discovery/?venue__in=17330&page=2';
    const fetcher = (async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify({ results: [event({ slug: String(requested.length) })], next: requested.length === 1 ? next : null }));
    }) as unknown as typeof fetch;
    const shows = await showpass.fetchShows(venue, showpass.createFetch(venue, { fetcher, wait: async () => {} }));
    expect(shows.map((show) => show.id)).toEqual(['1', '2']);
    expect(requested).toEqual([showpass.eventsUrl(venue), next]);
    expect(showpass.isAllowedUrl('https://www.showpass.com/sheal-w-claire-davis/')).toBe(false);
  });
});
