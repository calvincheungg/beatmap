export type DatePreset = 'any' | 'week' | 'month' | 'custom';

export interface DateFilter {
  preset: DatePreset;
  /** Only used by the custom preset. YYYY-MM-DD, or null to leave that end open. */
  from: string | null;
  to: string | null;
}

export const ANY_DATE: DateFilter = { preset: 'any', from: null, to: null };

export interface DateRange {
  from: string | null;
  to: string | null;
}

/** Adds days to a YYYY-MM-DD date. Uses UTC so daylight saving can't shift the result. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The inclusive dates a filter covers. A reversed custom range is put in order. */
export function dateRangeFor(filter: DateFilter, today: string): DateRange {
  if (filter.preset === 'week') return { from: today, to: addDays(today, 6) };
  if (filter.preset === 'month') return { from: today, to: addDays(today, 29) };
  if (filter.preset === 'custom') {
    const { from, to } = filter;
    return from && to && from > to ? { from: to, to: from } : { from, to };
  }
  return { from: null, to: null };
}

function shortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

/** Text for the date dropdown's button and the summary bar. */
export function dateFilterLabel(filter: DateFilter, today: string): string {
  if (filter.preset === 'week') return 'Next 7 days';
  if (filter.preset === 'month') return 'Next 30 days';
  if (filter.preset === 'custom') {
    const { from, to } = dateRangeFor(filter, today);
    if (from && to) return from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
    if (from) return `From ${shortDate(from)}`;
    if (to) return `Until ${shortDate(to)}`;
    return 'Choose dates';
  }
  return 'Any date';
}
