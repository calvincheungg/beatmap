/** Fetching and venue matching for Ticketmaster's Discovery API. No browser or Node dependencies. */

const API_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const PAGE_SIZE = 200;
/** The API refuses results past item 1000. */
const MAX_ITEMS = 1000;
/** Fetching in short windows keeps busy periods under that limit. */
const WINDOW_DAYS = 30;
const WINDOWS = 6;
/** Ticketmaster's docs give 2 or 5 requests per second in different places, so stay under both. */
const REQUEST_GAP_MS = 550;
/** Two names that match must be this close, in metres. */
const NAME_MATCH_METRES = 400;
/** A venue this close counts as a match when it's the only one nearby and the names differ. */
const LOCATION_MATCH_METRES = 75;

/** The docs spell it `canceled`, but real responses use `cancelled`. */
const CANCELLED = new Set(['canceled', 'cancelled']);

const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

/** The API's location filter takes a geohash. */
export function encodeGeohash(lat: number, lon: number, length = 6): string {
  let [minLat, maxLat, minLon, maxLon] = [-90, 90, -180, 180];
  let hash = '';
  let bits = 0;
  let value = 0;
  let useLon = true;
  while (hash.length < length) {
    if (useLon) {
      const middle = (minLon + maxLon) / 2;
      value = value * 2 + (lon >= middle ? 1 : 0);
      if (lon >= middle) minLon = middle;
      else maxLon = middle;
    } else {
      const middle = (minLat + maxLat) / 2;
      value = value * 2 + (lat >= middle ? 1 : 0);
      if (lat >= middle) minLat = middle;
      else maxLat = middle;
    }
    useLon = !useLon;
    if (++bits === 5) {
      hash += GEOHASH_ALPHABET[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

export interface ApiVenue {
  id?: string;
  name?: string;
  location?: { latitude?: string; longitude?: string };
}

export interface ApiEvent {
  id?: string;
  name?: string;
  url?: string;
  dates?: {
    start?: { localDate?: string; localTime?: unknown };
    status?: { code?: string };
  };
  _embedded?: { venues?: ApiVenue[] };
}

interface ApiResponse {
  _embedded?: { events?: ApiEvent[] };
  page?: { totalElements?: number; totalPages?: number };
}

export interface FetchOptions {
  apiKey: string;
  lat: number;
  lon: number;
  radiusKm: number;
  now: Date;
  fetcher?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  onWarning?: (message: string) => void;
}

function apiDate(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** Fetches upcoming music events near a point, one time window at a time. */
export async function fetchMusicEvents(options: FetchOptions): Promise<ApiEvent[]> {
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const events = new Map<string, ApiEvent>();
  const geoPoint = encodeGeohash(options.lat, options.lon);
  const dayMs = 24 * 60 * 60 * 1000;

  for (let window = 0; window < WINDOWS; window++) {
    const start = new Date(options.now.getTime() + window * WINDOW_DAYS * dayMs);
    const end = new Date(start.getTime() + WINDOW_DAYS * dayMs);

    for (let page = 0; (page + 1) * PAGE_SIZE <= MAX_ITEMS; page++) {
      const params = new URLSearchParams({
        apikey: options.apiKey,
        classificationName: 'music',
        countryCode: 'CA',
        geoPoint,
        radius: String(options.radiusKm),
        unit: 'km',
        sort: 'date,asc',
        startDateTime: apiDate(start),
        endDateTime: apiDate(end),
        size: String(PAGE_SIZE),
        page: String(page),
      });
      const response = await fetcher(`${API_URL}?${params}`);
      // The request URL contains the key, so errors report only the status.
      if (!response.ok) throw new Error(`Ticketmaster returned ${response.status} for window ${window + 1}, page ${page + 1}`);
      const body = (await response.json()) as ApiResponse;
      for (const event of body._embedded?.events ?? []) if (event.id) events.set(event.id, event);

      const total = body.page?.totalElements ?? 0;
      if (total > MAX_ITEMS && (page + 2) * PAGE_SIZE > MAX_ITEMS) {
        options.onWarning?.(`Window ${window + 1} has ${total} events, but the API only returns the first ${MAX_ITEMS}.`);
      }
      await wait(REQUEST_GAP_MS);
      if (page + 1 >= (body.page?.totalPages ?? 0)) break;
    }
  }
  return [...events.values()];
}

export interface MatchableVenue {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|toronto|on|ontario)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRadians = Math.PI / 180;
  const x = (bLon - aLon) * toRadians * Math.cos(((aLat + bLat) / 2) * toRadians);
  const y = (bLat - aLat) * toRadians;
  return Math.hypot(x, y) * 6371000;
}

function namesMatch(a: string, b: string): boolean {
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
}

/**
 * Finds the CSV venue for an API venue. A name match needs nearby coordinates when the API gives
 * them. Otherwise a lone venue right beside the location matches. Null means it isn't one of ours.
 */
export function matchVenue<T extends MatchableVenue>(apiVenue: ApiVenue, venues: T[]): T | null {
  const name = normalizeVenueName(apiVenue.name ?? '');
  const lat = Number.parseFloat(apiVenue.location?.latitude ?? '');
  const lon = Number.parseFloat(apiVenue.location?.longitude ?? '');
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lon);
  const distance = (venue: T) => (hasLocation ? metresBetween(lat, lon, venue.lat, venue.lon) : Infinity);

  const named = venues.filter((venue) => name && namesMatch(name, normalizeVenueName(venue.name)));
  const byName = hasLocation ? named.filter((venue) => distance(venue) <= NAME_MATCH_METRES) : named;
  if (byName.length > 0) return byName.sort((a, b) => distance(a) - distance(b))[0]!;

  const nearby = venues.filter((venue) => distance(venue) <= LOCATION_MATCH_METRES);
  return nearby.length === 1 ? nearby[0]! : null;
}

export interface ShowEvent {
  id: string;
  name: string;
  /** YYYY-MM-DD in Toronto time. */
  date: string;
  /** HH:mm:ss, or null when the time isn't announced. */
  time: string | null;
  status: string;
  url: string;
  venueId: string;
}

export interface CoverageReport {
  events: ShowEvent[];
  /** How many fetched events matched each of our venues. */
  matchedCounts: Map<string, number>;
  /** How many fetched events each venue outside our list had. */
  unmatchedVenues: Map<string, number>;
  /** The Ticketmaster names matched to each of our venues, to spot wrong matches. */
  matchedNames: Map<string, Set<string>>;
}

/** Keeps events at our venues, in date order. Cancelled events and incomplete records are dropped. */
export function toShowEvents<T extends MatchableVenue>(apiEvents: ApiEvent[], venues: T[]): CoverageReport {
  const events: ShowEvent[] = [];
  const matchedCounts = new Map<string, number>();
  const unmatchedVenues = new Map<string, number>();
  const matchedNames = new Map<string, Set<string>>();

  for (const event of apiEvents) {
    const date = event.dates?.start?.localDate;
    const apiVenue = event._embedded?.venues?.[0];
    const status = event.dates?.status?.code ?? 'unknown';
    if (!event.id || !event.name || !event.url || !date || !apiVenue || CANCELLED.has(status)) continue;
    if (!/^https?:\/\//i.test(event.url)) continue;

    const venue = matchVenue(apiVenue, venues);
    if (!venue) {
      const label = apiVenue.name ?? 'Unnamed venue';
      unmatchedVenues.set(label, (unmatchedVenues.get(label) ?? 0) + 1);
      continue;
    }
    matchedCounts.set(venue.id, (matchedCounts.get(venue.id) ?? 0) + 1);
    matchedNames.set(venue.id, (matchedNames.get(venue.id) ?? new Set()).add(apiVenue.name ?? 'Unnamed venue'));
    const time = event.dates?.start?.localTime;
    events.push({
      id: event.id,
      name: event.name,
      date,
      time: typeof time === 'string' ? time : null,
      status,
      url: event.url,
      venueId: venue.id,
    });
  }
  events.sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
  return { events, matchedCounts, unmatchedVenues, matchedNames };
}
