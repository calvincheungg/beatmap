import { describe, expect, it } from 'vitest';
import * as shopify from '../src/data/shopifyShows';
import * as wix from '../src/data/wixEvents';

describe('Shopify shows (The Rex)', () => {
  const venue = shopify.THE_REX;
  const product = (title: string, available = [true, true], handle = 'show-1'): shopify.ShopifyProduct => ({
    id: 1,
    title,
    handle,
    variants: [
      { price: '15.00', available: available[0] },
      { price: '25.00', available: available[1] },
    ],
  });

  it('reads the show, date and time from product titles', () => {
    expect(shopify.parseTitle('Harley Card Quintet - Sunday, November 8th, 2026 @ 8pm')).toEqual({ name: 'Harley Card Quintet', date: '2026-11-08', time: '20:00:00' });
    expect(shopify.parseTitle('Larnell Lewis & Joy Lapps - Friday, November 20th, 2026 @ 10:15PM to 11:30PM')).toEqual({
      name: 'Larnell Lewis & Joy Lapps',
      date: '2026-11-20',
      time: '22:15:00',
    });
    expect(shopify.parseTitle("**TICKETS AT THE DOOR ONLY**Kate Wyatt Trio Invites: Kelly Jefferson- Saturday, November 7th, 2026 @ 8pm")?.name).toBe('Kate Wyatt Trio Invites: Kelly Jefferson');
    expect(shopify.parseTitle("New Year's Eve Bash with Grooveyard! - Thursday, December 31st, 2026")).toEqual({ name: "New Year's Eve Bash with Grooveyard!", date: '2026-12-31', time: null });
    expect(shopify.parseTitle('Rex Gift Card')).toBeNull();
  });

  it('prices from ticket types, sold out only when nothing can be bought and tickets are not at the door', () => {
    const shows = shopify.toShowEvents(
      [
        product('A - Sunday, November 8th, 2026 @ 8pm', [true, false], 'a'),
        product('B - Monday, November 9th, 2026 @ 8pm', [false, false], 'b'),
        product('**TICKETS AT THE DOOR ONLY**C - Tuesday, November 10th, 2026 @ 8pm', [false, false], 'c'),
        product('Old - Monday, November 2nd, 2026 @ 8pm', [true, true], 'old'),
      ],
      venue,
      '2026-11-07',
    );
    expect(shows.map((show) => [show.id, show.status, show.priceMin, show.priceMax, show.genre])).toEqual([
      ['a', 'onsale', 15, 25, 'Jazz'],
      ['b', 'soldout', 15, 25, 'Jazz'],
      ['c', 'onsale', 15, 25, 'Jazz'],
    ]);
    expect(shows[0]!.url).toBe('https://www.therexshop.ca/products/a');
  });

  it('asks only for the collection feed', () => {
    expect(shopify.isAllowedUrl(venue, shopify.productsUrl(venue))).toBe(true);
    expect(shopify.isAllowedUrl(venue, 'https://www.therexshop.ca/cart.js')).toBe(false);
  });
});

describe('Wix events widget (The Cameron House)', () => {
  const venue = wix.THE_CAMERON_HOUSE;
  const event = (overrides: Partial<wix.WixEvent> = {}): wix.WixEvent => ({
    id: 'e1',
    title: 'Little Magic Sam',
    slug: 'little-magic-sam',
    status: 0,
    scheduling: { config: { scheduleTbd: false, startDate: '2026-11-08T03:00:00.000Z' } },
    location: { address: '408 Queen St W, Toronto, ON M5V 2A7, Canada' },
    registration: { type: 4, ticketing: { soldOut: true } },
    ...overrides,
  });
  const page = (events: wix.WixEvent[]) => `<script>{"other":{"events":[1,2]},"widget":{"events":${JSON.stringify(events)},"hasMore":false}}</script>`;

  it('reads embedded events in Toronto time, linking to the listing when there is no ticket page', () => {
    const [show] = wix.toShowEvents(wix.readEvents(page([event()])), venue, '2026-11-07');
    expect(show).toMatchObject({ id: 'e1', name: 'Little Magic Sam', date: '2026-11-07', time: '22:00:00', status: 'onsale', url: venue.listingUrl, category: 'Music' });
  });

  it("ignores Wix's sold-out flag unless Wix sells the tickets, and uses external ticket links", () => {
    const shows = wix.toShowEvents(
      [
        event({ id: 'walkin' }),
        event({ id: 'dice', registration: { type: 3, external: { registration: 'https://dice.fm/event/x' }, ticketing: { soldOut: true } } }),
        event({ id: 'wixsold', registration: { type: 2, ticketing: { soldOut: true, lowestPrice: '$15.00', highestPrice: '$20.00' } } }),
        event({ id: 'off', status: 3 }),
      ],
      venue,
      '2026-11-07',
    );
    expect(shows.map((show) => [show.id, show.status, show.priceMin, show.url])).toEqual([
      ['walkin', 'onsale', null, venue.listingUrl],
      ['dice', 'onsale', null, 'https://dice.fm/event/x'],
      ['wixsold', 'soldout', 15, venue.listingUrl],
      ['off', 'cancelled', null, venue.listingUrl],
    ]);
  });

  it('skips past events, other addresses and unscheduled ones', () => {
    const shows = wix.toShowEvents(
      [
        event({ id: 'past', scheduling: { config: { startDate: '2026-10-12T22:00:00.000Z' } } }),
        event({ id: 'away', location: { address: '1 Yonge St' } }),
        event({ id: 'tbd', scheduling: { config: { scheduleTbd: true, startDate: '2026-11-20T01:00:00.000Z' } } }),
      ],
      venue,
      '2026-11-07',
    );
    expect(shows).toEqual([]);
  });
});
