import { describe, expect, it } from 'vitest';
import { createFetch, fetchShows, isAllowedUrl, readShows } from '../src/data/drom';

/** A card shaped like DROM's home page list. */
function card(slug: string, artist: string, tags: string[] = [], genre = ''): string {
  return `<a href="/events/${slug}" class="link-block w-inline-block"><div class="home-events-list-artist">${artist}</div>${tags
    .map((tag) => `<div class="tag"><div class="text-block-16">${tag}</div></div>`)
    .join('')}<p class="short-description">Kept out</p><div class="home-events_time">20:30</div><div class="event-primary-genre${genre ? '' : ' w-dyn-bind-empty'}">${genre}</div></a>`;
}

describe('readShows', () => {
  it("reads the date and local time from the link, the price tag and the card's genre", () => {
    const [show] = readShows(card('nizos-brass-band-20261107-2330', 'Nizo&#x27;s Brass Band', ['$20'], 'Balkan'));
    expect(show).toMatchObject({
      id: 'nizos-brass-band-20261107-2330',
      name: "Nizo's Brass Band",
      date: '2026-11-07',
      time: '23:30:00',
      priceMin: 20,
      genre: 'Balkan',
      category: 'Music',
      url: 'https://www.dromtaberna.com/events/nizos-brass-band-20261107-2330',
      venueId: 'drom-taberna',
    });
    expect(JSON.stringify(show)).not.toContain('Kept out');
  });

  it('treats pay-what-you-can as no fixed price, and skips slots still to be announced and closed days', () => {
    const shows = readShows(
      card('eucalyptus-20261107-2030', 'Eucalyptus', ['pwyc']) +
        card('to-be-announced-20261108-2330', 'To be announced', ['pwyc']) +
        card('live-music-to-be-announced-20261110-1900', 'Live music - To be announced') +
        card('closed-20261109-1800', 'Closed'),
    );
    expect(shows.map((show) => [show.name, show.priceMin, show.genre])).toEqual([['Eucalyptus', null, null]]);
  });
});

describe('fetchShows', () => {
  it('reads only the home page, and stops if its list is gone', async () => {
    expect(isAllowedUrl('https://www.dromtaberna.com/')).toBe(true);
    expect(isAllowedUrl('https://www.dromtaberna.com/reservations')).toBe(false);
    const fetcher = (async () => new Response('<html>new layout</html>')) as unknown as typeof fetch;
    await expect(fetchShows(createFetch({ fetcher }))).rejects.toThrow('no events list');
  });
});
