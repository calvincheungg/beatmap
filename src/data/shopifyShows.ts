/**
 * Reads venues that sell show tickets as products in a Shopify store, through the collection's
 * public products feed (/collections/<handle>/products.json), which Shopify publishes for every
 * store. Facts only: the show and date from the product title, prices from its ticket types,
 * sold out when none can be bought, and the product page as the ticket link.
 *
 * Spotting a suitable site: a Shopify store ("cdn.shopify.com") with a collection of shows whose
 * product titles read like "Artist - Sunday, November 8th, 2026 @ 8pm".
 */
import { decodeText, makeShow, type VenueDefaults } from './feedShow.ts';
import { createPoliteFetch, type PageFetch, type PoliteFetchOptions } from './politeFetch.ts';
import type { ShowEvent } from './ticketmaster.ts';

export interface ShopifyVenue {
  key: string;
  /** The store's address, ending in a slash. */
  storeUrl: string;
  /** The collection holding the shows. */
  collection: string;
  venueId: string;
  defaults: VenueDefaults;
}

export const THE_REX: ShopifyVenue = {
  key: 'rex',
  storeUrl: 'https://www.therexshop.ca/',
  collection: 'live-shows',
  venueId: 'the-rex-hotel-jazz-blues-bar',
  defaults: { category: 'Music', genre: 'Jazz' },
};

/** A safety limit on result pages. */
const MAX_PAGES = 5;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export interface ShopifyProduct {
  id?: number;
  title?: string;
  handle?: string;
  variants?: { price?: string; available?: boolean }[];
}

export function productsUrl(venue: ShopifyVenue, page = 1): string {
  return `${venue.storeUrl}collections/${venue.collection}/products.json?limit=250${page > 1 ? `&page=${page}` : ''}`;
}

/** Only the collection's products feed may be requested: never carts, checkout or accounts. */
export function isAllowedUrl(venue: ShopifyVenue, url: string): boolean {
  return url.startsWith(`${venue.storeUrl}collections/${venue.collection}/products.json?`);
}

export interface TitleParts {
  name: string;
  date: string;
  time: string | null;
}

/**
 * Splits "Artist - Sunday, November 8th, 2026 @ 8pm" into the show, the date and the start time.
 * Notes in asterisks, like "**TICKETS AT THE DOOR ONLY**", are removed from the name.
 */
export function parseTitle(title: string): TitleParts | null {
  const clean = decodeText(title).replace(/\*\*[^*]*\*\*/g, '').trim();
  const match =
    /^(.*?)\s*[-–—]\s*(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s*@\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m)?/i.exec(clean);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2]!.toLowerCase());
  const name = match[1]!.trim();
  if (month < 0 || !name) return null;
  const date = `${match[4]}-${String(month + 1).padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  if (!match[5]) return { name, date, time: null };
  const hours = (Number(match[5]) % 12) + (match[7]!.toLowerCase() === 'p' ? 12 : 0);
  return { name, date, time: `${String(hours).padStart(2, '0')}:${match[6] ?? '00'}:00` };
}

/** Turns products into shows from today on. Products whose titles don't name a date are skipped. */
export function toShowEvents(products: ShopifyProduct[], venue: ShopifyVenue, today: string): ShowEvent[] {
  return products.flatMap((product): ShowEvent[] => {
    const parts = parseTitle(product.title ?? '');
    if (!product.handle || !parts || parts.date < today) return [];
    const variants = product.variants ?? [];
    const prices = variants.map((variant) => Number.parseFloat(variant.price ?? '')).filter((price) => Number.isFinite(price) && price > 0);
    // Listings sold only at the door can't be bought online, but they aren't sold out.
    const doorOnly = /door only|at the door/i.test(product.title ?? '');
    const soldOut = variants.length > 0 && !variants.some((variant) => variant.available) && !doorOnly;
    return [
      makeShow(
        {
          id: product.handle,
          name: parts.name,
          date: parts.date,
          time: parts.time,
          status: soldOut ? 'soldout' : undefined,
          url: `${venue.storeUrl}products/${product.handle}`,
          venueId: venue.venueId,
          priceMin: prices.length > 0 ? Math.min(...prices) : null,
          priceMax: prices.length > 0 ? Math.max(...prices) : null,
        },
        venue.defaults,
      ),
    ];
  });
}

export function createFetch(venue: ShopifyVenue, options: PoliteFetchOptions = {}): PageFetch {
  return createPoliteFetch(venue.key, (url) => isAllowedUrl(venue, url), options);
}

export async function fetchShows(venue: ShopifyVenue, today: string, fetchPage: PageFetch = createFetch(venue)): Promise<ShowEvent[]> {
  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = JSON.parse(await fetchPage(productsUrl(venue, page), `products page ${page}`)) as { products?: ShopifyProduct[] };
    const found = body.products ?? [];
    products.push(...found);
    if (found.length < 250) break;
  }
  return toShowEvents(products, venue, today);
}
