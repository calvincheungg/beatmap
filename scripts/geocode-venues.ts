// Fills in lat and lon for rows in the venue CSV that don't have them, using OpenStreetMap's
// Nominatim service. Existing coordinates are never changed. Run: npm run data:geocode
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from '../src/data/csv.ts';

const FILE = 'src/data/toronto_music_venues.csv';
const BOUNDS = { west: -79.9, south: 43.47, east: -78.97, north: 44 };
// Nominatim allows at most one request per second.
const DELAY_MS = 1100;

async function lookup(query: string): Promise<{ lat: string; lon: string } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'ca',
    viewbox: `${BOUNDS.west},${BOUNDS.north},${BOUNDS.east},${BOUNDS.south}`,
    bounded: '1',
  }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': 'beatmap-venue-geocoder (https://github.com/calvincheungg/beatmap)' },
  });
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
  const [match] = (await response.json()) as { lat: string; lon: string }[];
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  return match ? { lat: Number(match.lat).toFixed(6), lon: Number(match.lon).toFixed(6) } : null;
}

const text = readFileSync(FILE, 'utf8');
const rows = parseCsv(text);
const columns = Object.keys(rows[0] ?? {});
for (const column of ['lat', 'lon']) if (!columns.includes(column)) columns.push(column);

const missed: string[] = [];
let found = 0;
for (const row of rows) {
  if (row.lat && row.lon) continue;
  const name = row.name ?? '';
  // Without an address, a name alone can match an unrelated place, so leave the row for a person.
  if (!row.address) {
    missed.push(name);
    continue;
  }
  // The address is the most precise. The name is the fallback for vague addresses.
  const match = (await lookup(row.address)) ?? (await lookup(`${name}, Toronto`));
  if (match) {
    row.lat = match.lat;
    row.lon = match.lon;
    found++;
  } else {
    missed.push(name);
  }
}

writeFileSync(FILE, toCsv(rows, columns));
console.log(`Found ${found}. Not found: ${missed.length ? missed.join(', ') : 'none'}`);
