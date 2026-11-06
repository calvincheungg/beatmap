import { describe, expect, it } from 'vitest';
import { MAP_BOUNDS } from '../src/config';
import { neighbourhoods, searchNeighbourhoods } from '../src/data/neighbourhoods';
import { venues, venuesIn } from '../src/data/venues';

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
      { id: 'a', name: 'West Market', lat: 0, lon: 0, viewHeight: 1 },
      { id: 'b', name: 'Market Square', lat: 0, lon: 0, viewHeight: 1 },
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
    expect(venuesIn('queen-west').length).toBeGreaterThan(0);
    expect(venuesIn('atlantis')).toEqual([]);
  });
});
