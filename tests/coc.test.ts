import { describe, expect, it } from 'vitest';
import * as coc from '../src/data/coc';

const performance = (number: number, date: string, type = { ID: 2, Title: 'Main Stage' }): coc.CocPerformance => ({
  PerformanceNumber: number,
  PerformanceDate: date,
  ProductionTypes: [type],
});

const production = (overrides: Partial<coc.CocProduction> = {}): coc.CocProduction => ({
  ID: 574,
  Title: 'The Turn of the Screw',
  Prefix: null,
  ProductionSeasonNumber: 9001,
  Link: '/tickets/2627-season/the-turn-of-the-screw',
  Venue: { Title: 'Four Seasons Centre for the Performing Arts' },
  IsDuplicate: 0,
  Performances: [performance(2539, '2027-01-23T19:30:00-05:00')],
  ...overrides,
});

describe('Canadian Opera Company (Four Seasons Centre)', () => {
  it('reads each performance in Toronto time, with main stage operas as Theatre', () => {
    const [show] = coc.toShowEvents([production()], '2026-11-09');
    expect(show).toMatchObject({
      id: '9001-2539',
      name: 'The Turn of the Screw',
      date: '2027-01-23',
      time: '19:30:00',
      url: 'https://www.coc.ca/tickets/2627-season/the-turn-of-the-screw',
      venueId: 'four-seasons-centre',
      category: 'Theatre',
    });
  });

  it("counts the amphitheatre's free concerts as Music, and the title can still give a genre", () => {
    const shows = coc.toShowEvents(
      [
        production({
          Title: 'An Afternoon of Cuban Jazz',
          Prefix: 'Free Concert Series / Lunchtime',
          Venue: { Title: 'Richard Bradshaw Amphitheatre' },
          Performances: [performance(1, '2027-01-08T12:00:00-05:00', { ID: 3, Title: 'Free Concert Series' })],
        }),
      ],
      '2026-11-09',
    );
    expect(shows.map((show) => [show.category, show.genre, show.time])).toEqual([['Music', 'Jazz', '12:00:00']]);
  });

  it('leaves out other venues, duplicates, hidden types and past performances', () => {
    const shows = coc.toShowEvents(
      [
        production({ ID: 1, Venue: { Title: 'Todmorden Mills' } }),
        production({ ID: 2, IsDuplicate: 1 }),
        production({ ID: 3, Performances: [performance(5, '2027-02-01T19:30:00-05:00', { ID: 4, Title: 'Hidden' })] }),
        production({ ID: 4, Performances: [performance(6, '2026-11-01T19:30:00-04:00')] }),
      ],
      '2026-11-09',
    );
    expect(shows).toEqual([]);
  });

  it('asks only for the feed, and stops when it is not a list', async () => {
    expect(coc.isAllowedUrl(coc.FEED)).toBe(true);
    expect(coc.isAllowedUrl('https://d1ndd0kfyiplr2.cloudfront.net/Prod/basket')).toBe(false);
    const fetcher = (async () => new Response('{"message":"error"}')) as unknown as typeof fetch;
    await expect(coc.fetchShows('2026-11-09', coc.createFetch({ fetcher }))).rejects.toThrow('Stopping');
  });
});
