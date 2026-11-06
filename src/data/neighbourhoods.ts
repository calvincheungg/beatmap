import data from './neighbourhoods.json';

export interface Neighbourhood {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** How much of the map to show on arrival, in metres top to bottom. */
  viewHeight: number;
}

export const neighbourhoods: Neighbourhood[] = data;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^the\s+/, '')
    .trim();
}

/** Matches on any part of the name, best first: names starting with the query, then the rest. */
export function searchNeighbourhoods(query: string, from: Neighbourhood[] = neighbourhoods): Neighbourhood[] {
  const wanted = normalize(query);
  if (!wanted) return from;
  const matches = from.filter((area) => normalize(area.name).includes(wanted));
  const startsWith = (area: Neighbourhood) => (normalize(area.name).startsWith(wanted) ? 0 : 1);
  return [...matches].sort((a, b) => startsWith(a) - startsWith(b));
}

export function findNeighbourhood(id: string | null): Neighbourhood | undefined {
  return neighbourhoods.find((area) => area.id === id);
}
