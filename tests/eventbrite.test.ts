import { describe, expect, it } from 'vitest';
import { fetchVenueEvents, LULA_LOUNGE, toShowEvents, venueEventsUrl, type ApiEvent } from '../src/data/eventbrite';

const venue = { ...LULA_LOUNGE, eventbriteVenueIds: ['111', '222'] };

const apiEvent = (overrides: Partial<ApiEvent> = {}): ApiEvent => ({
  id: '2000501374463',
  name: { text: 'Salsa Saturday with  Santiago Moa + DJ Van Gogh' },
  url: 'https://www.eventbrite.ca/e/salsa-saturday-tickets-2000501374463',
  start: { local: '2026-11-14T21:00:00' },
  status: 'live',
  category_id: '103',
  online_event: false,
  ticket_availability: {
    is_sold_out: false,
    minimum_ticket_price: { major_value: '20.00', currency: 'CAD' },
    maximum_ticket_price: { major_value: '45.00', currency: 'CAD' },
  },
  ...overrides,
});

describe('toShowEvents', () => {
  it('keeps the facts and links to the Eventbrite page', () => {
    expect(toShowEvents([apiEvent()], venue)).toEqual([
      {
        id: '2000501374463',
        name: 'Salsa Saturday with Santiago Moa + DJ Van Gogh',
        date: '2026-11-14',
        time: '21:00:00',
        status: 'onsale',
        url: 'https://www.eventbrite.ca/e/salsa-saturday-tickets-2000501374463',
        venueId: 'lula-lounge',
        category: 'Music',
        genre: null,
        subGenre: null,
        artists: [],
        priceMin: 20,
        priceMax: 45,
        currency: 'CAD',
        ageLabel: null,
        imageUrl: null,
        firstSeenAt: null,
      },
    ]);
  });

  it('reads sold out and cancelled events, and skips online or incomplete ones', () => {
    const shows = toShowEvents(
      [
        apiEvent({ id: 'sold', ticket_availability: { is_sold_out: true } }),
        apiEvent({ id: 'off', status: 'canceled' }),
        apiEvent({ id: 'online', online_event: true }),
        apiEvent({ id: 'nostart', start: {} }),
      ],
      venue,
    );
    expect(shows.map((show) => [show.id, show.status, show.priceMin])).toEqual([
      ['sold', 'soldout', null],
      ['off', 'cancelled', 20],
    ]);
  });

  it('uses the title rules first, and Eventbrite’s music category only as a fallback', () => {
    expect(toShowEvents([apiEvent({ name: { text: 'Comedy Night' } })], venue)[0]?.category).toBe('Comedy');
    expect(toShowEvents([apiEvent({ name: { text: 'Mystery Night' }, category_id: '105' })], venue)[0]?.category).toBe('Other');
  });
});

describe('fetchVenueEvents', () => {
  it('reads every page of every venue record, with the token in a header, never the address', async () => {
    const calls: { url: string; auth: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).Authorization! });
      const firstOf111 = url.includes('/111/') && !url.includes('page=');
      const id = url.includes('/222/') ? 'c' : firstOf111 ? 'a' : 'b';
      // The same event under both records is kept once.
      const events = id === 'c' ? [apiEvent({ id: 'c' }), apiEvent({ id: 'a' })] : [apiEvent({ id })];
      return new Response(JSON.stringify({ events, pagination: { has_more_items: firstOf111, page_number: firstOf111 ? 1 : 2 } }));
    }) as unknown as typeof fetch;
    const events = await fetchVenueEvents(venue, 'SECRET', fetcher);
    expect(events.map((event) => event.id)).toEqual(['a', 'b', 'c']);
    expect(calls.map((call) => call.url)).toEqual([venueEventsUrl('111'), venueEventsUrl('111', 2), venueEventsUrl('222')]);
    expect(calls.every((call) => call.auth === 'Bearer SECRET' && !call.url.includes('SECRET'))).toBe(true);
    expect(venueEventsUrl('111')).not.toContain('page_size');
  });

  it('reports only the status on an error, and needs a venue id', async () => {
    const fetcher = (async () => new Response('{"error":"INVALID_AUTH"}', { status: 401 })) as unknown as typeof fetch;
    await expect(fetchVenueEvents(venue, 'SECRET', fetcher)).rejects.toThrow(/^Eventbrite returned 401 for lula/);
    await expect(fetchVenueEvents({ ...LULA_LOUNGE, eventbriteVenueIds: [] }, 'SECRET', fetcher)).rejects.toThrow('no Eventbrite venue id');
  });
});
