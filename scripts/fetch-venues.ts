// Fetches show listings from venues' own websites and saves them to Supabase: AudienceView box
// offices, and sites that publish schema.org Event data.
// Facts only: title, date, time, price range and availability, with a link back to the venue.
// Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Run: npm run data:venues
// To sync only some venues, name them: npm run data:venues -- redwood flato
import {
  createSearch,
  fetchFromShowPages,
  fetchSearchRows,
  FLATO_MARKHAM_THEATRE,
  linkShowPages,
  RICHMOND_HILL_CENTRE,
  toShowEvents,
  type AudienceViewVenue,
} from '../src/data/audienceview.ts';
import { storedLinks, syncEvents, torontoDate } from '../src/data/eventStore.ts';
import { isFresh, readPageCache, writePageCache } from '../src/data/pageCache.ts';
import { HttpStatusError } from '../src/data/politeFetch.ts';
import type { ShowEvent } from '../src/data/ticketmaster.ts';
import type { SearchRow } from '../src/data/audienceview.ts';
import * as admitOne from '../src/data/admitOne.ts';
import * as artsPeople from '../src/data/artsPeople.ts';
import * as elfsight from '../src/data/elfsightCalendar.ts';
import * as boomtech from '../src/data/boomtech.ts';
import * as bsmt254 from '../src/data/bsmt254.ts';
import * as drom from '../src/data/drom.ts';
import * as mrBlack from '../src/data/mrBlack.ts';
import * as rhythm from '../src/data/rhythm.ts';
import * as eventbrite from '../src/data/eventbrite.ts';
import * as tickera from '../src/data/tickera.ts';
import * as tribe from '../src/data/tribeEvents.ts';
import * as wix from '../src/data/wixEvents.ts';
import * as rcm from '../src/data/rcmusic.ts';
import * as reservoir from '../src/data/reservoir.ts';
import * as shopify from '../src/data/shopifyShows.ts';
import * as showpass from '../src/data/showpass.ts';
import * as squarespace from '../src/data/squarespaceEvents.ts';
import * as schema from '../src/data/schemaEvents.ts';

/** Venues on AudienceView. Add another by giving it a config like RICHMOND_HILL_CENTRE. */
const VENUES: AudienceViewVenue[] = [RICHMOND_HILL_CENTRE, FLATO_MARKHAM_THEATRE];
/** Venues whose event pages carry schema.org Event data. Add another with a config like REDWOOD_THEATRE. */
const SCHEMA_VENUES: schema.SchemaEventVenue[] = [schema.REDWOOD_THEATRE, schema.GEARY_WAREHOUSE, schema.LEAH_POSLUNS_THEATRE];

const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: serviceKey } = process.env;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY (see .env.example).');
  process.exit(1);
}

