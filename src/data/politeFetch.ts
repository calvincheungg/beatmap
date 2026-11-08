/**
 * The rules for reading a venue's own website: one request at a time, 2 seconds apart, as BeatMap,
 * to allowed pages only, stopping at the first error rather than retrying. No browser or Node dependencies.
 */

/** Identifies us to the venue, with a link explaining the project. */
export const USER_AGENT = 'BeatMapBot/0.1 (+https://beatmap-rho.vercel.app; Toronto live music map)';
/** The pause between requests to a venue's site. */
export const REQUEST_GAP_MS = 2000;
/** A limit so a misbehaving site can't keep a run going. */
const MAX_REQUESTS = 150;

export interface PoliteFetchOptions {
  fetcher?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}

/** A site answered with an error status, like 403 when it refuses us. */
export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

/** Fetches a page's HTML. `what` names the page in errors. */
export type PageFetch = (url: string, what: string) => Promise<string>;

/**
 * Makes a fetcher for one site. `isAllowed` must approve every address. The site's cookies are
 * kept and sent back, as a browser would, since some sites need a session to page through listings.
 */
export function createPoliteFetch(key: string, isAllowed: (url: string) => boolean, options: PoliteFetchOptions = {}): PageFetch {
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let requests = 0;
  const cookies = new Map<string, string>();
  return async (url, what) => {
    if (++requests > MAX_REQUESTS) throw new Error(`Stopped after ${MAX_REQUESTS} requests to ${key}.`);
    if (requests > 1) await wait(REQUEST_GAP_MS);
    if (!isAllowed(url)) throw new Error(`Refusing to request ${url}`);
    const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    // Pages and JSON APIs both come through here, and some APIs refuse a request that accepts only HTML.
    const accept = 'text/html,application/json;q=0.9,*/*;q=0.8';
    const response = await fetcher(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept, ...(cookie ? { Cookie: cookie } : {}) } });
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const split = pair?.indexOf('=') ?? -1;
      if (pair && split > 0) cookies.set(pair.slice(0, split).trim(), pair.slice(split + 1).trim());
    }
    if (!response.ok) throw new HttpStatusError(`${key} returned ${response.status} for ${what}. Stopping.`, response.status);
    return response.text();
  };
}
