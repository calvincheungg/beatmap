/**
 * Reads the Canadian Opera Company's performances at the Four Seasons Centre, from the feed its own
 * calendar page (coc.ca/tickets/calendar) loads: a list of productions, each with its performances
 * and exact start times. Facts only: title, start and a link to the production's page. Summaries
 * and images are never stored.
 *
 * Main stage operas count as Theatre, like other operas. The free concerts in the centre's Richard
 * Bradshaw Amphitheatre count as Music. Productions elsewhere (Todmorden Mills, the COC's own
 * theatre) are left out, since they aren't at a venue on the map.
 */
import { decodeText, makeShow, torontoDateTime } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

/** The feed behind the COC's calendar page. "Live" is the published stage of the site. */
export const FEED = 'https://d1ndd0kfyiplr2.cloudfront.net/Prod/events/10/40/Live';
const SITE = 'https://www.coc.ca';
const VENUE_ID = 'four-seasons-centre';
/** The COC's names for spaces in the Four Seasons Centre. */
const FOUR_SEASONS_SPACES = ['four seasons centre', 'richard bradshaw amphitheatre'];
/** Production types the COC's own calendar hides (from its site code). */
const HIDDEN_TYPES = [4, 5];

export interface CocPerformance {
  PerformanceNumber?: number;
  /** ISO with offset, like "2027-01-23T19:30:00-05:00". */
  PerformanceDate?: string;
  ProductionTypes?: { ID?: number; Title?: string }[];
}

export interface CocProduction {
  ID?: number;
  Title?: string;
  /** Like "Free Concert Series / Lunchtime". */
  Prefix?: string | null;
  ProductionSeasonNumber?: number;
  /** A path on coc.ca, like "/tickets/2627-season/la-traviata". */
  Link?: string;
  Venue?: { Title?: string } | string | null;
  /** 1 for a second listing of a production, which the COC's calendar hides. */
  IsDuplicate?: number;
  Performances?: CocPerformance[];
}

export function isAllowedUrl(url: string): boolean {
  return url === FEED;
}

function venueName(production: CocProduction): string {
  const venue = production.Venue;
  return (typeof venue === 'string' ? venue : (venue?.Title ?? '')).toLowerCase();
}

/** Performances at the Four Seasons Centre from today on. */
export function toShowEvents(productions: CocProduction[], today: string): ShowEvent[] {
  return productions.flatMap((production): ShowEvent[] => {
    const name = decodeText(production.Title ?? '');
    const venue = venueName(production);
    if (!name || production.IsDuplicate === 1 || !FOUR_SEASONS_SPACES.some((space) => venue.includes(space))) return [];
    const link = production.Link?.startsWith('/') ? `${SITE}${production.Link}` : `${SITE}/tickets/calendar`;
    const freeConcert = /free concert/i.test(production.Prefix ?? '');
    return (production.Performances ?? []).flatMap((performance): ShowEvent[] => {
      if (performance.ProductionTypes?.some((type) => HIDDEN_TYPES.includes(type.ID ?? -1))) return [];
      const when = new Date(performance.PerformanceDate ?? '');
      if (!performance.PerformanceNumber || Number.isNaN(when.getTime())) return [];
      const { date, time } = torontoDateTime(when);
      if (date < today) return [];
      const mainStage = performance.ProductionTypes?.some((type) => /main stage/i.test(type.Title ?? ''));
      return [
        makeShow(
          {
            id: `${production.ProductionSeasonNumber ?? production.ID}-${performance.PerformanceNumber}`,
            name,
            date,
            time,
            url: link,
            venueId: VENUE_ID,
          },
          mainStage && !freeConcert ? { category: 'Theatre' } : { category: 'Music' },
        ),
      ];
    });
  });
}

export function createFetch(options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch('coc', isAllowedUrl, options);
}

export async function fetchShows(today: string, fetchPage: PageFetch = createFetch()): Promise<ShowEvent[]> {
  const body: unknown = JSON.parse(await fetchPage(FEED, 'the performance feed'));
  if (!Array.isArray(body)) throw new Error("coc's feed sent something other than a list of productions. Stopping.");
  return toShowEvents(body as CocProduction[], today);
}
