import { describe, expect, it } from 'vitest';
import { calendarUrl, categorize, createFetch, fetchShows, FREE_TIMES_CAFE as venue, isAllowedUrl, toShowEvents, tokenUrl, type BoomtechEvent } from '../src/data/boomtech';

const event = (overrides: Partial<BoomtechEvent> = {}): BoomtechEvent => ({
  id: '1',
  title: 'The Professionals Comedy Show',
  start: '2026-11-07T20:00',
  all_day: '0',
  link: 'None',
  venue: "{'address': '320 College St, Toronto, ON M5T 1S3, Canada', 'email': 'x'}",
  repeat: "{'type': '', 'interval': ''}",
  categories: "[{'id': 1, 'name': 'Comedy', 'color': '#3899EC'}]",
  ...overrides,
});

describe('categorize', () => {
  it("maps the venue's categories, and drops listings that aren't shows", () => {
    expect(categorize(['Brunch Buffet', 'Klezmer', 'Music', 'Jazz'], 'Brunch')).toEqual({ category: 'Music', genre: 'Jazz' });
    expect(categorize(['Klezmer'], 'Klezmer night')).toEqual({ category: 'Music', genre: 'Klezmer' });
    expect(categorize(['Poetry & Spoken Word'], 'Readings')).toEqual({ category: 'Talks', genre: null });
    expect(categorize(['Trivia Quiz Night'], 'Quiz')).toEqual({ category: 'Games', genre: null });
    expect(categorize(['Brunch Buffet'], 'Sunday Brunch Buffet')).toBeNull();
    expect(categorize(['Computer & Java Coding'], 'Java for Beginners')).toBeNull();
  });
});

describe('toShowEvents', () => {
  it('reads local times and links, never descriptions', () => {
    const [show] = toShowEvents([event({ link: 'https://www.eventbrite.ca/e/x-1' })], venue, '2026-11-07');
    expect(show).toMatchObject({ id: '1', date: '2026-11-07', time: '20:00:00', category: 'Comedy', url: 'https://www.eventbrite.ca/e/x-1', venueId: 'free-times-cafe' });
    expect(toShowEvents([event()], venue, '2026-11-07')[0]?.url).toBe(venue.listingUrl);
  });

  it('skips past, repeating, elsewhere and non-show entries', () => {
    const shows = toShowEvents(
      [
        event({ id: 'old', start: '2026-11-01T20:00' }),
        event({ id: 'weekly', repeat: "{'type': 'Week', 'interval': '1'}" }),
        event({ id: 'away', venue: "{'address': '1 Yonge St'}" }),
        event({ id: 'brunch', categories: "[{'name': 'Brunch Buffet'}]", title: 'Sunday Brunch' }),
      ],
      venue,
      '2026-11-07',
    );
    expect(shows).toEqual([]);
  });
});

describe('fetchShows', () => {
  it("takes the calendar app's token from the site, then reads the calendar, and allows nothing else", async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      if (url === tokenUrl(venue)) return new Response(JSON.stringify({ apps: { '13b4a028-00fa-7133-242f-4628106b8c91': { instance: 'abc.def' } } }));
      return new Response(JSON.stringify({ events: [event()] }));
    }) as unknown as typeof fetch;
    const shows = await fetchShows(venue, '2026-11-07', createFetch(venue, { fetcher, wait: async () => {} }));
    expect(requested).toEqual([tokenUrl(venue), calendarUrl(venue, 'abc.def')]);
    expect(shows).toHaveLength(1);
    expect(isAllowedUrl(venue, 'https://www.freetimescafe.com/_api/other')).toBe(false);
  });

  it('stops when the site gives no calendar token', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ apps: {} }))) as unknown as typeof fetch;
    await expect(fetchShows(venue, '2026-11-07', createFetch(venue, { fetcher }))).rejects.toThrow('no calendar token');
  });
});
