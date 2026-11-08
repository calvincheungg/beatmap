import { describe, expect, it } from 'vitest';
import * as mrBlack from '../src/data/mrBlack';
import { HttpStatusError } from '../src/data/politeFetch';

const venue = mrBlack.FUTURE;
const night = (overrides: Partial<mrBlack.MrBlackEvent> = {}): mrBlack.MrBlackEvent => ({
  id: 58864,
  name: 'RIVO',
  date: '2026-11-12',
  startsAt: '22:00',
  deleted: false,
  hiddenFromCalendar: false,
  repeatable: false,
  ticketsEvent: true,
  minPrice: '$30.00',
  ...overrides,
});

describe('Mr Black (Future)', () => {
  it('reads the night, start time and lowest price, linking to the calendar', () => {
    const [show] = mrBlack.toShowEvents([night()], venue, '2026-11-08');
    expect(show).toMatchObject({
      id: '58864-2026-11-12',
      name: 'RIVO',
      date: '2026-11-12',
      time: '22:00:00',
      priceMin: 30,
      priceMax: 30,
      url: 'https://buy.mrblackapp.com/calendar/8769',
      venueId: 'future',
      category: 'Music',
    });
  });

  it('keeps headliners on a weekly night but leaves out the standing guest-list nights', () => {
    const shows = mrBlack.toShowEvents(
      [
        night({ id: 47136, name: 'ROGER SANCHEZ', date: '2026-11-20', repeatable: true }),
        night({ id: 47137, name: 'ALIVE SATURDAYS', date: '2026-11-14', repeatable: true, ticketsEvent: false, minPrice: '$0.00' }),
        night({ id: 59235, name: 'CEDRIC GERVAIS', date: '2026-12-11', ticketsEvent: false, minPrice: '$0.00' }),
        night({ id: 1, date: '2026-11-01' }),
        night({ id: 2, hiddenFromCalendar: true }),
      ],
      venue,
      '2026-11-08',
    );
    expect(shows.map((show) => [show.name, show.priceMin])).toEqual([
      ['ROGER SANCHEZ', 30],
      ['CEDRIC GERVAIS', null],
    ]);
  });

  it('pages until nights pass the window ahead, asking only for the list of nights', async () => {
    const requested: string[] = [];
    const weekly = (start: number) => Array.from({ length: 10 }, (_, i) => night({ id: start + i, date: new Date(Date.UTC(2026, 10, 9 + (start + i) * 7)).toISOString().slice(0, 10) }));
    const fetcher = (async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify(weekly((requested.length - 1) * 10)));
    }) as unknown as typeof fetch;
    const shows = await mrBlack.fetchShows(venue, '2026-11-08', mrBlack.createFetch(venue, { fetcher, wait: async () => {} }));
    expect(requested).toEqual([mrBlack.eventsUrl(venue, 0), mrBlack.eventsUrl(venue, 1)]);
    expect(shows.at(-1)!.date <= '2027-02-06').toBe(true);
    expect(mrBlack.isAllowedUrl(venue, mrBlack.eventsUrl(venue, 3))).toBe(true);
    expect(mrBlack.isAllowedUrl(venue, 'https://buy.mrblackapp.com/api/v1/venue/8769/embed')).toBe(false);
    expect(mrBlack.isAllowedUrl(venue, `${mrBlack.eventsUrl(venue, 0)}&extra=1`)).toBe(false);
  });

  it('reports a refusal with its status, so the sync can treat it as a warning', async () => {
    const fetcher = (async () => new Response('Forbidden', { status: 403 })) as unknown as typeof fetch;
    const failure = await mrBlack.fetchShows(venue, '2026-11-08', mrBlack.createFetch(venue, { fetcher })).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpStatusError);
    expect((failure as HttpStatusError).status).toBe(403);
  });

  it('stops when the answer is not a list', async () => {
    const fetcher = (async () => new Response('{"error":"No such venue"}')) as unknown as typeof fetch;
    await expect(mrBlack.fetchShows(venue, '2026-11-08', mrBlack.createFetch(venue, { fetcher }))).rejects.toThrow('Stopping');
  });
});
