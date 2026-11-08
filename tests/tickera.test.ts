import { describe, expect, it } from 'vitest';
import { createFetch, fetchShows, isAllowedUrl, LINSMORE_TAVERN as venue, parseWhen, readListing, readShowPage } from '../src/data/tickera';

const showUrl = (slug: string) => `https://www.linsmoretavern.com/tc-events/${slug}/`;
const listing = (items: [string, string][]) =>
  items.map(([date, slug]) => `<div class="content"> <date>${date}</date> <div><a href="${showUrl(slug)}">Name..</a></div></div>`).join('');
function showPage(title: string, when: string, table: string): string {
  return `<meta property="og:title" content="${title}" />
<div class="tc_the_content_pre"><span class="tc_event_date_title_front"><i class="fa fa-clock-o"></i>${when}</span></div>
<p>A description that is never kept</p>
<table><tr><th>Ticket Type</th><th>Price</th><th>Cart</th></tr>${table}</table>`;
}

describe('readListing', () => {
  it('pairs each show link with its day.month.year date, once', () => {
    expect(readListing(listing([['06.11.2026', 'almost-hip'], ['05.12.2026', 'gunslingers'], ['06.11.2026', 'almost-hip']]), venue)).toEqual([
      { url: showUrl('almost-hip'), date: '2026-11-06' },
      { url: showUrl('gunslingers'), date: '2026-12-05' },
    ]);
  });
});

describe('readShowPage', () => {
  it('reads the trimmed name, time and ticket price, but not the description', () => {
    const html = showPage(
      'The Almost Hip, The Longest Running Tribute to The Tragically Hip returns to the Linsmore Tavern!',
      'November 6, 2026 9:30 pm',
      '<tr><td>Advanced Ticket</td><td>$ 13</td><td>Add to Cart</td></tr>',
    );
    const show = readShowPage(html, showUrl('almost-hip'), venue, '2026-11-06');
    expect(show).toMatchObject({
      id: 'tc-events/almost-hip/',
      name: 'The Almost Hip, The Longest Running Tribute to The Tragically Hip',
      date: '2026-11-06',
      time: '21:30:00',
      priceMin: 13,
      status: 'onsale',
      subGenre: 'Tribute',
      venueId: 'linsmore-tavern',
    });
    expect(JSON.stringify(show)).not.toContain('never kept');
  });

  it('trims other stock phrases, reads sold out, and skips past shows', () => {
    const sold = showPage('Mean Honey Live at the Linsmore Tavern', 'November 12, 2026 9:00 pm', '<tr><td>Ticket</td><td>$ 10</td><td>Sold out</td></tr>');
    expect(readShowPage(sold, showUrl('mean-honey'), venue, '2026-11-07')).toMatchObject({ name: 'Mean Honey', status: 'soldout' });
    expect(readShowPage(sold, showUrl('mean-honey'), venue, '2026-11-13')).toBeNull();
    expect(parseWhen('December 10, 2026')).toEqual({ date: '2026-12-10', time: null });
  });
});

describe('fetchShows', () => {
  it('skips past shows before requesting their pages, and allows only listing and show pages', async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      if (url === venue.listingUrl) return new Response(listing([['15.08.2026', 'old'], ['12.11.2026', 'mean-honey']]));
      return new Response(showPage('Mean Honey Live at the Linsmore Tavern', 'November 12, 2026 9:00 pm', ''));
    }) as unknown as typeof fetch;
    const shows = await fetchShows(venue, '2026-11-07', createFetch(venue, { fetcher, wait: async () => {} }));
    expect(requested).toEqual([venue.listingUrl, showUrl('mean-honey')]);
    expect(shows.map((show) => [show.name, show.priceMin])).toEqual([['Mean Honey', null]]);
    expect(isAllowedUrl(venue, 'https://www.linsmoretavern.com/cart/')).toBe(false);
  });
});
