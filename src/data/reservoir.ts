/**
 * Reads The Reservoir Lounge's weekly lineup from the Google Sheet its website publishes as CSV
 * (the site's own script loads the same sheet). The sheet holds one week, Tuesday to Sunday:
 * a "Week of" date, then each night's artist, a one-line description and the first set's time.
 *
 * The description is used only to pick a genre, like "jazz" or "blues", and is never stored. There's
 * no price or per-show page, so the link is the music section of the venue's site.
 */
import { classifyShow } from './categories.ts';
import { decodeText, makeShow } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export const LINEUP_SHEET =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTl2Egl9fk6KXx2FEngyFD-eClJ8WgPCzoOTrW9j6x5KVF9-zdpvJB_CVPHf7KBzuaVt303pzwuh7ki/pub?gid=206764270&single=true&output=csv';
const VENUE_URL = 'https://www.reservoirlounge.com/#music';
const VENUE_ID = 'reservoir-lounge';
const NIGHTS = ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function isAllowedUrl(url: string): boolean {
  return url === LINEUP_SHEET;
}

/** Splits CSV text into rows, handling quoted cells with commas and doubled quotes. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/** "9:30 pm" as "21:30:00". */
function setTime(text: string): string | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(text.trim());
  if (!match) return null;
  const hours = (Number(match[1]) % 12) + (match[3]!.toLowerCase() === 'p' ? 12 : 0);
  return `${String(hours).padStart(2, '0')}:${match[2] ?? '00'}:00`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Turns the sheet into shows from today on. Empty nights and a missing week give no shows. */
export function readLineup(csvText: string, today: string): ShowEvent[] {
  const rows = parseCsvRows(csvText);
  const week = rows.find((row) => row[0]?.toLowerCase() === 'week of')?.[1] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return [];
  return NIGHTS.flatMap((night, index): ShowEvent[] => {
    const row = rows.find((cells) => cells[0]?.toLowerCase() === night);
    const artist = decodeText(row?.[1] ?? '');
    const date = addDays(week, index);
    if (!artist || date < today) return [];
    // The description only picks a genre: "Old-school blues..." is Blues.
    const kind = classifyShow(`${artist} ${row?.[2] ?? ''}`);
    return [
      makeShow(
        { id: `${date}-${artist.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: artist, date, time: setTime(row?.[3] ?? ''), url: VENUE_URL, venueId: VENUE_ID },
        { category: 'Music', ...(kind.category === 'Music' && kind.genre ? { genre: kind.genre } : {}) },
      ),
    ];
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('reservoir', isAllowedUrl, options);
}

export async function fetchShows(today: string, fetchPage: PageFetch = createFetch()): Promise<ShowEvent[]> {
  const text = await fetchPage(LINEUP_SHEET, 'the lineup sheet');
  if (!/^week of,/im.test(text)) throw new Error("reservoir's lineup sheet has no week (a new layout?). Stopping.");
  return readLineup(text, today);
}