/** Venue keys named on the command line. None means every venue. */
const only = new Set(process.argv.slice(2));
/** The Royal Conservatory's halls (Koerner Hall, Mazzoleni Concert Hall), read from rcmusic.com together. */
const RCM_KEY = 'rcm';
/** Venues that sell on Eventbrite, read through its API. Needs EVENTBRITE_TOKEN. */
const EVENTBRITE_VENUES: eventbrite.EventbriteVenue[] = [eventbrite.LULA_LOUNGE];
/** Venues read from a ready-made event feed: one request each, no pages to read. */
/** `mayBeEmpty` venues publish one week at a time, so an empty feed between weeks isn't a failure. */
/** `mayRefuseCloud` venues refuse GitHub's servers (403) but not home connections, so that refusal is only a warning. */
const FEED_VENUES: { key: string; source: string; load: (today: string) => Promise<ShowEvent[]>; mayBeEmpty?: boolean; mayRefuseCloud?: boolean }[] = [
  { key: tribe.JAZZ_BISTRO.key, source: 'tribe:jazzbistro', load: (today) => tribe.fetchShows(tribe.JAZZ_BISTRO, today) },
  { key: admitOne.ADELAIDE_HALL.key, source: 'admitone:adelaide', load: () => admitOne.fetchShows(admitOne.ADELAIDE_HALL) },
  { key: elfsight.BOVINE_SEX_CLUB.key, source: 'elfsight:bovine', load: (today) => elfsight.fetchShows(elfsight.BOVINE_SEX_CLUB, today) },
  { key: tribe.GROSSMANS_TAVERN.key, source: 'tribe:grossmans', load: (today) => tribe.fetchShows(tribe.GROSSMANS_TAVERN, today) },
  { key: tribe.JUNCTION_UNDERGROUND.key, source: 'tribe:junction', load: (today) => tribe.fetchShows(tribe.JUNCTION_UNDERGROUND, today) },
  { key: tribe.CASTROS_LOUNGE.key, source: 'tribe:castros', load: (today) => tribe.fetchShows(tribe.CASTROS_LOUNGE, today) },
  { key: admitOne.QUEEN_ELIZABETH_THEATRE.key, source: 'admitone:qet', load: () => admitOne.fetchShows(admitOne.QUEEN_ELIZABETH_THEATRE) },
  { key: showpass.BURDOCK_MUSIC_HALL.key, source: 'showpass:burdock', load: () => showpass.fetchShows(showpass.BURDOCK_MUSIC_HALL) },
  { key: showpass.HUGHS_ROOM.key, source: 'showpass:hughs', load: () => showpass.fetchShows(showpass.HUGHS_ROOM) },
  { key: 'drom', source: 'site:drom', load: () => drom.fetchShows() },
  { key: shopify.THE_REX.key, source: 'shopify:rex', load: (today) => shopify.fetchShows(shopify.THE_REX, today) },
  { key: wix.THE_CAMERON_HOUSE.key, source: 'wix:cameron', load: (today) => wix.fetchShows(wix.THE_CAMERON_HOUSE, today) },
  { key: 'reservoir', source: 'sheet:reservoir', load: (today) => reservoir.fetchShows(today), mayBeEmpty: true },
  { key: tickera.LINSMORE_TAVERN.key, source: 'tickera:linsmore', load: (today) => tickera.fetchShows(tickera.LINSMORE_TAVERN, today) },
  { key: boomtech.FREE_TIMES_CAFE.key, source: 'boomtech:freetimes', load: (today) => boomtech.fetchShows(boomtech.FREE_TIMES_CAFE, today) },
  {
    key: artsPeople.SCARBOROUGH_VILLAGE_THEATRE.key,
    source: 'artspeople:svt',
    load: (today) => artsPeople.fetchShows(artsPeople.SCARBOROUGH_VILLAGE_THEATRE, today),
  },
  { key: tribe.WIGGLE_ROOM.key, source: 'tribe:wiggle', load: (today) => tribe.fetchShows(tribe.WIGGLE_ROOM, today) },
  // Mr Black refuses GitHub Actions. Sync it from home with: npm run data:venues -- future
  { key: mrBlack.FUTURE.key, source: 'mrblack:future', load: (today) => mrBlack.fetchShows(mrBlack.FUTURE, today), mayRefuseCloud: true },
  // Rhythm posts a few weeks at a time, so its page can briefly hold only past events.
  { key: 'rhythm', source: 'site:rhythm', load: (today) => rhythm.fetchShows(today), mayBeEmpty: true },
  {
    key: elfsight.JAPANESE_CANADIAN_CULTURAL_CENTRE.key,
    source: 'elfsight:jccc',
    load: (today) => elfsight.fetchShows(elfsight.JAPANESE_CANADIAN_CULTURAL_CENTRE, today),
  },
  {
    key: squarespace.THE_PAINTED_LADY.key,
    source: 'squarespace:paintedlady',
    load: (today) => squarespace.fetchShows(squarespace.THE_PAINTED_LADY, today),
  },
  { key: squarespace.THE_PISTON.key, source: 'squarespace:piston', load: (today) => squarespace.fetchShows(squarespace.THE_PISTON, today) },
];
/** BSMT 254: its listing, then each show's page, cached for a few days. */
const BSMT254_KEY = 'bsmt254';
const ALL_KEYS = [...[...VENUES, ...SCHEMA_VENUES, ...EVENTBRITE_VENUES, ...FEED_VENUES].map((venue) => venue.key), RCM_KEY, BSMT254_KEY];
const unknown = [...only].filter((key) => !ALL_KEYS.includes(key));
if (unknown.length > 0) {
  console.error(`Unknown venue ${unknown.join(', ')}. Choose from: ${ALL_KEYS.join(', ')}.`);
  process.exit(1);
}
const chosen = <T extends { key: string }>(list: T[]) => list.filter((venue) => only.size === 0 || only.has(venue.key));

