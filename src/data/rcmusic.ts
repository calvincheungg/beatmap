/**
 * Reads concert listings for The Royal Conservatory's halls (Koerner Hall, Mazzoleni Concert Hall)
 * from rcmusic.com's concert search pages. Each listing card gives the title, date, time and the
 * concert's page, which is the ticket link. Prices appear only in seat selection, which is never
 * opened, so they're unknown. Descriptions and images are never stored.
 *
 * Note: RCM's terms of use restrict reusing site content without written permission. The project
 * owner chose to collect these facts anyway, so keep requests light and never widen what's kept.
 */
import { classifyShow } from './categories.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export const RCM_SITE = 'https://www.rcmusic.com';

export interface RcmHall {
  /** The hall's name in the site's venue filter. */
  filterName: string;
  /** The venue's id in src/data/toronto_music_venues.csv. */
  venueId: string;
}

export const RCM_HALLS: RcmHall[] = [
  { filterName: 'Koerner Hall', venueId: 'koerner-hall' },
  { filterName: 'Mazzoleni Concert Hall', venueId: 'mazzoleni-concert-hall' },
];

/** A safety limit on pages per hall. */
const MAX_PAGES = 20;

/** One page of a hall's concert listing. */
export function listingUrl(hall: RcmHall, page: number): string {
  const filter = `fq=eventvenue%7C%7C${encodeURIComponent(hall.filterName).replace(/%20/g, '+')}`;
  return `${RCM_SITE}/concerts?${filter}${page > 1 ? `&page=${page}` : ''}`;
}

/** Only concert listing pages may be requested: never seat selection, tickets or accounts. */
export function isAllowedUrl(url: string): boolean {
  return /^https:\/\/www\.rcmusic\.com\/concerts\?fq=eventvenue%7C%7C[A-Za-z+]+(&page=\d+)?$/.test(url);
}

export interface ConcertCard {
  title: string;
  /** "Nov 08, 2026 3:00 PM", in Toronto time. */
  when: string;
  /** The concert's page, relative to the site, like /concert/garrick-ohlsson-piano-426801. */
  path: string;
  /** The card's image address, which is where RCM marks postponed and cancelled concerts. */
  image: string;
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#x27': "'" };

function clean(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&(#x27|[a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reads the concert cards on a listing page. */
export function readCards(html: string): ConcertCard[] {
  const cards = html.split('class="cell tps-card-item').slice(1);
  return cards.flatMap((card): ConcertCard[] => {
    const when = /tps-card-item-date-inner">([^<]+)</.exec(card)?.[1];
    const link = /class="tps-card-item-title[^"]*" href="(\/concert\/[^"?#]+)">([^<]*)</.exec(card);
    if (!when || !link) return [];
    const image = /background-image:url\((?:&#x27;|')?([^'&)]+)/.exec(card)?.[1] ?? '';
    return [{ title: clean(link[2]!), when: clean(when), path: link[1]!, image }];
  });
}

/** True when the pager's Next button is disabled, or there's no pager: the last page. */
export function isLastPage(html: string): boolean {
  return !/pager-next(?! disabled)/.test(html);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Nov 08, 2026 3:00 PM" as a date and a 24-hour time. */
export function parseWhen(when: string): { date: string; time: string | null } | null {
  const match = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})(?: (\d{1,2}):(\d{2}) ?([AP]M))?/i.exec(when);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]!.toLowerCase());
  if (month < 0) return null;
  const date = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
  if (!match[4]) return { date, time: null };
  const hours = (Number(match[4]) % 12) + (match[6]!.toUpperCase() === 'PM' ? 12 : 0);
  return { date, time: `${String(hours).padStart(2, '0')}:${match[5]}:00` };
}

function statusOf(card: ConcertCard): string {
  const text = `${card.title} ${card.image}`;
  if (/cancell?ed/i.test(text)) return 'cancelled';
  if (/postponed/i.test(text)) return 'postponed';
  if (/rescheduled/i.test(text)) return 'rescheduled';
  if (/sold[\s_-]*out/i.test(text)) return 'soldout';
  return 'onsale';
}

/** Turns one hall's cards into shows linked to their concert pages. */
export function toShowEvents(cards: ConcertCard[], hall: RcmHall): ShowEvent[] {
  return cards.flatMap((card): ShowEvent[] => {
    const when = parseWhen(card.when);
    if (!when || !card.title) return [];
    // A title that announces its status keeps it in the stamp, not the name.
    const name = card.title.replace(/^\s*(?:cancell?ed|postponed|rescheduled)\s*[-:–]\s*/i, '');
    // Everything here comes from RCM's concert search, so a title the rules can't place is still music.
    const kind = classifyShow(name);
    return [
      {
        // The concert page names a performance, so it identifies the show. A date makes a repeat distinct.
        id: `${card.path.replace(/^\/concert\//, '')}@${when.date}${when.time ? `T${when.time}` : ''}`,
        name,
        date: when.date,
        time: when.time,
        status: statusOf(card),
        url: `${RCM_SITE}${card.path}`,
        venueId: hall.venueId,
        ...(kind.category === 'Other' ? { ...kind, category: 'Music' } : kind),
        artists: [],
        priceMin: null,
        priceMax: null,
        currency: null,
        ageLabel: null,
        imageUrl: null,
        firstSeenAt: null,
      },
    ];
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('rcmusic', isAllowedUrl, options);
}

/** Reads every page of each hall's listing. */
export async function fetchShows(fetchPage: PageFetch, halls: RcmHall[] = RCM_HALLS): Promise<{ events: ShowEvent[]; pages: number }> {
  const events = new Map<string, ShowEvent>();
  let pages = 0;
  for (const hall of halls) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await fetchPage(listingUrl(hall, page), `${hall.filterName} page ${page}`);
      pages++;
      const cards = readCards(html);
      if (cards.length === 0 && page === 1 && !html.includes('tps-aws-results')) {
        throw new Error(`rcmusic's ${hall.filterName} listing has no concert list (a new layout?). Stopping.`);
      }
      for (const event of toShowEvents(cards, hall)) events.set(event.id, event);
      if (cards.length === 0 || isLastPage(html)) break;
    }
  }
  return { events: [...events.values()].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`)), pages };
}
