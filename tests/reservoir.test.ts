import { describe, expect, it } from 'vitest';
import { createFetch, fetchShows, isAllowedUrl, LINEUP_SHEET, parseCsvRows, readLineup } from '../src/data/reservoir';

const sheet = `Theme,Swing Era,,,
Week of,2026-11-03,,,
,,,,
Day,Artist,Genre,Time,Image
Tuesday,Janice Hagan,"Smoky vocals, timeless jazz, and the sounds of the swing era.",9:00 pm,assets/web/janice-hagan.jpg
Wednesday,,,,
Saturday,Danny B ,"Old-school blues, soulful vocals & harmonica.",9:30 pm,assets/web/danny-b.jpg
Sunday,Xavier Solis ,"Pop, Funk, Soul, and Romantic Ballads.",8:30 pm,assets/web/x.jpg`;

describe('parseCsvRows', () => {
  it('keeps quoted commas and doubled quotes inside a cell', () => {
    expect(parseCsvRows('a,"b, c","say ""hi"""\r\nd,e,f')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['d', 'e', 'f'],
    ]);
  });
});

describe('readLineup', () => {
  it("dates each night from the week's Tuesday, with the first set's time and a genre from the description", () => {
    expect(readLineup(sheet, '2026-11-03').map((show) => [show.date, show.time, show.name, show.genre])).toEqual([
      ['2026-11-03', '21:00:00', 'Janice Hagan', 'Jazz'],
      ['2026-11-07', '21:30:00', 'Danny B', 'Blues'],
      ['2026-11-08', '20:30:00', 'Xavier Solis', null],
    ]);
  });

  it('keeps only nights from today on, never stores the description, and gives nothing without a week', () => {
    const shows = readLineup(sheet, '2026-11-07');
    expect(shows.map((show) => show.name)).toEqual(['Danny B', 'Xavier Solis']);
    expect(shows[0]).toMatchObject({ url: 'https://www.reservoirlounge.com/#music', venueId: 'reservoir-lounge', category: 'Music', priceMin: null });
    expect(JSON.stringify(shows)).not.toContain('harmonica');
    expect(readLineup(sheet, '2026-11-09')).toEqual([]);
    expect(readLineup('Day,Artist\nTuesday,Someone', '2026-11-03')).toEqual([]);
  });
});

describe('fetchShows', () => {
  it('reads only the published sheet, and stops if its layout changes', async () => {
    expect(isAllowedUrl(LINEUP_SHEET)).toBe(true);
    expect(isAllowedUrl('https://docs.google.com/spreadsheets/d/other/pub?output=csv')).toBe(false);
    const fetcher = (async () => new Response('<html>Sign in</html>')) as unknown as typeof fetch;
    await expect(fetchShows('2026-11-07', createFetch({ fetcher }))).rejects.toThrow('no week');
  });
});
