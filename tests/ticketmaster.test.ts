import { describe, expect, it } from 'vitest';
import {
  cleanGenre,
  readAge,
  readPrice,
  encodeGeohash,
  fetchMusicEvents,
  matchVenue,
  normalizeVenueName,
  pickImage,
  toShowEvents,
  type ApiEvent,
  type ApiImage,
} from '../src/data/ticketmaster';

const venues = [
  { id: 'horseshoe', name: 'Horseshoe Tavern', lat: 43.649, lon: -79.3959 },
  { id: 'rbc', name: 'RBC Amphitheatre (Budweiser Stage)', lat: 43.6288, lon: -79.4148 },
  { id: 'elgin', name: 'Elgin Theatre', lat: 43.6531, lon: -79.3788 },
  { id: 'winter', name: 'Winter Garden Theatre', lat: 43.6531, lon: -79.3788 },
];
const at = (latitude: number, longitude: number) => ({ latitude: String(latitude), longitude: String(longitude) });

describe('encodeGeohash', () => {
  it('matches a known geohash', () => {
    // A widely published test value: 57.64911, 10.40744 encodes to u4pruydqqvj.
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });
});

describe('normalizeVenueName', () => {
  it('ignores case, punctuation and common filler words', () => {
    expect(normalizeVenueName('The Horseshoe Tavern - Toronto, ON')).toBe('horseshoe tavern');
    expect(normalizeVenueName('Rock & Roll')).toBe('rock and roll');
  });
});

describe('matchVenue', () => {
  it('matches a name near our location', () => {
    expect(matchVenue({ name: 'The Horseshoe Tavern', location: at(43.6491, -79.396) }, venues)?.id).toBe('horseshoe');
  });

  it('matches either part of a venue with two names', () => {
    expect(matchVenue({ name: 'Budweiser Stage', location: at(43.6288, -79.4148) }, venues)?.id).toBe('rbc');
  });

  it('rejects the same name somewhere else', () => {
    expect(matchVenue({ name: 'Horseshoe Tavern', location: at(44.5, -80.5) }, venues)).toBeNull();
  });

  it('trusts an exact multi-word name when the pin is kilometres off, but not a partial or far one', () => {
    // Ticketmaster pins the Japanese Canadian Cultural Centre near Yonge and Steeles, 9.7 km away.
    const jccc = [...venues, { id: 'jccc', name: 'Japanese Canadian Cultural Centre', lat: 43.726424, lon: -79.335052 }];
    expect(matchVenue({ name: 'Japanese Canadian Cultural Centre', location: at(43.79278, -79.41319) }, jccc)?.id).toBe('jccc');
    expect(matchVenue({ name: 'Japanese Canadian Cultural Centre Annex', location: at(43.79278, -79.41319) }, jccc)).toBeNull();
    expect(matchVenue({ name: 'Elgin Theatre', location: at(43.2557, -79.8711) }, venues)).toBeNull();
  });

  it('matches by location alone when one venue is right there', () => {
    expect(matchVenue({ name: 'Horseshoe Toronto Live', location: at(43.649, -79.3959) }, venues)?.id).toBe('horseshoe');
    expect(matchVenue({ name: 'Different Name', location: at(43.6491, -79.3958) }, venues)?.id).toBe('horseshoe');
  });

  it('uses the name to separate venues at one address, and refuses to guess', () => {
    expect(matchVenue({ name: 'Winter Garden Theatre', location: at(43.6531, -79.3788) }, venues)?.id).toBe('winter');
    expect(matchVenue({ name: 'Yonge Street Stage', location: at(43.6531, -79.3788) }, venues)).toBeNull();
  });

  it('accepts a name when the API gives no location', () => {
    expect(matchVenue({ name: 'Elgin Theatre' }, venues)?.id).toBe('elgin');
    expect(matchVenue({ name: 'Unknown Hall' }, venues)).toBeNull();
  });
});

