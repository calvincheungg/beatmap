import { describe, expect, it } from 'vitest';
import { MAP_BOUNDS } from '../src/config';
import { parseCsv, toCsv } from '../src/data/csv';
import { neighbourhoods, searchNeighbourhoods, withVenueNeighbourhoods } from '../src/data/neighbourhoods';
import { parseVenues, safeWebsite, venues, venuesIn } from '../src/data/venues';

const inBounds = ({ lat, lon }: { lat: number; lon: number }) =>
  lat >= MAP_BOUNDS.south && lat <= MAP_BOUNDS.north && lon >= MAP_BOUNDS.west && lon <= MAP_BOUNDS.east;

describe('searchNeighbourhoods', () => {
  it('returns everything for an empty query', () => {
    expect(searchNeighbourhoods('  ')).toHaveLength(neighbourhoods.length);
  });

  it('ignores case and a leading "the"', () => {
    expect(searchNeighbourhoods('KENSINGTON')[0]?.id).toBe('kensington-market');
    expect(searchNeighbourhoods('the junction')[0]?.id).toBe('the-junction');
    expect(searchNeighbourhoods('junction')[0]?.id).toBe('the-junction');
  });

  it('ranks names starting with the query first', () => {
    const areas = [
      { id: 'a', name: 'West Market', lat: 0, lon: 0, zoom: 1 },
      { id: 'b', name: 'Market Square', lat: 0, lon: 0, zoom: 1 },
    ];
    expect(searchNeighbourhoods('market', areas).map((area) => area.id)).toEqual(['b', 'a']);
  });

  it('returns nothing without a match', () => {
    expect(searchNeighbourhoods('atlantis')).toEqual([]);
  });
});

describe('map data', () => {
  it('includes the required neighbourhoods and cities', () => {
    const names = neighbourhoods.map((area) => area.name);
    for (const name of ['Downtown', 'Kensington Market', 'Queen West', 'The Junction', 'Danforth', 'North York', 'Mississauga', 'Brampton', 'Vaughan', 'Markham', 'Pickering']) {
      expect(names).toContain(name);
    }
  });

  it('keeps every place inside the map', () => {
    for (const place of [...neighbourhoods, ...venues]) expect(inBounds(place), place.id).toBe(true);
  });

  it('has unique ids and venues that point at real neighbourhoods', () => {
    const ids = neighbourhoods.map((area) => area.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(venues.map((venue) => venue.id)).size).toBe(venues.length);
    for (const venue of venues) expect(ids).toContain(venue.neighbourhood);
  });

  it('finds venues by neighbourhood', () => {
    expect(venuesIn('downtown').length).toBeGreaterThan(0);
    expect(venuesIn('atlantis')).toEqual([]);
  });
});

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes and a byte order mark', () => {
    expect(parseCsv('﻿name,address\nA,"1 Main St, Toronto"\n"B ""Big""",x\n')).toEqual([
      { name: 'A', address: '1 Main St, Toronto' },
      { name: 'B "Big"', address: 'x' },
    ]);
  });

  it('ignores blank rows', () => {
    expect(parseCsv('a,b\n1,2\n,\n\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('round-trips through toCsv', () => {
    const rows = [{ name: 'A, B', note: 'say "hi"' }];
    expect(parseCsv(toCsv(rows, ['name', 'note']))).toEqual(rows);
  });
});

describe('safeWebsite', () => {
  it('accepts web addresses', () => {
    expect(safeWebsite(' https://www.masseyhall.com/ ')).toBe('https://www.masseyhall.com/');
    expect(safeWebsite('http://www.bovinesexclub.com/')).toBe('http://www.bovinesexclub.com/');
  });

  it('rejects anything else, including script links', () => {
    expect(safeWebsite('')).toBeNull();
    expect(safeWebsite(undefined)).toBeNull();
    expect(safeWebsite('www.masseyhall.com')).toBeNull();
    expect(safeWebsite('javascript:alert(1)')).toBeNull();
  });
});

describe('parseVenues', () => {
  const header = 'name,address,neighbourhood,approx_capacity,size_tier,indoor_outdoor,status,source_note,lat,lon\n';

  it('reads a complete row', () => {
    const [venue] = parseVenues(`${header}Massey Hall,"178 Victoria St",The Annex,600,small,indoor,listed,x,43.66,-79.41\n`);
    expect(venue).toMatchObject({
      id: 'massey-hall',
      neighbourhood: 'the-annex',
      neighbourhoodName: 'The Annex',
      capacity: 600,
      lat: 43.66,
    });
  });

  it('allows an unknown capacity', () => {
    expect(parseVenues(`${header}A,x,Downtown,,small,indoor,verify,x,43.6,-79.4\n`)[0]?.capacity).toBeNull();
  });

  it('skips rows missing coordinates or a neighbourhood', () => {
    expect(parseVenues(`${header}A,x,Downtown,,small,indoor,verify,x,,\nB,x,,,small,indoor,verify,x,43.6,-79.4\n`)).toEqual([]);
  });
});

describe('withVenueNeighbourhoods', () => {
  const base = { id: 'downtown', name: 'Downtown', lat: 43.65, lon: -79.38, zoom: 14 };
  const venue = (name: string, area: string, lat: number) =>
    parseVenues(`name,neighbourhood,lat,lon\n${name},${area},${lat},-79.4\n`)[0]!;

  it('adds missing neighbourhoods at the centre of their venues', () => {
    const areas = withVenueNeighbourhoods(
      [base],
      [venue('A', 'Parkdale', 43.6), venue('B', 'Parkdale', 43.7), venue('C', 'Downtown', 43.65)],
    );
    expect(areas.map((area) => area.id)).toEqual(['downtown', 'parkdale']);
    expect(areas[1]?.name).toBe('Parkdale');
    expect(areas[1]?.lat).toBeCloseTo(43.65);
  });
});

describe('the real venue list', () => {
  it('has the CSV venues, including the original mock ones', () => {
    expect(venues.length).toBeGreaterThan(50);
    for (const id of ['the-rex-hotel-jazz-blues-bar', 'junction-city-music-hall']) {
      expect(venues.map((venue) => venue.id)).toContain(id);
    }
  });

  it('only has valid website values in the CSV', () => {
    expect(venues.filter((venue) => venue.website).length).toBeGreaterThan(40);
    expect(venues.some((venue) => venue.id === 'massey-hall' && venue.website)).toBe(true);
  });

  it('has no duplicate venues', () => {
    expect(new Set(venues.map((venue) => venue.id)).size).toBe(venues.length);
  });

  it('gives every venue a neighbourhood that opens in the panel', () => {
    const ids = new Set(neighbourhoods.map((area) => area.id));
    for (const venue of venues) expect(ids.has(venue.neighbourhood), venue.name).toBe(true);
  });
});
