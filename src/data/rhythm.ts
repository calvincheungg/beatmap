/**
 * Reads Rhythm's events page (rhythm.space/pages/events, a Shopify store page). Each event is a card
 * headed like "November 13 - Rhythmic Roots x Rhythm: D Stone", with a ticket link, usually to
 * Resident Advisor. That link is only passed on, never requested. The cards give no year, time or
 * price, so the year is worked out from today's date and the time is left unknown.
 */
import { decodeText, makeShow } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export const RHYTHM_EVENTS = 'https://rhythm.space/pages/events';
const VENUE_ID = 'rhythm';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** A card dated further back than this is taken to be next year's. */
const PAST_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isAllowedUrl(url: string): boolean {
  return url === RHYTHM_EVENTS;
}

/** The date a "Month Day" heading means: this year, unless that was long ago, then next year. */
export function dateFor(monthName: string, day: number, today: string): string | null {
  const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
  if (month < 0 || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const pick = (y: number) => `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const thisYear = pick(year);
  return Date.parse(today) - Date.parse(thisYear) > PAST_DAYS * DAY_MS ? pick(year + 1) : thisYear;
}

/** Reads the event cards. Cards without a "Month Day - Title" heading, and past events, are skipped. */
export function readShows(html: string, today: string): ShowEvent[] {
  const cards = html.split('multicolumn-card__info').slice(1);
  return cards.flatMap((card): ShowEvent[] => {
    const heading = decodeText((/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? '').replace(/<[^>]+>/g, ' '));
    const parts = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–—:]\s*(.+)$/.exec(heading);
    if (!parts) return [];
    const date = dateFor(parts[1]!, Number(parts[2]), today);
    if (!date || date < today) return [];
    const name = parts[3]!.trim();
    // Only this card's own link: the last card runs on into the rest of the page.
    const end = card.indexOf('</li>');
    const link = /href="(https:\/\/[^"]+)"/.exec(end >= 0 ? card.slice(0, end) : card)?.[1];
    return [
      makeShow(
        {
          id: `${date}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
          name,
          date,
          time: null,
          url: link ? decodeText(link) : RHYTHM_EVENTS,
          venueId: VENUE_ID,
        },
        // A club and record shop: DJ nights mostly, with workshops the title rules pick out.
        { category: 'Music' },
      ),
    ];
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('rhythm', isAllowedUrl, options);
}

export async function fetchShows(today: string, fetchPage: PageFetch = createFetch()): Promise<ShowEvent[]> {
  const html = await fetchPage(RHYTHM_EVENTS, 'the events page');
  if (!html.includes('multicolumn-card__info')) throw new Error("rhythm's events page has no event cards (a new layout?). Stopping.");
  return readShows(html, today);
}
