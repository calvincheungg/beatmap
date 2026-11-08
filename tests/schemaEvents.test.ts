import { describe, expect, it } from 'vitest';
import {
  GEARY_WAREHOUSE,
  LEAH_POSLUNS_THEATRE,
  labelledPrices,
  localStart,
  shownStart,
  createFetch,
  fetchEventPages,
  isAllowedUrl,
  listEventUrls,
  readEventFacts,
  REDWOOD_THEATRE as venue,
  toShowEvents,
  type EventFacts,
} from '../src/data/schemaEvents';

/** An event page shaped like Redwood's: a schema.org Event in a JSON-LD block. */
function eventPage(overrides: Record<string, unknown> = {}, offers: Record<string, unknown> = {}): string {
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Pretzel Logic &amp; Friends — The Music of Steely Dan',
    description: 'A description that must never be kept',
    startDate: '2026-12-18T19:00:00-05:00',
    eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'Place', name: 'The Redwood Theatre', address: '1300 Gerrard St E, Toronto, ON M4L 1Y7, Canada' },
    offers: { '@type': 'AggregateOffer', lowPrice: '46.33', highPrice: '69.50', priceCurrency: 'CAD', availability: 'https://schema.org/InStock', ...offers },
    image: { url: 'https://static.wixstatic.com/media/x.png' },
    ...overrides,
  };
  return `<html><script type="application/ld+json">{"@type":"WebSite"}</script><script type="application/ld+json">${JSON.stringify(event)}</script></html>`;
}

const url = (slug: string) => `${venue.siteUrl}${venue.eventPath}${slug}`;
const shows = (pages: Record<string, string>) =>
  toShowEvents(new Map(Object.entries(pages).map(([slug, html]) => [url(slug), readEventFacts(html)])), venue);

describe('readEventFacts', () => {
  it('keeps only facts from the Event data', () => {
    const [facts] = readEventFacts(eventPage());
    expect(facts).toEqual({
      name: 'Pretzel Logic & Friends — The Music of Steely Dan',
      startDate: '2026-12-18T19:00:00-05:00',
      lowPrice: '46.33',
      highPrice: '69.50',
      currency: 'CAD',
      availability: 'InStock',
      eventStatus: 'EventScheduled',
      address: '1300 Gerrard St E, Toronto, ON M4L 1Y7, Canada',
      link: null,
    } satisfies EventFacts);
  });

  it('finds Event subtypes inside a graph, reads a single price, and skips broken blocks', () => {
    const graph = `<script type="application/ld+json">{"@graph":[{"@type":"MusicEvent","name":"Solo","startDate":"2026-12-01","location":{"address":{"streetAddress":"1300 Gerrard St E"}},"offers":{"price":"20"}}]}</script>`;
    const broken = '<script type="application/ld+json">{ not json</script>';
    expect(readEventFacts(graph + broken)).toMatchObject([{ name: 'Solo', lowPrice: '20', highPrice: '20', address: '1300 Gerrard St E' }]);
  });
});

describe('toShowEvents', () => {
  it("uses the venue's local time as published and links to the event page", () => {
    expect(shows({ 'pretzel-logic-live-2026': eventPage() })).toEqual([
      {
        id: 'event-details/pretzel-logic-live-2026',
        name: 'Pretzel Logic & Friends — The Music of Steely Dan',
        date: '2026-12-18',
        time: '19:00:00',
        status: 'onsale',
        url: url('pretzel-logic-live-2026'),
        venueId: 'the-redwood-theatre',
        category: 'Music',
        genre: null,
        subGenre: null,
        artists: [],
        priceMin: 46.33,
        priceMax: 69.5,
        currency: 'CAD',
        ageLabel: null,
        imageUrl: null,
        firstSeenAt: null,
      },
    ]);
  });

  it('reads sold out, cancelled and postponed shows, and treats a zero price as unknown', () => {
    const result = shows({
      soldout: eventPage({}, { availability: 'https://schema.org/SoldOut' }),
      cancelled: eventPage({ eventStatus: 'https://schema.org/EventCancelled' }),
      postponed: eventPage({ eventStatus: 'https://schema.org/EventPostponed' }),
      free: eventPage({}, { lowPrice: '0', highPrice: '0' }),
    });
    expect(Object.fromEntries(result.map((show) => [show.id.split('/')[1], show.status]))).toEqual({
      soldout: 'soldout',
      cancelled: 'cancelled',
      postponed: 'postponed',
      free: 'onsale',
    });
    expect(result.find((show) => show.id.endsWith('free'))).toMatchObject({ priceMin: null, priceMax: null, currency: null });
  });

  it("skips events the venue lists at another address, and pages without a date", () => {
    const elsewhere = eventPage({ location: { address: '100 Queen St W, Toronto' } });
    expect(shows({ elsewhere, nodate: eventPage({ startDate: '' }) })).toEqual([]);
  });
});

describe('urls', () => {
  it('lists each event page the listing links to, once', () => {
    const html = `<a href="${url('fm')}">FM</a><a href="/event-details/magicland">Magic</a><a href="${url('fm')}">again</a><a href="${venue.siteUrl}calendar">x</a>`;
    expect(listEventUrls(html, venue)).toEqual([url('fm'), url('magicland')]);
  });

  it('allows only the listing and event pages', () => {
    expect(isAllowedUrl(venue, venue.listingUrl)).toBe(true);
    expect(isAllowedUrl(venue, url('fm'))).toBe(true);
    expect(isAllowedUrl(venue, `${url('fm')}/ticket-form`)).toBe(false);
    expect(isAllowedUrl(venue, `${venue.siteUrl}checkout`)).toBe(false);
    expect(isAllowedUrl(venue, 'https://example.com/event-details/fm')).toBe(false);
  });
});

