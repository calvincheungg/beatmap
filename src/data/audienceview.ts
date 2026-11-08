/**
 * Reads show listings from venues that sell tickets through AudienceView Professional.
 * Only facts are kept (title, date, time, price range, availability) plus a link back to the
 * venue's own listing. Descriptions and images are never stored: they're the venue's copyright.
 *
 * How it works: the site's event search embeds its results in the page as two JavaScript arrays,
 * `searchNames` (field names) and `searchResults` (rows). Searching for performances in a date
 * window returns everything needed, so show pages, seat maps and the cart are never opened.
 * Results come 20 at a time and the site's paging doesn't work outside a browser, so a window
 * that comes back full is split in two and searched again.
 *
 * Some sites refuse direct searches (Flato Markham Theatre answers 500). For those, the venue's
 * "all events" listing is read page by page, then each show's own page, which embeds the same
 * arrays with one row per performance. Show pages are cached for a few days by the sync script.
 *
 * Spotting another AudienceView venue: ticket pages at /Online/default.asp with
 * `doWork::WScontent::` and `BOparam::` in the address, a hidden `sToken` form field, scripts
 * under /Common/Widgets/, and `searchNames` / `searchResults` in the page source.
 */
import { classifyShow } from './categories.ts';
import { createPoliteFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export interface AudienceViewVenue {
  /** A short name for the event source, like "rhcentre". */
  key: string;
  /** The site's ticketing root, ending in /Online/. */
  onlineUrl: string;
  /** The venue's id in src/data/toronto_music_venues.csv. */
  venueId: string;
  /** AudienceView venue names (full or short) that count as this venue. Offsite and classroom listings are skipped. */
  venueNames: string[];
  /**
   * The page id of the venue's "all events" listing, for sites that refuse direct searches.
   * When set, shows are found through the listing and their own pages instead of searches.
   */
  listingArticleId?: string;
  /** Words a venue puts before its own shows' titles, removed for display. */
  titlePrefixes: RegExp[];
}

export const RICHMOND_HILL_CENTRE: AudienceViewVenue = {
  key: 'rhcentre',
  onlineUrl: 'https://www.rhcentre.ca/Online/',
  venueId: 'richmond-hill-centre-for-the-performing-arts',
  venueNames: ['Richmond Hill Centre for the Performing Arts', 'Richmond Hill Centre - GA'],
  titlePrefixes: [/^RHCPA Presents\s*[-–:]\s*/i],
};

export const FLATO_MARKHAM_THEATRE: AudienceViewVenue = {
  key: 'flato',
  onlineUrl: 'https://www.flatomarkhamtheatre.ca/Online/',
  venueId: 'flato-markham-theatre',
  venueNames: ['Flato Markham Theatre'],
  titlePrefixes: [],
  // "All Performances & Events"
  listingArticleId: '5E2D64E4-789A-4047-B880-406A0102F05D',
};

export { REQUEST_GAP_MS, USER_AGENT } from './politeFetch.ts';
/** How far ahead to look, in days. */
const LOOKAHEAD_DAYS = 365;
/** The first search window, in days. Busy windows are split. */
const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows that are test listings, bar add-ons, fees or merchandise rather than shows. */
const NOT_A_SHOW = /\b(fake|test|debit|add[- ]?on|gift card|parking|voucher)\b/i;
const NOT_A_SHOW_CATEGORIES = new Set(['fake event', 'fees', 'concessions', 'souvenirs']);

export type SearchRow = Record<string, unknown>;

/** Finds the end of a JavaScript array literal, skipping brackets inside strings. */
function arrayEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '[') depth++;
    else if (char === ']' && --depth === 0) return i;
  }
  return -1;
}

