import { describe, expect, it } from 'vitest';
import * as bsmt from '../src/data/bsmt254';
import { classifyStyle } from '../src/data/categories';

/** A card shaped like the events listing. */
function card(slug: string, when: string, title: string): string {
  return `<a href="https://www.bsmt254.com/event/${slug}/" class="homeEventWrap">
<div class="eventDate"><div class="eventDateMonth">Saturday </div><div class="eventDateDay"><div class="datePull">${when}</div></div></div>
<div class="eventDetails"><h3>${title} </h3><p>Kept out</p></div></a>`;
}

/** A show page's details, shaped like the site's. */
function page(meta: string[], genre?: string): string {
  return `<div class='eventSingleDesc'><div class='datePull'>November 28, 2026 1:09 pm</div>${meta
    .map((line) => `<span class='eventMeta'> / ${line}</span>`)
    .join('')}<span class='eventDesc'>Kept out, $99</span>${genre ? `<span class='genre'><span>Genre / Style(s):</span> ${genre}</span>` : ''}</div>`;
}

describe('BSMT 254 listing and show pages', () => {
  it('reads the listing cards, ignoring other links to shows', () => {
    const html = card('saturday-night-rockers', 'November 28, 2026 1:09 pm', 'Saturday Night Rockers &#038; The One Nation Rebelz') + '<a href="https://www.bsmt254.com/event/other/">More</a>';
    expect(bsmt.readListing(html)).toEqual([
      { url: 'https://www.bsmt254.com/event/saturday-night-rockers/', name: 'Saturday Night Rockers & The One Nation Rebelz', date: '2026-11-28', listedTime: '13:09:00' },
    ]);
  });

  it("reads a show page's time, prices and style, but not its description", () => {
    expect(bsmt.readShowPage(page(['8pm', '$15 adv / $20 at the door'], 'Reggae'))).toEqual({ time: '20:00:00', prices: [15, 20], ageLabel: null, genre: 'Reggae' });
    expect(bsmt.readShowPage(page(['Doors 9:30 PM', '19+']))).toEqual({ time: '21:30:00', prices: [], ageLabel: '19+', genre: null });
  });

  it("prefers the page's time, and trusts a listing time only on the quarter hour", () => {
    const listed: bsmt.ListedShow[] = [
      { url: 'https://www.bsmt254.com/event/a/', name: 'A', date: '2026-11-28', listedTime: '13:09:00' },
      { url: 'https://www.bsmt254.com/event/b/', name: 'B', date: '2026-11-28', listedTime: '22:00:00' },
      { url: 'https://www.bsmt254.com/event/c/', name: 'C', date: '2026-11-28', listedTime: '13:09:00' },
      { url: 'https://www.bsmt254.com/event/old/', name: 'Old', date: '2026-11-01', listedTime: '22:00:00' },
    ];
    const pages = new Map<string, bsmt.PageFacts>([['https://www.bsmt254.com/event/c/', { time: '20:00:00', prices: [15, 20], ageLabel: null, genre: 'Reggae - Dancehall' }]]);
    const shows = bsmt.toShowEvents(listed, pages, '2026-11-08');
    expect(shows.map((show) => [show.id, show.time, show.genre, show.priceMin, show.priceMax])).toEqual([
      ['a', null, null, null, null],
      ['b', '22:00:00', null, null, null],
      ['c', '20:00:00', 'Reggae', 15, 20],
    ]);
  });

  it('fetches only show pages missing from the cache, and only allowed addresses', async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string) => {
      requested.push(url);
      if (url === bsmt.LISTING) return new Response(card('a', 'November 20, 2026 10:00 pm', 'A') + card('b', 'November 21, 2026 10:00 pm', 'B'));
      return new Response(page(['10pm', '$10'], 'techno'));
    }) as unknown as typeof fetch;
    const cached = new Map([['https://www.bsmt254.com/event/a/', { fetchedAt: 'fresh', rows: [{ time: '21:00:00', prices: [], ageLabel: null, genre: null }] }]]);
    const result = await bsmt.fetchShows('2026-11-08', cached, (fetchedAt) => fetchedAt === 'fresh', bsmt.createFetch({ fetcher, wait: async () => {} }));
    expect(requested).toEqual([bsmt.LISTING, 'https://www.bsmt254.com/event/b/']);
    expect(result.reused).toBe(1);
    expect(result.events.map((show) => [show.id, show.time, show.genre])).toEqual([
      ['a', '21:00:00', null],
      ['b', '22:00:00', 'Dance/Electronic'],
    ]);
    expect(bsmt.isAllowedUrl('https://www.bsmt254.com/book-the-space/')).toBe(false);
  });

  it('stops when the listing has no shows', async () => {
    const fetcher = (async () => new Response('<html>new layout</html>')) as unknown as typeof fetch;
    await expect(bsmt.fetchShows('2026-11-08', new Map(), () => false, bsmt.createFetch({ fetcher }))).rejects.toThrow('no upcoming shows');
  });
});

describe('classifyStyle', () => {
  it("maps a venue's style line to Ticketmaster's genre names, using the first style it knows", () => {
    const genre = (text: string) => classifyStyle(text)?.genre ?? null;
    expect(genre('Spiritual Jazz')).toBe('Jazz');
    expect(genre('Free-Jazz')).toBe('Jazz');
    expect(genre('Pop R&B')).toBe('R&B');
    expect(genre('Folktronica · Experimental electronic · Deep techno · Dub · Ambient')).toBe('Dance/Electronic');
    expect(genre('Reggae - Dancehall - Roots - Rub a Dub')).toBe('Reggae');
    expect(genre('Grimey Slimey Post Punk - Drag Dance Performance Art')).toBe('Rock');
    expect(genre('Garage rock')).toBe('Rock');
    expect(genre('Hip Hop')).toBe('Hip-Hop/Rap');
    expect(genre('Cumbia')).toBe('Latin');
    expect(classifyStyle('Comedy')).toMatchObject({ category: 'Comedy', genre: null });
    expect(classifyStyle('60s')).toBeNull();
    expect(classifyStyle('COMMUNITY')).toBeNull();
  });
});
