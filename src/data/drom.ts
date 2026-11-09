/**
 * Reads DROM Taberna's upcoming shows from the events list on its home page (a Webflow site).
 * Its "Load more" button works only in a browser and there's no sitemap or full events page, so
 * this sees only what the home page lists: about a week ahead in November 2026, sometimes less. A
 * daily run keeps that window filled. Placeholder slots ("Live music - To be announced") and
 * "Closed" notices are skipped.
 *
 * Each card links to /events/<name>-<YYYYMMDD>-<HHMM> in local time, and shows the artist, a price
 * tag like "$15" or "pwyc", and a genre. Descriptions and images are never stored.
 */
import { decodeText, dollarAmounts, makeShow } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export const DROM_SITE = 'https://www.dromtaberna.com/';
const VENUE_ID = 'drom-taberna';

export function isAllowedUrl(url: string): boolean {
  return url === DROM_SITE;
}

/** Reads the event cards on the home page. "To be announced" slots are skipped. */
export function readShows(html: string): ShowEvent[] {
  const cards = html.split('<a href="/events/').slice(1);
  return cards.flatMap((card): ShowEvent[] => {
    const link = /^([a-z0-9-]+?)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})"/.exec(card);
    const artist = decodeText(/home-events-list-artist">([^<]*)</.exec(card)?.[1] ?? '');
    if (!link || !artist || /\bto be announced\b|^(tba|closed)$/i.test(artist)) return [];
    const [, , year, month, day, hour, minute] = link;
    const tags = [...card.matchAll(/class="text-block-16">([^<]*)</g)].map((match) => decodeText(match[1]!));
    const prices = tags.flatMap(dollarAmounts);
    const genre = decodeText(/class="event-primary-genre">([^<]+)</.exec(card)?.[1] ?? '');
    const slug = card.slice(0, card.indexOf('"'));
    return [
      makeShow(
        {
          id: slug,
          name: artist,
          date: `${year}-${month}-${day}`,
          time: `${hour}:${minute}:00`,
          url: `${DROM_SITE}events/${slug}`,
          venueId: VENUE_ID,
          priceMin: prices.length > 0 ? Math.min(...prices) : null,
          priceMax: prices.length > 0 ? Math.max(...prices) : null,
        },
        // The card's genre, like "Experimental" or "Jazz", when it has one.
        { category: 'Music', ...(genre ? { genre } : {}) },
      ),
    ];
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('drom', isAllowedUrl, options);
}

export async function fetchShows(fetchPage: PageFetch = createFetch()): Promise<ShowEvent[]> {
  const html = await fetchPage(DROM_SITE, 'the home page');
  if (!html.includes('home-events-list-artist')) throw new Error("drom's home page has no events list (a new layout?). Stopping.");
  return readShows(html);
}