/** JavaScript allows escapes like \' that JSON doesn't, so they're made valid first. */
function parseJsArray(text: string): unknown {
  const json = text.replace(/\\'/g, "'").replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  return JSON.parse(json);
}

function embeddedArray(html: string, name: string): unknown[] | null {
  const match = new RegExp(`\\b${name}\\s*:\\s*\\[`).exec(html);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  const end = arrayEnd(html, start);
  if (end < 0) return null;
  const value = parseJsArray(html.slice(start, end + 1));
  return Array.isArray(value) ? value : null;
}

/**
 * Turns the results embedded in a search page into objects keyed by field name. A search with no
 * matches is the site's normal page without the arrays, so that's an empty list. Returns null when
 * the site's page isn't there at all, which means its layout changed or a bot check answered.
 */
export function parseEmbeddedResults(html: string): SearchRow[] | null {
  const names = embeddedArray(html, 'searchNames');
  const rows = embeddedArray(html, 'searchResults');
  if (!names || !rows) return /\bvar articleContext\s*=/.test(html) ? [] : null;
  return rows.filter(Array.isArray).map((row) => Object.fromEntries(names.map((name, index) => [String(name), row[index]])));
}

/** True when a search came back full, so there may be more results than it showed. */
export function hasMorePages(html: string): boolean {
  const total = /pagination\s*:\s*\{[^}]*total_pages\s*:\s*"(\d+)"/.exec(html);
  return total !== null && Number(total[1]) > 1;
}

const SEARCH = 'default.asp?doWork::WScontent::search=1';
const CRITERIA = 'BOset::WScontent::SearchCriteria::';

/** A search for performances between two dates, inclusive. */
export function searchUrl(venue: AudienceViewVenue, from: string, to: string): string {
  return `${venue.onlineUrl}${SEARCH}&${CRITERIA}search_criteria=&${CRITERIA}object_type_filter=P&${CRITERIA}search_from=${from}&${CRITERIA}search_to=${to}`;
}

/**
 * A search for a show by its title. The adapter uses it to find the show's page. It's also the
 * fallback link, though browsers that already have a session on the site get sent to the home page.
 */
export function showUrl(venue: AudienceViewVenue, title: string): string {
  return `${venue.onlineUrl}${SEARCH}&${CRITERIA}search_criteria=${encodeURIComponent(title)}`;
}

/**
 * A show's own page, with its dates, prices and Buy button. The site links these without a session
 * token, so they work for every visitor. Only visitors open it: the adapter never fetches it.
 */
export function articleUrl(venue: AudienceViewVenue, articleId: string): string {
  return `${venue.onlineUrl}default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=${encodeURIComponent(articleId)}`;
}

/** True for a link to a show's own page rather than a search. */
export function isArticleUrl(url: string): boolean {
  return url.includes('WScontent::loadArticle::article_id=');
}

/**
 * Finds a show's page among the rows of a title search. Its internal name starts with the date
 * of one of its performances, like "20270205DaalBand-R". When two pages share a date, or none
 * matches, the one with the same title wins.
 */
export function findArticleId(rows: SearchRow[], title: string, dates: string[]): string | null {
  const articles = rows.filter((row) => row.object_type === 'A' && text(row.id));
  const sameTitle = (row: SearchRow) => text(row.short_description).toLowerCase() === title.toLowerCase();
  const compactDates = dates.map((date) => date.replaceAll('-', ''));
  const onDate = articles.filter((row) => compactDates.some((date) => text(row.name).startsWith(date)));
  const match = onDate.find(sameTitle) ?? onDate[0] ?? articles.find(sameTitle);
  return match ? text(match.id) : null;
}

/** Only event searches may be requested, never show pages, seat selection, the cart or log in. */
/** A page of the venue's "all events" listing, which needs the session's token from the page before. */
export function listingPageUrl(venue: AudienceViewVenue, page: number, sToken: string): string {
  const listing = venue.listingArticleId ?? '';
  if (page <= 1) return articleUrl(venue, listing);
  return `${venue.onlineUrl}default.asp?sToken=${encodeURIComponent(sToken)}&BOset::WScontent::SearchResultsInfo::current_page=${page}&doWork::WScontent::getPage=&BOparam::WScontent::getPage::article_id=${encodeURIComponent(listing)}`;
}

/**
 * Only event searches, listing pages and show pages may be requested, never seat selection, the
 * cart, orders or log in.
 */
export function isAllowedUrl(venue: AudienceViewVenue, url: string): boolean {
  if (/seat|order|cart|login|checkout|basket/i.test(url)) return false;
  const allowed = [`${SEARCH}&`, 'default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=', 'default.asp?sToken='];
  return allowed.some((start) => url.startsWith(`${venue.onlineUrl}${start}`)) && (!url.includes('sToken=') || url.includes('WScontent::getPage='));
}

/** The session token a listing page carries for the next one. */
export function readSessionToken(html: string): string | null {
  return /pagination\s*:\s*\{[^}]*\}[\s\S]*?sToken\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null;
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity);
}

const text = (value: unknown): string => (typeof value === 'string' ? decodeEntities(value).replace(/\s+/g, ' ').trim() : '');