describe('toShowEvents', () => {
  const event = (id: string, overrides: Partial<ApiEvent> = {}): ApiEvent => ({
    id,
    name: `Show ${id}`,
    url: `https://www.ticketmaster.ca/event/${id}`,
    dates: { start: { localDate: '2026-12-01', localTime: '20:00:00' }, status: { code: 'onsale' } },
    classifications: [{ primary: true, genre: { name: 'Rock' }, subGenre: { name: 'Hardcore Punk' } }],
    priceRanges: [{ currency: 'CAD', min: 24.92, max: 24.92 }],
    info: 'LEGAL AGE 19+ Doors 8pm',
    _embedded: {
      venues: [{ name: 'Horseshoe Tavern', location: at(43.649, -79.3959) }],
      attractions: [{ name: 'Headliner' }, { name: ' Support Act ' }, { name: 'Headliner' }, {}],
    },
    ...overrides,
  });

  it('keeps our venues and counts the others', () => {
    const report = toShowEvents(
      [event('a'), event('b', { _embedded: { venues: [{ name: 'Far Away Arena', location: at(44.5, -80.5) }] } })],
      venues,
    );
    expect(report.events).toEqual([
      {
        id: 'a',
        name: 'Show a',
        date: '2026-12-01',
        time: '20:00:00',
        status: 'onsale',
        url: 'https://www.ticketmaster.ca/event/a',
        venueId: 'horseshoe',
        genre: 'Rock',
        subGenre: 'Hardcore Punk',
        category: 'Music',
        artists: ['Headliner', 'Support Act'],
        priceMin: 24.92,
        priceMax: 24.92,
        currency: 'CAD',
        ageLabel: '19+',
        imageUrl: null,
        firstSeenAt: null,
      },
    ]);
    expect(report.matchedCounts.get('horseshoe')).toBe(1);
    expect(report.unmatchedVenues.get('Far Away Arena')).toBe(1);
  });

  it('keeps cancelled events under one spelling', () => {
    const report = toShowEvents(
      [
        event('canceled', { dates: { start: { localDate: '2026-12-01' }, status: { code: 'canceled' } } }),
        event('cancelled', { dates: { start: { localDate: '2026-12-01' }, status: { code: 'cancelled' } } }),
      ],
      venues,
    );
    expect(report.events.map((show) => show.status)).toEqual(['cancelled', 'cancelled']);
  });

  it('picks a picture for each show', () => {
    const images = [{ url: 'https://s1.ticketm.net/a_3_2.jpg', ratio: '3_2', width: 305 }];
    expect(toShowEvents([event('pic', { images })], venues).events[0]?.imageUrl).toBe('https://s1.ticketm.net/a_3_2.jpg');
  });

  it('drops incomplete records, unsafe links and add-ons sold as listings, but keeps postponed ones', () => {
    const report = toShowEvents(
      [
        event('chairs', { name: 'Lawn Chair Rental - Riley Green: Not A Show' }),
        event('upgrade', { name: 'Syd - Early Entry VIP Upgrade' }),
        event('nodate', { dates: { status: { code: 'onsale' } } }),
        event('badlink', { url: 'javascript:alert(1)' }),
        event('moved', { dates: { start: { localDate: '2026-12-02' }, status: { code: 'postponed' } } }),
      ],
      venues,
    );
    expect(report.events.map((show) => show.id)).toEqual(['moved']);
    expect(report.events[0]?.time).toBeNull();
  });

  it('uses the primary genre and removes placeholders and repeats', () => {
    const report = toShowEvents(
      [
        event('primary', {
          classifications: [
            { primary: false, genre: { name: 'Jazz' } },
            { primary: true, genre: { name: 'Pop' }, subGenre: { name: 'K-Pop' } },
          ],
        }),
        event('vague', { classifications: [{ primary: true, genre: { name: 'Other' }, subGenre: { name: 'undefined' } }] }),
        event('repeat', { classifications: [{ genre: { name: 'Jazz' }, subGenre: { name: 'Jazz' } }] }),
        event('none', { classifications: [] }),
        event('amapiano', { classifications: [{ primary: true, genre: { name: 'Dance/Electronic' }, subGenre: { name: 'Amapiano' } }] }),
        event('urban', { classifications: [{ primary: true, genre: { name: 'Hip-Hop/Rap' }, subGenre: { name: 'Urban' } }] }),
      ],
      venues,
    );
    const genres = Object.fromEntries(report.events.map((show) => [show.id, [show.genre, show.subGenre]]));
    expect(genres).toEqual({ primary: ['Pop', 'K-Pop'], vague: [null, null], repeat: ['Jazz', null], none: [null, null], amapiano: ['Dance/Electronic', null], urban: ['Hip-Hop/Rap', null] });
  });

  it('allows shows with no artists listed', () => {
    const show = event('solo', { _embedded: { venues: [{ name: 'Horseshoe Tavern', location: at(43.649, -79.3959) }] } });
    expect(toShowEvents([show], venues).events[0]?.artists).toEqual([]);
  });

  it('sorts by date and time', () => {
    const later = event('later', { dates: { start: { localDate: '2026-12-09', localTime: '19:00:00' } } });
    const late = event('late', { dates: { start: { localDate: '2026-12-01', localTime: '22:00:00' } } });
    const early = event('early', { dates: { start: { localDate: '2026-12-01', localTime: '19:00:00' } } });
    expect(toShowEvents([later, late, early], venues).events.map((show) => show.id)).toEqual(['early', 'late', 'later']);
  });
});

