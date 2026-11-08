/** Shared helpers for adapters that read a venue's event feed: building shows and reading small facts. */
import { classifyShow, type Category } from './categories.ts';
import type { ShowEvent } from './ticketmaster.ts';

/** What a venue's shows are when the title rules can't tell, like Jazz for a jazz club. */
export interface VenueDefaults {
  category: Category;
  genre?: string;
}

export interface ShowFacts {
  id: string;
  name: string;
  date: string;
  time: string | null;
  status?: string;
  url: string;
  venueId: string;
  priceMin?: number | null;
  priceMax?: number | null;
  ageLabel?: string | null;
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/** Decodes HTML entities like &#8217; and &amp;, and tidies spaces. */
export function decodeText(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prices of drinks and food, like "$5 glasses of wine", which aren't what a show costs. */
const MENU_PRICE = /^\s*(glass(es)?|wines?|beers?|pints?|cocktails?|drinks?|shots?|cans?|bottles?|tall ?boys?|nachos|food|wings|pizzas?|tacos?|apps?)\b/i;

/** Every dollar amount in a piece of text, like "$10 @ Door" or "$25.00 - $40.00". Zero and drink prices are left out. */
export function dollarAmounts(text: string): number[] {
  return [...text.matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)]
    .filter((match) => !MENU_PRICE.test(text.slice(match.index + match[0].length)))
    .map((match) => Number(match[1]))
    .filter((amount) => amount > 0);
}

/** "All ages", "19+" and so on from free text, or null when it doesn't say. All ages wins. */
export function ageFrom(text: string): string | null {
  if (/\ball[\s-]+ages\b/i.test(text)) return 'All ages';
  const ages = [...text.matchAll(/(?<![\d$.])(1[6-9]|2[01])\s*\+/g)].map((match) => Number(match[1]));
  return ages.length > 0 ? `${Math.max(...ages)}+` : null;
}

/** A title that announces a status, like "CANCELLED: ...", gives the status. */
export function statusFromTitle(title: string): string | null {
  if (/\bcancell?ed\b/i.test(title)) return 'cancelled';
  if (/\bpostponed\b/i.test(title)) return 'postponed';
  if (/\bsold[\s-]*out\b/i.test(title)) return 'soldout';
  return null;
}

/** Builds a show. Prices of zero are unknown, never free, as with the other sources. */
export function makeShow(facts: ShowFacts, defaults: VenueDefaults): ShowEvent {
  const prices = [facts.priceMin, facts.priceMax].filter((value): value is number => typeof value === 'number' && value > 0);
  const kind = classifyShow(facts.name);
  const fallback = kind.category === 'Other' || (kind.category === defaults.category && !kind.genre && !kind.subGenre);
  return {
    id: facts.id,
    name: facts.name,
    date: facts.date,
    time: facts.time,
    status: facts.status ?? statusFromTitle(facts.name) ?? 'onsale',
    url: facts.url,
    venueId: facts.venueId,
    category: fallback ? defaults.category : kind.category,
    genre: fallback ? (defaults.genre ?? null) : kind.genre,
    subGenre: kind.subGenre,
    artists: [],
    priceMin: prices.length > 0 ? Math.min(...prices) : null,
    priceMax: prices.length > 0 ? Math.max(...prices) : null,
    currency: prices.length > 0 ? 'CAD' : null,
    ageLabel: facts.ageLabel ?? null,
    imageUrl: null,
    firstSeenAt: null,
  };
}

/** A moment as a date and 24-hour time in Toronto. */
export function torontoDateTime(when: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(when)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:00` };
}
