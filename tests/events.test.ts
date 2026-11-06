import { describe, expect, it } from 'vitest';
import {
  formatShowDate,
  formatShowTime,
  loadEvents,
  parseEventsFile,
  showStatusLabel,
  todayString,
  upcomingShows,
  type ShowEvent,
} from '../src/data/events';

const show = (id: string, venueId: string, date: string): ShowEvent => ({
  id,
  name: id,
  date,
  time: '20:00:00',
  status: 'onsale',
  url: `https://www.ticketmaster.ca/event/${id}`,
  venueId,
});

describe('parseEventsFile', () => {
  it('keeps valid events and drops malformed or unsafe ones', () => {
    const good = show('a', 'v', '2026-12-01');
    const parsed = parseEventsFile({
      events: [good, { ...good, id: 'bad-link', url: 'javascript:alert(1)' }, { ...good, id: 'bad-date', date: 'soon' }, { id: 'partial' }],
    });
    expect(parsed).toEqual([good]);
  });

  it('rejects anything that is not an events file', () => {
    expect(() => parseEventsFile({})).toThrow();
    expect(() => parseEventsFile(null)).toThrow();
  });
});

describe('loadEvents', () => {
  it('returns events from a good response', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ events: [show('a', 'v', '2026-12-01')] }))) as unknown as typeof fetch;
    expect(await loadEvents('/x', fetcher)).toHaveLength(1);
  });

  it('returns null when the file is missing, as HTML or as a 404', async () => {
    const html = (async () => new Response('<!doctype html>')) as unknown as typeof fetch;
    const missing = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await loadEvents('/x', html)).toBeNull();
    expect(await loadEvents('/x', missing)).toBeNull();
  });
});

describe('upcomingShows', () => {
  it('keeps this venue from today on', () => {
    const events = [show('past', 'v', '2026-11-05'), show('today', 'v', '2026-11-06'), show('later', 'v', '2026-12-01'), show('other', 'w', '2026-12-01')];
    expect(upcomingShows(events, 'v', '2026-11-06').map((event) => event.id)).toEqual(['today', 'later']);
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