describe('fetchEventPages', () => {
  it('reads the listing, reuses fresh cached pages and fetches the rest', async () => {
    const requested: string[] = [];
    const fetcher = (async (address: string) => {
      requested.push(address);
      if (address === venue.listingUrl) return new Response(`<a href="${url('cached')}"></a><a href="${url('stale')}"></a><a href="${url('new')}"></a>`);
      return new Response(eventPage());
    }) as unknown as typeof fetch;
    const cached = new Map([
      [url('cached'), { fetchedAt: 'recent', rows: [{ name: 'From cache' }] }],
      [url('stale'), { fetchedAt: 'old', rows: [] }],
    ]);
    const result = await fetchEventPages(venue, createFetch(venue, { fetcher, wait: async () => {} }), cached, (at) => at === 'recent');
    expect(requested).toEqual([venue.listingUrl, url('stale'), url('new')]);
    expect(result.reused).toBe(1);
    expect([...result.fetched.keys()]).toEqual([url('stale'), url('new')]);
    expect(result.pages.get(url('cached'))).toEqual([{ name: 'From cache' }]);
  });

  it('reads events straight from a listing page, linked to their ticket pages, without fetching more', async () => {
    const event = (name: string, date: string, ticket: string, price?: string) => ({
      '@type': 'Event',
      name,
      startDate: date,
      offers: { '@type': 'Offer', url: ticket, price, priceCurrency: 'CAD', availability: 'https://schema.org/InStock' },
      location: { '@type': 'EventVenue', address: { '@type': 'PostalAddress', streetAddress: '209 Geary Ave' } },
    });
    const listing = [event('The Sponges + N2N', '2026-11-07', 'https://tickets.aftrdark.ca/e/geary/the-sponges-n2n', '33.10'), event('YUBIK', '2026-11-21', 'https://www.eventbrite.ca/e/yubik-tickets-1998407684179')]
      .map((data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`)
      .join('');
    const requested: string[] = [];
    const fetcher = (async (address: string) => {
      requested.push(address);
      return new Response(listing);
    }) as unknown as typeof fetch;
    const result = await fetchEventPages(GEARY_WAREHOUSE, createFetch(GEARY_WAREHOUSE, { fetcher, wait: async () => {} }), new Map(), () => false);
    expect(requested).toEqual([GEARY_WAREHOUSE.listingUrl]);
    const shows = toShowEvents(result.pages, GEARY_WAREHOUSE);
    expect(shows.map((show) => show.category)).toEqual(['Music', 'Music']);
    expect(shows.map((show) => [show.id, show.date, show.time, show.priceMin, show.url])).toEqual([
      ['https://tickets.aftrdark.ca/e/geary/the-sponges-n2n', '2026-11-07', null, 33.1, 'https://tickets.aftrdark.ca/e/geary/the-sponges-n2n'],
      ['https://www.eventbrite.ca/e/yubik-tickets-1998407684179', '2026-11-21', null, null, 'https://www.eventbrite.ca/e/yubik-tickets-1998407684179'],
    ]);
  });

  it('stops when the listing links to no events', async () => {
    const fetcher = (async () => new Response('<html>new layout</html>')) as unknown as typeof fetch;
    await expect(fetchEventPages(venue, createFetch(venue, { fetcher }), new Map(), () => false)).rejects.toThrow('no events');
  });
});

describe('localStart', () => {
  it('converts times with a zone to Toronto, and keeps local times and bare dates as they are', () => {
    expect(localStart('2026-11-17T01:30:00.000Z')).toEqual({ date: '2026-11-16', time: '20:30:00' });
    expect(localStart('2026-12-18T19:00:00-05:00')).toEqual({ date: '2026-12-18', time: '19:00:00' });
    expect(localStart('2026-12-18T19:00')).toEqual({ date: '2026-12-18', time: '19:00:00' });
    expect(localStart('2026-11-07')).toEqual({ date: '2026-11-07', time: null });
    expect(localStart('Nov 07, 2026')).toBeNull();
  });
});

describe('labelledPrices', () => {
  it('reads the price next to a Price label, ignoring other amounts', () => {
    expect(labelledPrices('<p>Raised $5,000 last year</p><div>Price</div><div>$35 - $50</div><div>Date and time</div>')).toEqual(['35', '50']);
    expect(labelledPrices('<div>Price</div><div>Free</div>')).toEqual([]);
  });
});

describe('shownStart', () => {
  it('reads the date and start time a page shows after its "Date and time" label', () => {
    const html = '<div>Date and time</div><div>November 16, 2026</div><div>7:30 pm</div><div>-</div><div>9:00 pm</div>';
    expect(shownStart(html)).toBe('2026-11-16T19:30');
    expect(localStart(shownStart(html)!)).toEqual({ date: '2026-11-16', time: '19:30:00' });
    expect(shownStart('<div>No date here</div>')).toBeNull();
  });
});

describe('price ranges in Event data', () => {
  it('reads a range written as one price, like "$35 - $50"', () => {
    const page = (price: string) =>
      `<script type="application/ld+json">${JSON.stringify({ '@type': 'Event', name: 'Tal Ramon', startDate: '2026-11-16T19:30', location: { address: { streetAddress: '4588 Bathurst Street' } }, offers: { price } })}</script>`;
    const shows = toShowEvents(new Map([['https://www.leahposlunstheatre.com/event/tal', readEventFacts(page('$35 - $50'))]]), LEAH_POSLUNS_THEATRE);
    expect(shows[0]).toMatchObject({ priceMin: 35, priceMax: 50 });
  });
});
