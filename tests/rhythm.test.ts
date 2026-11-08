import { describe, expect, it } from 'vitest';
import { createFetch, dateFor, fetchShows, isAllowedUrl, readShows, RHYTHM_EVENTS } from '../src/data/rhythm';

/** A card shaped like the Shopify multicolumn section on Rhythm's events page. */
function card(heading: string, link?: string): string {
  return `<li class="multicolumn-list__item"><div class="multicolumn-card__image-wrapper"><img src="x.jpg" alt=""></div><div class="multicolumn-card__info"><h3 class="inline-richtext">${heading}</h3>${
    link ? `<a class="link animate-arrow" href="${link}">Tickets</a>` : ''
  }</div></li>`;
}

describe('dateFor', () => {
  it('uses this year, unless the date was long ago, then next year', () => {
    expect(dateFor('November', 13, '2026-11-08')).toBe('2026-11-13');
    expect(dateFor('Nov', 4, '2026-11-08')).toBe('2026-11-04');
    expect(dateFor('January', 9, '2026-11-08')).toBe('2027-01-09');
    expect(dateFor('Smarch', 1, '2026-11-08')).toBeNull();
  });
});

describe('readShows', () => {
  it('reads the date and title from the heading, and passes on the ticket link', () => {
    const [show] = readShows(card('November 13 - Rhythmic Roots x Rhythm: D Stone', 'https://ra.co/events/2536827'), '2026-11-08');
    expect(show).toMatchObject({
      name: 'Rhythmic Roots x Rhythm: D Stone',
      date: '2026-11-13',
      time: null,
      url: 'https://ra.co/events/2536827',
      venueId: 'rhythm',
      category: 'Music',
    });
  });

  it('skips past events and other cards, and falls back to the events page for a link', () => {
    const shows = readShows(
      card('November 4 - Ableton Workshop', 'https://ra.co/events/2565799') + card('Shop hours') + card('November 27 – Rhythm: Arapu') + '<footer><a href="https://instagram.com/x">x</a></footer>',
      '2026-11-08',
    );
    expect(shows.map((show) => [show.name, show.url])).toEqual([['Rhythm: Arapu', RHYTHM_EVENTS]]);
  });
});

describe('fetchShows', () => {
  it('reads only the events page, and stops if its cards are gone', async () => {
    expect(isAllowedUrl(RHYTHM_EVENTS)).toBe(true);
    expect(isAllowedUrl('https://ra.co/events/2536827')).toBe(false);
    const fetcher = (async () => new Response('<html>new layout</html>')) as unknown as typeof fetch;
    await expect(fetchShows('2026-11-08', createFetch({ fetcher }))).rejects.toThrow('no event cards');
  });
});
