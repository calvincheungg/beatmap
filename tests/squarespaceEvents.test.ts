import { describe, expect, it } from 'vitest';
import { dollarAmounts } from '../src/data/feedShow';
import * as sq from '../src/data/squarespaceEvents';

const venue = sq.THE_PAINTED_LADY;

/** An event shaped like Squarespace's event list. */
function article(slug: string, title: string, dates: string, excerpt = '', datetime = dates.slice(0, 8)): string {
  const day = `${datetime.slice(0, 4)}-${datetime.slice(4, 6)}-${datetime.slice(6, 8)}`;
  return `<article class="eventlist-event eventlist-event--upcoming"><a href="/shows-1/${slug}" class="eventlist-column-thumbnail"><img src="x.jpg"></a>
<h1 class="eventlist-title"><a href="/shows-1/${slug}" class="eventlist-title-link">${title} </a></h1>
<ul class="eventlist-meta"><li><time class="event-date" datetime="${day}">Sunday</time></li>
<li><a href="http://www.google.com/calendar/event?action=TEMPLATE&amp;text=x&amp;dates=${dates}" class="eventlist-meta-export-google">Google Calendar</a></li></ul>
<div class="eventlist-excerpt"><p>${excerpt}</p></div></article>`;
}

const page = (upcoming: string, past = '') =>
  `<div class="eventlist eventlist--upcoming">${upcoming}</div><div class="eventlist-past-upcoming-divider"></div><div class="eventlist eventlist--past">${past}</div>`;

describe('Squarespace events (The Painted Lady)', () => {
  it('reads the start from the calendar link in Toronto time, with price and age from the excerpt', () => {
    const [show] = sq.readShows(page(article('rock-n-roll-animal', 'ROCK N ROLL ANIMAL EP RELEASE PARTY', '20261121T233000Z/20261122T030000Z', '19+ · $20 adv / $25 door')), venue, '2026-11-08');
    expect(show).toMatchObject({
      id: 'rock-n-roll-animal',
      name: 'ROCK N ROLL ANIMAL EP RELEASE PARTY',
      date: '2026-11-21',
      time: '18:30:00',
      priceMin: 20,
      priceMax: 25,
      ageLabel: '19+',
      url: 'https://www.thepaintedlady.ca/shows-1/rock-n-roll-animal',
      venueId: 'the-painted-lady',
    });
    expect(JSON.stringify(show)).not.toContain('adv');
  });

  it('skips past events, closure notices and repeat entries, and keeps all-day events without a time', () => {
    const shows = sq.readShows(
      page(
        article('old', 'Last Week', '20261101T000000Z/20261101T030000Z') +
          article('closed', 'Closed for Christmas', '20261225T160000Z/20261226T040000Z') +
          article('roots-a', 'Back To My Roots', '20261122T193000Z/20261122T220000Z') +
          article('roots-b', 'Back To My Roots ', '20261122T193000Z/20261122T220000Z') +
          article('fest', 'OssFest', '20261128/20261129'),
        article('past-list', 'Past Show', '20261201T000000Z/20261201T030000Z'),
      ),
      venue,
      '2026-11-08',
    );
    expect(shows.map((show) => [show.id, show.date, show.time])).toEqual([
      ['roots-a', '2026-11-22', '14:30:00'],
      ['fest', '2026-11-28', null],
    ]);
  });

  it('reads only the events page, and stops if its list is gone', async () => {
    expect(sq.isAllowedUrl(venue, 'https://www.thepaintedlady.ca/shows-1')).toBe(true);
    expect(sq.isAllowedUrl(venue, 'https://www.thepaintedlady.ca/shows-1?format=json')).toBe(false);
    const fetcher = (async () => new Response('<html>new layout</html>')) as unknown as typeof fetch;
    await expect(sq.fetchShows(venue, '2026-11-08', sq.createFetch(venue, { fetcher }))).rejects.toThrow('no event list');
  });
});

describe('dollarAmounts and drink prices', () => {
  it('leaves out what drinks and food cost', () => {
    expect(dollarAmounts('6pm-9pm $5 Glasses of wine')).toEqual([]);
    expect(dollarAmounts('$10 cover, $6 pints')).toEqual([10]);
    expect(dollarAmounts('$15 adv / $20 at the door')).toEqual([15, 20]);
  });
});