/** "$62.78" as 62.78. Zero and blanks are unknown, never free, like Ticketmaster's prices. */
export function parseMoney(value: unknown): number | null {
  const amount = Number.parseFloat(text(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** The show's date as YYYY-MM-DD. AudienceView counts months from 0. */
function showDate(row: SearchRow): string | null {
  const [year, month, day] = [row.start_date_year, row.start_date_month, row.start_date_date].map((value) => Number.parseInt(text(value), 10));
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(year!, month!, day!));
  return date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

function showTime(row: SearchRow): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text(row.start_date_time));
  return match ? `${match[1]!.padStart(2, '0')}:${match[2]}:00` : null;
}

/** AudienceView marks availability as E(xcellent), G(ood), L(imited) or S(old out). */
function showStatus(row: SearchRow): string {
  if (text(row.availability_status) === 'S' || text(row.availability_num) === '0') return 'soldout';
  return text(row.sales_status) === 'S' ? 'onsale' : 'offsale';
}

function isShow(row: SearchRow, venue: AudienceViewVenue): boolean {
  const title = `${text(row.short_description)} ${text(row.name)}`;
  return (
    row.object_type === 'P' &&
    text(row.access) === 'Public' &&
    (venue.venueNames.includes(text(row.venue_name)) || venue.venueNames.includes(text(row.venue_short_description))) &&
    !NOT_A_SHOW.test(title) &&
    !NOT_A_SHOW_CATEGORIES.has(text(row.category).toLowerCase())
  );
}

/** Turns search rows into shows at the venue. Rows that aren't public shows there are dropped. */
export function toShowEvents(rows: SearchRow[], venue: AudienceViewVenue): ShowEvent[] {
  const events = new Map<string, ShowEvent>();
  for (const row of rows) {
    const id = text(row.id);
    const date = showDate(row);
    const title = venue.titlePrefixes.reduce((name, prefix) => name.replace(prefix, ''), text(row.short_description));
    if (!id || !date || !title || !isShow(row, venue)) continue;

    const priceMin = parseMoney(row.min_price);
    const priceMax = parseMoney(row.max_price);
    const { category, genre, subGenre } = classifyShow(`${title} ${text(row.series_name)}`);
    events.set(id, {
      id,
      name: title,
      date,
      time: showTime(row),
      status: showStatus(row),
      // Rows read from a show's own page carry its id, so they link there directly.
      url: text(row.article_id) ? articleUrl(venue, text(row.article_id)) : showUrl(venue, title),
      venueId: venue.venueId,
      genre,
      subGenre,
      category,
      artists: [],
      priceMin,
      priceMax: priceMin === null ? null : Math.max(priceMax ?? priceMin, priceMin),
      currency: priceMin === null ? null : 'CAD',
      ageLabel: null,
      imageUrl: null,
      firstSeenAt: null,
    });
  }
  return [...events.values()].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
}

export interface FetchOptions {
  /** The first day to search, as YYYY-MM-DD in the venue's time zone. */
  today: string;
  fetcher?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  onWarning?: (message: string) => void;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

type Search = (url: string, what: string) => Promise<{ rows: SearchRow[]; html: string }>;

/**
 * Makes requests to one venue's site, 2 seconds apart, as BeatMap, to allowed search pages only.
 * Stops at the first error or bot check, rather than retrying, so a venue that turns us away isn't pressed.
 */
export function createSearch(venue: AudienceViewVenue, options: PoliteFetchOptions = {}): Search {
  const fetchPage = createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
  return async (url, what) => {
    const html = await fetchPage(url, what);
    const rows = parseEmbeddedResults(html);
    if (!rows) throw new Error(`${venue.key} sent a page without search results (a bot check or a new layout). Stopping.`);
    return { rows, html };
  };
}

/** Searches the next year one window at a time. A window that fills a page is split in two. */
export async function fetchSearchRows(venue: AudienceViewVenue, options: FetchOptions, search = createSearch(venue, options)): Promise<SearchRow[]> {
  const end = addDays(options.today, LOOKAHEAD_DAYS);
  const windows: [string, string][] = [];
  for (let from = options.today; from <= end; from = addDays(from, WINDOW_DAYS)) {
    const to = addDays(from, WINDOW_DAYS - 1);
    windows.push([from, to < end ? to : end]);
  }

  const rows: SearchRow[] = [];
  while (windows.length > 0) {
    const [from, to] = windows.shift()!;
    const { rows: found, html } = await search(searchUrl(venue, from, to), `${from} to ${to}`);
    const span = daysBetween(from, to);
    if (hasMorePages(html) && span > 0) {
      // Too many for one page: search each half instead.
      const middle = addDays(from, Math.floor(span / 2));
      windows.unshift([from, middle], [addDays(middle, 1), to]);
      continue;
    }
    if (hasMorePages(html)) options.onWarning?.(`${venue.key} has more than one page of shows on ${from}. Only the first was read.`);
    rows.push(...found);
  }
  return rows;
}

/**
 * Points each show's link at its own page. Pages found on earlier runs are reused from `known`
 * (title to link), so only new shows cost a request. Shows whose page can't be found keep the
 * search link. Returns how many shows have no page.
 */
export async function linkShowPages(
  events: ShowEvent[],
  venue: AudienceViewVenue,
  known: Map<string, string>,
  search: Search,
): Promise<number> {
  const byTitle = new Map<string, ShowEvent[]>();
  for (const event of events) byTitle.set(event.name, [...(byTitle.get(event.name) ?? []), event]);
  let missing = 0;
  for (const [title, shows] of byTitle) {
    let url = known.get(title);
    if (!url || !isArticleUrl(url)) {
      const { rows } = await search(showUrl(venue, title), `the page for ${title}`);
      const id = findArticleId(rows, title, shows.map((show) => show.date));
      url = id ? articleUrl(venue, id) : undefined;
    }
    if (url) for (const show of shows) show.url = url;
    else missing += shows.length;
  }
  return missing;
}

export interface ListedShow {
  articleId: string;
  title: string;
}

/** Reads every page of the venue's "all events" listing, in one session. */
export async function fetchListing(venue: AudienceViewVenue, search: Search): Promise<ListedShow[]> {
  const shows = new Map<string, ListedShow>();
  let token = '';
  for (let page = 1; ; page++) {
    const { rows, html } = await search(listingPageUrl(venue, page, token), `listing page ${page}`);
    for (const row of rows) {
      const articleId = text(row.id);
      if (row.object_type === 'A' && articleId) shows.set(articleId, { articleId, title: text(row.short_description) });
    }
    const total = Number(/pagination\s*:\s*\{[^}]*total_pages\s*:\s*"(\d+)"/.exec(html)?.[1] ?? 1);
    const next = readSessionToken(html);
    if (page >= total || !next) break;
    token = next;
  }
  return [...shows.values()];
}

/** The performance fields kept from a show's page. Descriptions and images are left behind. */
const FACT_FIELDS = [
  'id', 'object_type', 'category', 'name', 'short_description', 'start_date_time', 'start_date_date', 'start_date_month',
  'start_date_year', 'sales_status', 'availability_status', 'availability_num', 'access', 'venue_name',
  'venue_short_description', 'series_name', 'min_price', 'max_price',
];

/** A show page's performances, reduced to facts and tagged with the page they came from. */
export function performanceFacts(rows: SearchRow[], articleId: string): SearchRow[] {
  return rows
    .filter((row) => row.object_type === 'P')
    .map((row) => ({ ...Object.fromEntries(FACT_FIELDS.map((field) => [field, row[field] ?? ''])), article_id: articleId }));
}

export interface ShowPageResult {
  /** Performance facts from every listed show, cached or fresh. */
  rows: SearchRow[];
  /** Pages fetched this run, by link, to save in the cache. */
  fetched: Map<string, SearchRow[]>;
  reused: number;
}

/**
 * Reads the listing, then each show's own page, reusing facts from `cached` pages that are still
 * fresh. `isFresh` decides how old a cached page may be.
 */
export async function fetchFromShowPages(
  venue: AudienceViewVenue,
  search: Search,
  cached: Map<string, { fetchedAt: string; rows: SearchRow[] }>,
  isFresh: (fetchedAt: string) => boolean,
): Promise<ShowPageResult> {
  const listed = await fetchListing(venue, search);
  const rows: SearchRow[] = [];
  const fetched = new Map<string, SearchRow[]>();
  let reused = 0;
  for (const { articleId, title } of listed) {
    const url = articleUrl(venue, articleId);
    const cache = cached.get(url);
    if (cache && isFresh(cache.fetchedAt)) {
      rows.push(...cache.rows);
      reused++;
      continue;
    }
    const { rows: found } = await search(url, `the page for ${title || articleId}`);
    const facts = performanceFacts(found, articleId);
    fetched.set(url, facts);
    rows.push(...facts);
  }
  return { rows, fetched, reused };
}
