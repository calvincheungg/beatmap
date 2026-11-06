import { parseCsv } from './csv';
import raw from './toronto_music_venues.csv?raw';

export interface Venue {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string;
  /** The id of the venue's neighbourhood. */
  neighbourhood: string;
  neighbourhoodName: string;
  /** Null when unknown. */
  capacity: number | null;
  sizeTier: string;
  indoorOutdoor: string;
  /** `listed` when confirmed. Anything else means some details still need checking. */
  status: string;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Reads venues from CSV text. Rows without coordinates or a neighbourhood can't go on the map, so they're skipped. */
export function parseVenues(text: string): Venue[] {
  return parseCsv(text).flatMap((row): Venue[] => {
    const lat = Number.parseFloat(row.lat ?? '');
    const lon = Number.parseFloat(row.lon ?? '');
    const neighbourhoodName = (row.neighbourhood ?? '').trim();
    const name = (row.name ?? '').trim();
    if (!name || !neighbourhoodName || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];

    const capacity = Number.parseInt(row.approx_capacity ?? '', 10);
    return [
      {
        id: slugify(name),
        name,
        lat,
        lon,
        address: (row.address ?? '').trim(),
        neighbourhood: slugify(neighbourhoodName),
        neighbourhoodName,
        capacity: Number.isFinite(capacity) ? capacity : null,
        sizeTier: (row.size_tier ?? '').trim(),
        indoorOutdoor: (row.indoor_outdoor ?? '').trim(),
        status: (row.status ?? '').trim(),
      },
    ];
  });
}

/** Edit src/data/toronto_music_venues.csv to change these. See the README. */
export const venues: Venue[] = parseVenues(raw);

export function venuesIn(neighbourhoodId: string): Venue[] {
  return venues.filter((venue) => venue.neighbourhood === neighbourhoodId);
}