let failed = false;
for (const venue of chosen(VENUES)) {
  const runStart = new Date();
  const store = { url, serviceKey, source: `audienceview:${venue.key}` };
  try {
    const search = createSearch(venue);
    let rows;
    let saveCache = async () => {};
    if (venue.listingArticleId) {
      // Sites that refuse searches: the listing, then each show's page, cached for a few days.
      const result = await fetchFromShowPages(venue, search, await readPageCache(store), (fetchedAt) => isFresh(fetchedAt, runStart));
      rows = result.rows;
      saveCache = () => writePageCache(store, result.fetched, runStart);
      console.log(`${venue.key}: fetched ${result.fetched.size} show pages, reused ${result.reused} from the cache.`);
    } else {
      rows = await fetchSearchRows(venue, { today: torontoDate(runStart), onWarning: (message) => console.warn(message) }, search);
    }
    const events = toShowEvents(rows, venue);
    // An empty result almost certainly means a problem. Failing keeps the existing listings.
    if (events.length === 0) throw new Error(`Found ${rows.length} rows but no shows, so nothing was saved.`);

    if (!venue.listingArticleId) {
      // Links to each show's own page. Ones found before are reused, so only new shows cost a request.
      const missing = await linkShowPages(events, venue, await storedLinks(store), search);
      if (missing > 0) console.warn(`${venue.key}: no page found for ${missing} shows, so they link to a search.`);
    }

    const { saved, pruned } = await syncEvents(events, runStart, store);
    await saveCache();
    if (!pruned) console.warn(`${venue.key}: far fewer shows than usual, so unlisted ones were kept. Check this run.`);
    const byCategory = Object.entries(Object.groupBy(events, (event) => event.category)).map(([name, list]) => `${name} ${list?.length}`);
    console.log(`${venue.key}: ${rows.length} rows, saved ${saved} shows (${byCategory.join(', ')}).`);
  } catch (error) {
    // One venue failing shouldn't stop the others.
    failed = true;
    console.error(`${venue.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const venue of chosen(SCHEMA_VENUES)) {
  const runStart = new Date();
  const store = { url, serviceKey, source: `schema:${venue.key}` };
  try {
    const result = await schema.fetchEventPages(venue, schema.createFetch(venue), await readPageCache(store), (fetchedAt) =>
      isFresh(fetchedAt, runStart),
    );
    const events = schema.toShowEvents(result.pages, venue);
    // An empty result almost certainly means a problem. Failing keeps the existing listings.
    if (events.length === 0) throw new Error(`Read ${result.pages.size} event pages but found no shows, so nothing was saved.`);

    const { saved, pruned } = await syncEvents(events, runStart, store);
    await writePageCache(store, result.fetched as unknown as Map<string, SearchRow[]>, runStart);
    if (!pruned) console.warn(`${venue.key}: far fewer shows than usual, so unlisted ones were kept. Check this run.`);
    const byCategory = Object.entries(Object.groupBy(events, (event) => event.category)).map(([name, list]) => `${name} ${list?.length}`);
    console.log(`${venue.key}: fetched ${result.fetched.size} event pages, reused ${result.reused}, saved ${saved} shows (${byCategory.join(', ')}).`);
  } catch (error) {
    failed = true;
    console.error(`${venue.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (only.size === 0 || only.has(RCM_KEY)) {
  const runStart = new Date();
  const store = { url, serviceKey, source: 'rcmusic' };
  try {
    const { events, pages } = await rcm.fetchShows(rcm.createFetch());
    if (events.length === 0) throw new Error(`Read ${pages} listing pages but found no concerts, so nothing was saved.`);
    const { saved, pruned } = await syncEvents(events, runStart, store);
    if (!pruned) console.warn(`${RCM_KEY}: far fewer shows than usual, so unlisted ones were kept. Check this run.`);
    const byVenue = Object.entries(Object.groupBy(events, (event) => event.venueId)).map(([name, list]) => `${name} ${list?.length}`);
    console.log(`${RCM_KEY}: read ${pages} listing pages, saved ${saved} shows (${byVenue.join(', ')}).`);
  } catch (error) {
    failed = true;
    console.error(`${RCM_KEY}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (only.size === 0 || only.has(BSMT254_KEY)) {
  const runStart = new Date();
  const store = { url, serviceKey, source: 'site:bsmt254' };
  try {
    const result = await bsmt254.fetchShows(torontoDate(runStart), await readPageCache(store), (fetchedAt) => isFresh(fetchedAt, runStart));
    const { saved, pruned } = await syncEvents(result.events, runStart, store);
    const pages = new Map([...result.fetched].map(([page, facts]) => [page, [facts as unknown as SearchRow]]));
    await writePageCache(store, pages, runStart);
    if (!pruned) console.warn(`${BSMT254_KEY}: far fewer shows than usual, so unlisted ones were kept. Check this run.`);
    console.log(`${BSMT254_KEY}: fetched ${result.fetched.size} show pages, reused ${result.reused}, saved ${saved} shows.`);
  } catch (error) {
    failed = true;
    console.error(`${BSMT254_KEY}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const venue of chosen(FEED_VENUES)) {
  const runStart = new Date();
  try {
    const events = await venue.load(torontoDate(runStart));
    if (events.length === 0 && venue.mayBeEmpty) {
      console.log(`${venue.key}: no upcoming shows published yet, so nothing changed.`);
      continue;
    }
    if (events.length === 0) throw new Error('The feed had no upcoming shows, so nothing was saved.');
    const { saved, pruned } = await syncEvents(events, runStart, { url, serviceKey, source: venue.source });
    if (!pruned) console.warn(`${venue.key}: far fewer shows than usual, so unlisted ones were kept. Check this run.`);
    console.log(`${venue.key}: saved ${saved} shows.`);
  } catch (error) {
    if (venue.mayRefuseCloud && error instanceof HttpStatusError && error.status === 403) {
      // Its existing listings are kept. A sync from a home connection refreshes them.
      console.warn(`${venue.key}: refused (403), as it does from GitHub's servers, so nothing changed. Sync it locally: npm run data:venues -- ${venue.key}`);
      continue;
    }
    failed = true;
    console.error(`${venue.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const eventbriteToken = process.env.EVENTBRITE_TOKEN;
for (const venue of chosen(EVENTBRITE_VENUES)) {
  if (!eventbriteToken) {
    // Not an error, so the daily job keeps running until a token is added.
    console.warn(`${venue.key}: skipped, because EVENTBRITE_TOKEN isn't set.`);
    continue;
  }
  const runStart = new Date();
  const store = { url, serviceKey, source: `eventbrite:${venue.key}` };
  try {
    const apiEvents = await eventbrite.fetchVenueEvents(venue, eventbriteToken);
    const events = eventbrite.toShowEvents(apiEvents, venue);
    if (events.length === 0) throw new Error(`Eventbrite returned ${apiEvents.length} events but none could be shown, so nothing was saved.`);
    const { saved, pruned } = await syncEvents(events, runStart, store);
    if (!pruned) console.warn(`${venue.key}: far fewer shows than usual, so unlisted ones were kept. Check this run.`);
    console.log(`${venue.key}: saved ${saved} shows from Eventbrite.`);
  } catch (error) {
    failed = true;
    console.error(`${venue.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exit(1);