describe('pickImage', () => {
  const image = (ratio: string, width: number, extra: Partial<ApiImage> = {}): ApiImage => ({
    url: `https://s1.ticketm.net/${ratio}_${width}.jpg`,
    ratio,
    width,
    ...extra,
  });

  it('prefers 3:2, then the smallest image that is wide enough', () => {
    expect(pickImage([image('16_9', 640), image('3_2', 1024), image('3_2', 305), image('3_2', 200)])).toBe('https://s1.ticketm.net/3_2_305.jpg');
    expect(pickImage([image('4_3', 305), image('16_9', 2048), image('16_9', 640), image('16_9', 205)])).toBe('https://s1.ticketm.net/16_9_640.jpg');
  });

  it('skips placeholders, insecure links and missing images', () => {
    expect(pickImage([image('3_2', 305, { fallback: true })])).toBeNull();
    expect(pickImage([image('3_2', 305, { url: 'http://s1.ticketm.net/a.jpg' })])).toBeNull();
    expect(pickImage([image('3_2', 305, { url: undefined })])).toBeNull();
    expect(pickImage([image('1_1', 640)])).toBeNull();
    expect(pickImage(undefined)).toBeNull();
  });
});

describe('cleanGenre', () => {
  it('removes placeholders and merges aliases', () => {
    expect(cleanGenre('Undefined')).toBeNull();
    expect(cleanGenre('Music')).toBeNull();
    expect(cleanGenre(undefined)).toBeNull();
    expect(cleanGenre('Dance')).toBe('Dance/Electronic');
    expect(cleanGenre(' Rock ')).toBe('Rock');
  });
});

describe('readPrice', () => {
  const none = { priceMin: null, priceMax: null, currency: null };

  it('reads one price or a range', () => {
    expect(readPrice({ priceRanges: [{ currency: 'CAD', min: 25, max: 25 }] })).toEqual({ priceMin: 25, priceMax: 25, currency: 'CAD' });
    expect(readPrice({ priceRanges: [{ currency: 'CAD', min: 25, max: 90 }] })).toEqual({ priceMin: 25, priceMax: 90, currency: 'CAD' });
  });

  it('treats a price of 0 as unknown, not free', () => {
    expect(readPrice({ priceRanges: [{ currency: 'CAD', min: 0, max: 0 }] })).toEqual(none);
  });

  it('handles missing prices and a missing or lower maximum', () => {
    expect(readPrice({})).toEqual(none);
    expect(readPrice({ priceRanges: [] })).toEqual(none);
    expect(readPrice({ priceRanges: [{ min: 30 }] })).toEqual({ priceMin: 30, priceMax: 30, currency: null });
    expect(readPrice({ priceRanges: [{ min: 30, max: 10 }] }).priceMax).toBe(30);
  });
});

