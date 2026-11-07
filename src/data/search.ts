/** Makes text comparable: ignores case, accents and surrounding space. */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Searches need this many letters, so one keystroke doesn't match most names. */
export const MIN_SEARCH_LENGTH = 2;
