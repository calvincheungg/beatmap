/**
 * Reads Yuk Yuk's Toronto shows from its club page (yukyuks.com/toronto). Each show is a card
 * after a month marker (<div data-year="2026" data-month="Nov">), with the headliner or show name,
 * a date block like "FRI - SAT / 13 - 14 / Nov", and showtimes like "08:00 PM - SAT". A card can
 * cover a run of days, so each showtime goes on the first date from the card's start with its
 * weekday. Facts only: title, date, time and the show's page. Descriptions are never stored.
 */
import { decodeText, makeShow } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

const SITE = 'https://www.yukyuks.com';
export const CLUB_PAGE = `${SITE}/toronto`;
const VENUE_ID = 'yuk-yuk-s-toronto';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function isAllowedUrl(url: string): boolean {
  return url === CLUB_PAGE;
}

function isoDate(when: Date): string {
  return when.toISOString().slice(0, 10);
}

/** The first date on or after `start` that falls on `weekday` ("SAT"), within a week. */
export function nextWeekday(start: string, weekday: string): string | null {
  const wanted = WEEKDAYS.indexOf(weekday.slice(0, 3).toLowerCase());
  if (wanted < 0) return null;
  const first = new Date(`${start}T12:00:00Z`);
  const offset = (wanted - first.getUTCDay() + 7) % 7;
  return isoDate(new Date(first.getTime() + offset * DAY_MS));
}

/** "08:00 PM" as "20:00:00". */
function clock(text: string): string | null {
  const parts = /(\d{1,2}):(\d{2})\s*([AP])M/i.exec(text);
  if (!parts) return null;
  const hour = (Number(parts[1]) % 12) + (parts[3]!.toUpperCase() === 'P' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${parts[2]}:00`;
}

/** Reads the show cards, one show per showtime. Past showtimes are skipped. */
export function readShows(html: string, today: string): ShowEvent[] {
  return html.split(/<div data-year="/).slice(1).flatMap((card): ShowEvent[] => {
    const year = /^(\d{4})"/.exec(card)?.[1];
    const name = decodeText(/<div class="font-bold[^"]*uppercase">([\s\S]*?)<\/div>/.exec(card)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '');
    const day = /<div class="font-bold text-5xl[^"]*">\s*(\d{1,2})/.exec(card)?.[1];
    const monthName = /<div class="font-medium text-xl lg:text-2xl">\s*([A-Za-z]{3})/.exec(card)?.[1];
    const path = /href="(\/toronto\/show\/[a-z0-9-]+)"/.exec(card)?.[1];
    const month = MONTHS.indexOf((monthName ?? '').toLowerCase());
    if (!year || !name || !day || month < 0 || !path) return [];
    const start = `${year}-${String(month + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
    const times = [...card.matchAll(/<span class="text-xl relative[^"]*">\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*([A-Z]{3})/gi)];
    return times.flatMap((match): ShowEvent[] => {
      const date = nextWeekday(start, match[2]!);
      const time = clock(match[1]!);
      if (!date || date < today) return [];
      return [
        makeShow(
          {
            id: `${path.slice(path.lastIndexOf('/') + 1)}-${date}-${(time ?? '').slice(0, 5)}`,
            name,
            date,
            time,
            url: `${SITE}${path}`,
            venueId: VENUE_ID,
          },
          { category: 'Comedy' },
        ),
      ];
    });
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('yukyuks', isAllowedUrl, options);
}

export async function fetchShows(today: string, fetchPage: PageFetch = createFetch()): Promise<ShowEvent[]> {
  const html = await fetchPage(CLUB_PAGE, 'the Toronto club page');
  if (!html.includes('/toronto/show/')) throw new Error("yukyuks' Toronto page has no shows (a new layout?). Stopping.");
  return readShows(html, today);
}
