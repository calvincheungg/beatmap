/**
 * Reads Bad Dog Theatre's shows from its "What's On" page (a Squarespace events calendar). The
 * calendar is drawn in the browser, but the page carries a plain list for browsers without
 * JavaScript (<noscript>) with each show's title, link, date and time, and venue address.
 *
 * Bad Dog has no stage of its own: shows go on the pin for the theatre whose street address they
 * give. Shows anywhere else are skipped. Facts only: title, date, time and link.
 */
import { decodeText, makeShow } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

const SITE = 'https://baddogtheatre.com';
export const WHATS_ON = `${SITE}/whats-on`;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Theatres Bad Dog plays, by text in their street address, and their ids in the venue CSV. */
const THEATRES: { address: RegExp; venueId: string }[] = [
  { address: /\b180 Shaw\b/i, venueId: 'sweet-action-theatre' },
  { address: /\b967 College\b/i, venueId: 'society-clubhouse' },
];

export function isAllowedUrl(url: string): boolean {
  return url === WHATS_ON;
}

/** "Wednesday, November 25, 2026, 8:30 PM – 9:30 PM" as a date and 24-hour start time. */
export function readWhen(text: string): { date: string; time: string | null } | null {
  const parts = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*([AP])M)?/i.exec(text);
  const month = parts ? MONTHS.indexOf(parts[1]!.toLowerCase()) : -1;
  if (!parts || month < 0) return null;
  const date = `${parts[3]}-${String(month + 1).padStart(2, '0')}-${parts[2]!.padStart(2, '0')}`;
  if (!parts[4]) return { date, time: null };
  const hour = (Number(parts[4]) % 12) + (parts[6]!.toUpperCase() === 'P' ? 12 : 0);
  return { date, time: `${String(hour).padStart(2, '0')}:${parts[5]}:00` };
}

/** Reads the plain list of shows. Past shows and shows at other venues are skipped. */
export function readShows(html: string, today: string): ShowEvent[] {
  const list = /<noscript>\s*<ul>([\s\S]*?)<\/ul>\s*<\/noscript>/.exec(html)?.[1] ?? '';
  return list.split(/<li>\s*<h1>/).slice(1).flatMap((item): ShowEvent[] => {
    const link = /<a href="(\/whats-on\/[^"]+)">([\s\S]*?)<\/a>/.exec(item);
    const name = decodeText(link?.[2]?.replace(/<[^>]+>/g, ' ') ?? '');
    const when = readWhen(decodeText(item.replace(/<[^>]+>/g, ' ')));
    const place = decodeText(/<ul>([\s\S]*?)<\/ul>/.exec(item)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '');
    const theatre = THEATRES.find(({ address }) => address.test(place));
    if (!link || !name || !when || when.date < today || !theatre) return [];
    const path = link[1]!;
    return [
      makeShow(
        {
          id: `${path.slice(path.lastIndexOf('/') + 1)}-${when.date}`,
          name,
          date: when.date,
          time: when.time,
          url: `${SITE}${path}`,
          venueId: theatre.venueId,
        },
        { category: 'Comedy' },
      ),
    ];
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('baddog', isAllowedUrl, options);
}

export async function fetchShows(today: string, fetchPage: PageFetch = createFetch()): Promise<ShowEvent[]> {
  const html = await fetchPage(WHATS_ON, "the What's On page");
  if (!/<noscript>\s*<ul>/.test(html)) throw new Error("baddog's What's On page has no show list (a new layout?). Stopping.");
  return readShows(html, today);
}
