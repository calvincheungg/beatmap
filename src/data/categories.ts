/**
 * Sorts shows into broad categories from their titles, for sources that don't give a genre.
 * Ticketmaster shows are Music or Comedy, from its own classification (see categoryOf in ticketmaster.ts).
 * Edit the rules here: the first rule whose pattern matches wins.
 */

export const CATEGORIES = ['Music', 'Dance', 'Theatre', 'Comedy', 'Film', 'Talks', 'Family', 'Games', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Classification {
  category: Category;
  /** A music genre when the title makes it clear, using Ticketmaster's names so filters line up. */
  genre: string | null;
  subGenre: string | null;
}

interface Rule {
  pattern: RegExp;
  category: Category;
  genre?: string;
  subGenre?: string;
}

/** Order matters: "Christmas musical" must be Theatre before "Christmas" could mean Family. */
const RULES: Rule[] = [
  // First, so a music bar's trivia night isn't counted as a concert.
  { pattern: /\b(trivia|quiz|bingo|game night|board games?)\b/i, category: 'Games' },
  { pattern: /\b(film|movie|screening|cinema|reel thing)\b/i, category: 'Film' },
  // A club's "80s Dance Party" or "guaranteed dancing" is a DJ night, so it's Music, not a dance performance.
  { pattern: /\b(dance[\s-]+(party|parties|night|nights|floor)|dancing)\b/i, category: 'Music' },
  { pattern: /\b(ballet|nutcracker|dance|dancers|flamenco)\b/i, category: 'Dance' },
  { pattern: /\b(comedy|comedian|stand[- ]?up|improv|laughs?)\b/i, category: 'Comedy' },
  // Opera counts as Theatre. Composers' names mark the operas that don't say so.
  { pattern: /\b(musical|theatre|theater|opera|cabaret|panto|pantomime|bizet|verdi|puccini|rossini)\b/i, category: 'Theatre' },
  { pattern: /\b(lecture|talk|university|conversation|in conversation|seminar|workshop|class)\b/i, category: 'Talks' },
  { pattern: /\b(jazz)\b/i, category: 'Music', genre: 'Jazz' },
  { pattern: /\b(tribute|classic albums live|elvis|beatle\w*|yesterday once more|songbook|mania)\b/i, category: 'Music', subGenre: 'Tribute' },
  // Before Classical, so a band touring with a string section stays a band.
  { pattern: /\b(band)\b/i, category: 'Music' },
  { pattern: /\b(orchestra|philharmonic|symphony|symphonic|choir|choral|rhpo|classical)\b/i, category: 'Music', genre: 'Classical' },
  { pattern: /\b(blues)\b/i, category: 'Music', genre: 'Blues' },
  { pattern: /\b(country)\b/i, category: 'Music', genre: 'Country' },
  { pattern: /\b(folk|celtic)\b/i, category: 'Music', genre: 'Folk' },
  { pattern: /\b(concert|band|live in|songs?|singer|music|recital|tour|unplugged|acoustic|quartet|trio|strings|brass|ensemble|tenors?|soprano|piano|pianist|guitar|violin|cello|gospel|motown|swing\w*)\b/i, category: 'Music' },
  // JavaScript's \b only understands Latin letters, so the Russian word for a holiday show stands alone.
  { pattern: /\b(kids|children|family|puppet|magic show|magician|circus|santa|wonderland)\b|ёлка/i, category: 'Family' },
];

/**
 * Artists whose names don't say what they play. Checked before the rules, by whole words in the
 * title, so "Little Magic Sam" is blues rather than a magic show. Add to this as you spot misses.
 */
const KNOWN_ARTISTS: { name: string; category: Category; genre?: string; subGenre?: string }[] = [
  { name: 'Little Magic Sam', category: 'Music', genre: 'Blues' },
];

/**
 * Venues' own style labels, like "Spiritual Jazz" or "Progressive House", as Ticketmaster's genre
 * names. Electronic comes before Reggae so "Deep techno · Dub" stays electronic.
 */
const STYLE_RULES: Rule[] = [
  { pattern: /\b(comedy|stand[- ]?up)\b/i, category: 'Comedy' },
  { pattern: /jazz/i, category: 'Music', genre: 'Jazz' },
  { pattern: /\b(hip[\s-]?hop|rap|trap|drill)\b/i, category: 'Music', genre: 'Hip-Hop/Rap' },
  { pattern: /\b(r\s?&\s?b|rnb|soul|funk)\b/i, category: 'Music', genre: 'R&B' },
  { pattern: /\b(techno|house|jungle|drum\s*(and|&|n)\s*bass|dnb|electronic|edm|dance|disco|ambient|trance|garage|bass music)\b/i, category: 'Music', genre: 'Dance/Electronic' },
  { pattern: /\b(reggae|dancehall|dub|ska|rocksteady|roots)\b/i, category: 'Music', genre: 'Reggae' },
  { pattern: /\b(punk|rock|grunge|shoegaze|indie)\b/i, category: 'Music', genre: 'Rock' },
  { pattern: /\b(metal|hardcore)\b/i, category: 'Music', genre: 'Metal' },
  { pattern: /\b(cumbia|salsa|latin|reggaeton|bachata|merengue)\b/i, category: 'Music', genre: 'Latin' },
  { pattern: /\b(folk|bluegrass)\b/i, category: 'Music', genre: 'Folk' },
  { pattern: /\bblues\b/i, category: 'Music', genre: 'Blues' },
  { pattern: /\bcountry\b/i, category: 'Music', genre: 'Country' },
  { pattern: /\bpop\b/i, category: 'Music', genre: 'Pop' },
];

/**
 * Reads a venue's style line, like "Reggae - Dancehall - Roots" or "Folktronica · Experimental
 * electronic". The first style that names a known genre wins. Null when none does, like "60s".
 */
export function classifyStyle(text: string): Classification | null {
  for (const style of text.split(/\s*[,/|·•]\s*|\s+[-–—]\s+/)) {
    const rule = STYLE_RULES.find(({ pattern }) => pattern.test(style));
    // "garage" alone is UK garage, but "garage rock" is rock.
    if (rule?.genre === 'Dance/Electronic' && /\bgarage\s+rock\b/i.test(style)) return { category: 'Music', genre: 'Rock', subGenre: null };
    if (rule) return { category: rule.category, genre: rule.genre ?? null, subGenre: null };
  }
  return null;
}

function mentions(title: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(title);
}

export function classifyShow(title: string): Classification {
  const artist = KNOWN_ARTISTS.find(({ name }) => mentions(title, name));
  if (artist) return { category: artist.category, genre: artist.genre ?? null, subGenre: artist.subGenre ?? null };
  const rule = RULES.find(({ pattern }) => pattern.test(title));
  if (!rule) return { category: 'Other', genre: null, subGenre: null };
  return { category: rule.category, genre: rule.genre ?? null, subGenre: rule.subGenre ?? null };
}
