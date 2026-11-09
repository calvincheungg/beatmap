import { describe, expect, it } from 'vitest';
import * as badDog from '../src/data/badDog';
import * as comedyBar from '../src/data/comedyBar';
import { SOCAP_COMEDY, toShowEvents as eventbriteShows, type ApiEvent } from '../src/data/eventbrite';
import * as showpass from '../src/data/showpass';
import * as yukYuks from '../src/data/yukYuks';

describe('Bad Dog Theatre', () => {
  const item = (path: string, title: string, when: string, address: string[]) =>
    `<li> <h1><a href="${path}">${title} </a></h1> <div><img src="x.jpg"></div> <div> ${when} </div> <div> <ul> ${address
      .map((line) => `<li>${line}</li>`)
      .join(' ')} <li><a href="http://maps.google.com?q=x"></a></li> </ul> </div> </li>`;
  const page = (items: string[]) => `<div class="sqs-events-collection-calendar"></div> <noscript> <ul> ${items.join(' ')} </ul> </noscript>`;

  it('files each show under the theatre whose address it gives, skipping past shows and other places', () => {
    const shows = badDog.readShows(
      page([
        item('/whats-on/2026/7/29/atomic-dog', 'Atomic Dog - Standup &amp; Storytelling', 'Wednesday, November 25, 2026, 8:30 PM &ndash; 9:30 PM', ['Sweet Action Theatre', '180 Shaw Street', 'Toronto, ON, M6J 2W5']),
        item('/whats-on/after-party', 'The After Party', 'Saturday, November 21, 2026, 9:30 PM &ndash; 10:30 PM', ['Society Clubhouse', '967 College Street', 'Toronto, ON']),
        item('/whats-on/old', 'Old Show', 'Wednesday, November 4, 2026, 7:00 PM &ndash; 8:00 PM', ['Sweet Action', '180 Shaw Street, Unit #106']),
        item('/whats-on/elsewhere', 'Festival Set', 'Friday, November 27, 2026, 7:00 PM &ndash; 8:00 PM', ['Factory Theatre', '125 Bathurst Street']),
      ]),
      '2026-11-09',
    );
    expect(shows.map((show) => [show.name, show.date, show.time, show.venueId, show.category])).toEqual([
      ['Atomic Dog - Standup & Storytelling', '2026-11-25', '20:30:00', 'sweet-action-theatre', 'Comedy'],
      ['The After Party', '2026-11-21', '21:30:00', 'society-clubhouse', 'Comedy'],
    ]);
    expect(shows[0]?.url).toBe('https://baddogtheatre.com/whats-on/2026/7/29/atomic-dog');
  });

  it('reads only the What\'s On page, and stops if its plain list is gone', async () => {
    expect(badDog.isAllowedUrl(badDog.WHATS_ON)).toBe(true);
    expect(badDog.isAllowedUrl('https://baddogtheatre.com/whats-on?format=json')).toBe(false);
    const fetcher = (async () => new Response('<html>new layout</html>')) as unknown as typeof fetch;
    await expect(badDog.fetchShows('2026-11-09', badDog.createFetch({ fetcher }))).rejects.toThrow('no show list');
  });
});

describe("Yuk Yuk's Toronto", () => {
  const card = (name: string, days: string, dates: string, month: string, times: string[], path: string) =>
    `<div data-year="2026" data-month="${month}"></div><div class="border-[1px]"><div class="font-bold lg:text-5xl text-3xl uppercase"> ${name} </div>
<div class="lg:max-w-screen-sm">Kept out</div><div class="font-medium uppercase text-xl lg:text-2xl">${days}</div>
<div class="font-bold text-5xl 2xl:text-6xl whitespace-nowrap leading-none">${dates}</div><div class="font-medium text-xl lg:text-2xl">${month}</div>
${times.map((time) => `<div class="flex"><span class="text-xl relative "> ${time} </span></div>`).join('')}<a href="${path}" class="py-2">Book Tickets</a></div>`;

  it('puts each showtime of a run on its own weekday', () => {
    const shows = yukYuks.readShows(card('Kim McVicar', 'FRI - SAT', '13 - 14', 'Nov', ['08:00 PM - FRI', '08:00 PM - SAT', '10:30 PM - SAT'], '/toronto/show/kim-mcvicar-43707'), '2026-11-09');
    expect(shows.map((show) => [show.name, show.date, show.time])).toEqual([
      ['Kim McVicar', '2026-11-13', '20:00:00'],
      ['Kim McVicar', '2026-11-14', '20:00:00'],
      ['Kim McVicar', '2026-11-14', '22:30:00'],
    ]);
    expect(shows[0]).toMatchObject({ venueId: 'yuk-yuk-s-toronto', category: 'Comedy', url: 'https://www.yukyuks.com/toronto/show/kim-mcvicar-43707' });
    expect(JSON.stringify(shows)).not.toContain('Kept out');
  });

  it('works out weekdays across a month end, and skips past showtimes', () => {
    expect(yukYuks.nextWeekday('2026-11-28', 'TUE')).toBe('2026-12-01');
    expect(yukYuks.readShows(card('Hump Day', 'WED', '4', 'Nov', ['08:00 PM - WED'], '/toronto/show/hump-day-1'), '2026-11-09')).toEqual([]);
    expect(yukYuks.isAllowedUrl('https://www.yukyuks.com/toronto/show/hump-day-1')).toBe(false);
  });
});

