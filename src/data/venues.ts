import data from './venues.json';

export interface Venue {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** The id of a neighbourhood in neighbourhoods.json. */
  neighbourhood: string;
}

/** Mock data with approximate coordinates. */
export const venues: Venue[] = data;

export function venuesIn(neighbourhoodId: string): Venue[] {
  return venues.filter((venue) => venue.neighbourhood === neighbourhoodId);
}
