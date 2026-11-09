// Fetches upcoming music and comedy events from Ticketmaster for the venues in our CSV, saves them to
// Supabase, and reports coverage. Needs TICKETMASTER_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_KEY.
// Run: npm run data:events
import { readFileSync } from 'node:fs';
import { syncEvents } from '../src/data/eventStore.ts';
import { fetchMusicEvents, toShowEvents } from '../src/data/ticketmaster.ts';
import { parseVenues } from '../src/data/venueParser.ts';

// The middle of the map, with a radius that covers Mississauga, Brampton, Vaughan, Markham and Pickering.
const SEARCH = { lat: 43.735, lon: -79.435, radiusKm: 60 };
const DAY_MS = 24 * 60 * 60 * 1000;

const { TICKETMASTER_API_KEY: apiKey, SUPABASE_URL: url, SUPABASE_SERVICE_KEY: serviceKey } = process.env;
if (!apiKey || !url || !serviceKey) {
  console.error('Missing TICKETMASTER_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_KEY (see .env.example).');
  process.exit(1);
}

const venues = parseVenues(readFileSync('src/data/toronto_music_venues.csv', 'utf8'));
const runStart = new Date();
// Starting a day back means shows earlier today are still seen, so they aren't mistaken for removed ones.
const apiEvents = await fetchMusicEvents({
  ...SEARCH,
  apiKey,
  now: new Date(runStart.getTime() - DAY_MS),
  onWarning: (message) => console.warn(message),
});
const { events, matchedCounts, unmatchedVenues, matchedNames } = toShowEvents(apiEvents, venues);

// An empty result almost certainly means a problem upstream. Failing keeps the existing listings.
if (events.length === 0) {
  console.error(`Fetched ${apiEvents.length} events but none matched our venues, so nothing was saved.`);
  process.exit(1);
}

const { saved, pruned } = await syncEvents(events, runStart, { url, serviceKey });
if (!pruned) console.warn('Far fewer events than usual, so unlisted events were kept. Check this run.');

const byCount = <K>(counts: Map<K, number>) => [...counts].sort((a, b) => b[1] - a[1]);
console.log(`Fetched ${apiEvents.length} music and comedy events. Saved ${saved} at our venues to Supabase.`);
console.log(`\nCovered: ${matchedCounts.size} of ${venues.length} venues`);
for (const [id, count] of byCount(matchedCounts)) {
  console.log(`  ${String(count).padStart(4)}  ${id}  (as: ${[...(matchedNames.get(id) ?? [])].join(' | ')})`);
}
console.log('\nNo events found:');
console.log(`  ${venues.filter((venue) => !matchedCounts.has(venue.id)).map((venue) => venue.name).join(', ')}`);
console.log('\nBusiest venues not in our CSV (check for missed matches):');
for (const [name, count] of byCount(unmatchedVenues).slice(0, 15)) console.log(`  ${String(count).padStart(4)}  ${name}`);