describe('Comedy Bar', () => {
  const showPage = (title: string, location: string, slots: string[], price = '20.00') =>
    `<h1 class="text-center text-uppercase page-header opacity-header">${title} <span style="font-weight: lighter;">Tickets</span></h1>
<p>$20 online, $25 at the door</p><form action="/public/Event/AddToCart" id="submitForm" method="post">${slots
      .map((slot) => `<div class="card-header" data-toggle="collapse" data-target="#${slot}"><small>Cabaret</small></div>`)
      .join('')}<td>General Admission</td><td>$ ${price}</td></form><div class="col text-center"> Event Location:<br /> ${location} </div>`;

  it("reads a show page's dates, ticket prices and club", () => {
    expect(comedyBar.readShowPage(showPage('Yee-Ha! Comedy', '945 Bloor Street W, Toronto, ON', ['2026-12-04-22-00', '2026-12-04-22-00']))).toEqual({
      title: 'Yee-Ha! Comedy',
      venueId: 'comedy-bar',
      dates: [{ date: '2026-12-04', time: '22:00:00' }],
      prices: [20],
    });
    expect(comedyBar.readShowPage(showPage('East Show', '2800 Danforth Avenue, Toronto', []))?.venueId).toBe('comedy-bar-danforth');
    expect(comedyBar.readShowPage(showPage('Ottawa Show', '1 Somewhere St, Ottawa', []))?.venueId).toBeNull();
    expect(comedyBar.readShowPage('<html>not a show</html>')).toBeNull();
  });

  it('builds one show per upcoming date, only at our two clubs', () => {
    const pages = new Map<string, comedyBar.ShowFacts | null>([
      ['https://comedybar.ca/shows/yee-ha', { title: 'Yee-Ha!', venueId: 'comedy-bar', dates: [{ date: '2026-11-01', time: '22:00:00' }, { date: '2026-12-04', time: '22:00:00' }], prices: [20] }],
      ['https://comedybar.ca/shows/ottawa', { title: 'Ottawa', venueId: null, dates: [{ date: '2026-12-04', time: '20:00:00' }], prices: [] }],
    ]);
    expect(comedyBar.toShowEvents(pages, '2026-11-09').map((show) => [show.id, show.venueId, show.priceMin])).toEqual([['yee-ha-2026-12-04-22:00', 'comedy-bar', 20]]);
  });

  it('fetches only show pages missing from the cache, and only allowed addresses', async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      if (url === comedyBar.SITE) return new Response('<a href="/shows/a">A</a> <a href="https://comedybar.ca/shows/b">B</a> <a href="/shows/a">A again</a>');
      return new Response(showPage('B', '2800 Danforth Ave', ['2026-11-20-20-00']));
    }) as unknown as typeof fetch;
    const cached = new Map([['https://comedybar.ca/shows/a', { fetchedAt: 'fresh', rows: [{ title: 'A', venueId: 'comedy-bar', dates: [{ date: '2026-11-19', time: '20:00:00' }], prices: [] }] }]]);
    const result = await comedyBar.fetchShows('2026-11-09', cached, (fetchedAt) => fetchedAt === 'fresh', comedyBar.createFetch({ fetcher, wait: async () => {} }));
    expect(requested).toEqual([comedyBar.SITE, 'https://comedybar.ca/shows/b']);
    expect(result.events.map((show) => [show.name, show.venueId])).toEqual([
      ['A', 'comedy-bar'],
      ['B', 'comedy-bar-danforth'],
    ]);
    expect(comedyBar.isAllowedUrl('https://comedybar.ca/public/Event/AddToCart')).toBe(false);
  });
});

describe('Absolute Comedy on Showpass', () => {
  it('keeps only the Toronto club from a venue id shared with Ottawa, without the prefix', () => {
    const event = (name: string): showpass.ShowpassEvent => ({
      slug: name,
      name,
      starts_on: '2026-11-11T01:30:00Z',
      frontend_details_url: `https://www.showpass.com/${name}/`,
      venue: { id: 13568 },
      sub_items: [{ price: '15.00' }],
    });
    const shows = showpass.toShowEvents(
      [event('Absolute Comedy Toronto: Headliner Matt Bergman and MC David Pryde'), event('Absolute Comedy Ottawa: Headliner Dane Baptiste')],
      showpass.ABSOLUTE_COMEDY,
    );
    expect(shows.map((show) => [show.name, show.date, show.time, show.category])).toEqual([['Headliner Matt Bergman and MC David Pryde', '2026-11-10', '20:30:00', 'Comedy']]);
  });
});

describe('SoCap Comedy on Eventbrite', () => {
  it('counts shows the title rules cannot place as Comedy', () => {
    const event: ApiEvent = { id: '1', name: { text: 'Mystery Ripple' }, url: 'https://www.eventbrite.ca/e/1', start: { local: '2026-11-11T21:15:00' }, status: 'live', category_id: '105' };
    expect(eventbriteShows([event], SOCAP_COMEDY)[0]?.category).toBe('Comedy');
  });
});
