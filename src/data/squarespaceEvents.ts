/**
 * Reads venues whose Squarespace sites have an events collection, from the collection's own page
 * (like thepaintedlady.ca/shows-1), which lists upcoming events before past ones. Squarespace's
 * JSON views (?format=json) and /api/ are ruled out by its robots.txt, so only the page is read.
 *
 * Each event's exact start comes from its "Google Calendar" link (dates=20261108T193000Z/...).
 * Facts only: title, date, time, and the price and age found in the excerpt. The excerpt itself
 * and images are never stored.
 *
 * Spotting a suitable site: "eventlist-event" articles on a page, often the target of a calendar
 * block's collection (find its address in /sitemap.xml).
 */
import { ageFrom, decodeText, dollarAmounts, makeShow, torontoDateTime, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export interface SquarespaceVenue {
  key: string;
  /** The site's address, ending in a slash. */
  siteUrl: string;
  /** The events collection's page, like "shows-1". */
  eventsPath: string;
  venueId: string;
  defaults: VenueDefaults;
}

export const THE_PAINTED_LADY: SquarespaceVenue = {
  key: 'paintedlady',
  siteUrl: 'https://www.thepaintedlady.ca/',
  eventsPath: 'shows-1',
  venueId: 'the-painted-lady',
  defaults: { category: 'Music' },
};

export function eventsUrl(venue: SquarespaceVenue): string {
  return `${venue.siteUrl}${venue.eventsPath}`;
}

export function isAllowedUrl(venue: SquarespaceVenue, url: string): boolean {
  return url === eventsUrl(venue);
}

/** The start in the Google Calendar link, in Toronto time. All-day events have a date only. */
export function readStart(article: string): { date: string; time: string | null } | null {
  const dates = /[?&;]dates=(\d{8})(T(\d{6})Z)?/.exec(article.replace(/&amp;/g, '&'));
  if (dates) {
    const [, day, , clock] = dates;
    const date = `${day!.slice(0, 4)}-${day!.slice(4, 6)}-${day!.slice(6, 8)}`;
    if (!clock) return { date, time: null };
    return torontoDateTime(new Date(`${date}T${clock.slice(0, 2)}:${clock.slice(2, 4)}:${clock.slice(4, 6)}Z`));
  }
  const fallback = /<time class="event-date" datetime="(\d{4}-\d{2}-\d{2})"/.exec(article);
  return fallback ? { date: fallback[1]!, time: null } : null;
}

/**
 * Reads the upcoming events on the collection page. Past events, listed after them, are skipped,
 * as are notices like "Closed for Christmas" and repeat entries for the same show.
 */
export function readShows(html: string, venue: SquarespaceVenue, today: string): ShowEvent[] {
  const pastAt = html.indexOf('eventlist--past');
  const upcoming = pastAt >= 0 ? html.slice(0, pastAt) : html;
  const seen = new Set<string>();
  return upcoming
    .split('<article class="eventlist-event')
    .slice(1)
    .flatMap((article): ShowEvent[] => {
      const link = /<a href="(\/[^"]+)" class="eventlist-title-link">([\s\S]*?)<\/a>/.exec(article);
      const start = readStart(article);
      if (!link || !start || start.date < today) return [];
      const name = decodeText(link[2]!.replace(/<[^>]+>/g, ' '));
      if (!name || /^closed\b/i.test(name)) return [];
      const slot = `${name.toLowerCase()}|${start.date}|${start.time}`;
      if (seen.has(slot)) return [];
      seen.add(slot);
      const excerpt = decodeText((/<div class="eventlist-excerpt">([\s\S]*?)<\/div>/.exec(article)?.[1] ?? '').replace(/<[^>]+>/g, ' '));
      const prices = dollarAmounts(excerpt);
      const path = link[1]!;
      return [
        makeShow(
          {
            id: path.slice(path.lastIndexOf('/') + 1),
            name,
            date: start.date,
            time: start.time,
            url: `${venue.siteUrl}${path.slice(1)}`,
            venueId: venue.venueId,
            priceMin: prices.length > 0 ? Math.min(...prices) : null,
            priceMax: prices.length > 0 ? Math.max(...prices) : null,
            ageLabel: ageFrom(excerpt),
          },
          venue.defaults,
        ),
      ];
    });
}

export function createFetch(venue: SquarespaceVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

export async function fetchShows(venue: SquarespaceVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const html = await fetchPage(eventsUrl(venue), 'the events page');
  if (!html.includes('eventlist-event')) throw new Error(`${venue.key}'s events page has no event list (a new layout?). Stopping.`);
  return readShows(html, venue, today);
}
