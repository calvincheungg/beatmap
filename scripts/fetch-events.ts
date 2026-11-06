// Fetches upcoming music events from Ticketmaster for the venues in our CSV, writes them to
// public/data/events.json, and reports coverage. Needs TICKETMASTER_API_KEY in .env.
// Run: npm run data:events
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchMusicEvents, toShowEvents } from '../src/data/ticketmaster.ts';
import { parseVenues } from '../src/data/venueParser.ts';

const OUTPUT = 'public/data/events.json';
// The middle of the map, with a radius that covers Mississauga, Brampton, Vaughan, Markham and Pickering.
const SEARCH = { lat: 43.735, lon: -79.435, radiusKm: 60 };

const apiKey = process.env.TICKETMASTER_API_KEY;
if (!apiKey) {
  console.error('TICKETMASTER_API_KEY is missing. Add it to .env (see .env.example).');
  process.exit(1);
}

const venues = parseVenues(readFileSync('src/data/toronto_music_venues.csv', 'utf8'));
const now = new Date();
const apiEvents = await fetchMusicEvents({ ...SEARCH, apiKey, now, onWarning: (message) => console.warn(message) });
const { events, matchedCounts, unmatchedVenues, matchedNames } = toShowEvents(apiEvents, venues);

mkdirSync('public/data', { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify({ source: 'ticketmaster', fetchedAt: now.toISOString(), events }, null, 2)}\n`);

const byCount = <K>(counts: Map<K, number>) => [...counts].sort((a, b) => b[1] - a[1]);
console.log(`Fetched ${apiEvents.length} music events. Kept ${events.length} at our venues, written to ${OUTPUT}.`);
console.log(`\nCovered: ${matchedCounts.size} of ${venues.length} venues`);
for (const [id, count] of byCount(matchedCounts)) {
  console.log(`  ${String(count).padStart(4)}  ${id}  (as: ${[...(matchedNames.get(id) ?? [])].join(' | ')})`);
}
console.log('\nNo events found:');
console.log(`  ${venues.filter((venue) => !matchedCounts.has(venue.id)).map((venue) => venue.name).join(', ')}`);
console.log('\nBusiest venues not in our CSV (check for missed matches):');
for (const [name, count] of byCount(unmatchedVenues).slice(0, 15)) console.log(`  ${String(count).padStart(4)}  ${name}`);