describe('readAge', () => {
  it('reads all ages and minimum ages from the listing text', () => {
    expect(readAge({ info: 'This is an ALL AGES event. Doors: 7pm' })).toBe('All ages');
    expect(readAge({ pleaseNote: 'This event is 19 and over.' })).toBe('19+');
    expect(readAge({ info: 'LEGAL AGE 19+ (Valid Photo I.D. Required)' })).toBe('19+');
    expect(readAge({ ticketTextLines: { 'en-us': { line5: '  ALL AGES / R837398916  ' } } })).toBe('All ages');
    expect(readAge({ info: 'Patrons must be 18 years of age or older' })).toBe('18+');
  });

  it('treats a show with an all-ages floor as all ages, even with 19+ areas', () => {
    expect(readAge({ info: 'GA Floor is ALL AGES. GA Balcony is LEGAL AGE 19+.' })).toBe('All ages');
  });

  it('falls back to the enforced legal age, and otherwise gives nothing', () => {
    expect(readAge({ ageRestrictions: { legalAgeEnforced: true } })).toBe('19+');
    expect(readAge({ ageRestrictions: { legalAgeEnforced: false } })).toBeNull();
    expect(readAge({})).toBeNull();
  });

  it('ignores prices and years that look like ages', () => {
    expect(readAge({ info: 'Tickets $19+ fees. Since 2019+' })).toBeNull();
  });
});

describe('fetchMusicEvents', () => {
  const base = {
    apiKey: 'SECRET',
    lat: 43.735,
    lon: -79.435,
    radiusKm: 60,
    now: new Date('2026-11-06T12:00:00Z'),
    wait: () => Promise.resolve(),
  };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('requests music near the point, follows pages and removes duplicates', async () => {
    const urls: URL[] = [];
    const fetcher = (async (input: string) => {
      const url = new URL(input);
      urls.push(url);
      const page = Number(url.searchParams.get('page'));
      const start = url.searchParams.get('startDateTime');
      if (start === '2026-11-06T12:00:00Z' && page < 2) {
        return reply({ _embedded: { events: [{ id: page === 0 ? 'a' : 'b' }, { id: 'a' }] }, page: { totalElements: 400, totalPages: 2 } });
      }
      return reply({ page: { totalElements: 0, totalPages: 0 } });
    }) as typeof fetch;

    const events = await fetchMusicEvents({ ...base, fetcher });
    expect(events.map((event) => event.id)).toEqual(['a', 'b']);
    // Two pages for the first month, then one for each of the other 12 months.
    expect(urls).toHaveLength(14);
    const first = urls[0]!.searchParams;
    expect(first.get('classificationName')).toBe('music');
    expect(first.get('geoPoint')).toBe(encodeGeohash(43.735, -79.435));
    expect(first.get('unit')).toBe('km');
    expect(urls[1]!.searchParams.get('page')).toBe('1');
    expect(urls[2]!.searchParams.get('startDateTime')).toBe('2026-12-06T12:00:00Z');
    // The last window starts 12 windows of 30 days later, so next summer's shows are included.
    expect(urls.at(-1)!.searchParams.get('startDateTime')).toBe('2027-11-01T12:00:00Z');
  });

  it('stops at the deep paging limit and warns', async () => {
    const pages: string[] = [];
    const warnings: string[] = [];
    const fetcher = (async (input: string) => {
      const url = new URL(input);
      pages.push(url.searchParams.get('page')!);
      return reply({ _embedded: { events: [] }, page: { totalElements: 5000, totalPages: 25 } });
    }) as typeof fetch;

    await fetchMusicEvents({ ...base, fetcher, onWarning: (message) => warnings.push(message) });
    expect(pages.slice(0, 5)).toEqual(['0', '1', '2', '3', '4']);
    expect(pages[5]).toBe('0');
    expect(warnings).toHaveLength(13);
  });

  it('never puts the key in an error message', async () => {
    const fetcher = (async () => reply({}, 401)) as unknown as typeof fetch;
    const error = await fetchMusicEvents({ ...base, fetcher }).catch((caught: unknown) => caught as Error);
    expect(String(error)).toContain('401');
    expect(String(error)).not.toContain('SECRET');
  });
});
