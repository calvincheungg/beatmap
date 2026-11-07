import { describe, expect, it } from 'vitest';
import {
  addDays,
  ANY_DATE,
  dateFilterLabel,
  dateRangeFor,
  fullDateLabel,
  monthGrid,
  monthLabel,
  nextRange,
} from '../src/data/dateFilter';

const today = '2026-11-06';

describe('addDays', () => {
  it('crosses months, years and the daylight saving change', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
  });
});

describe('dateRangeFor', () => {
  it('has no limits for any date', () => {
    expect(dateRangeFor(ANY_DATE, today)).toEqual({ from: null, to: null });
  });

  it('counts today as the first of 7 and 30 days', () => {
    expect(dateRangeFor({ preset: 'week', from: null, to: null }, today)).toEqual({ from: today, to: '2026-11-12' });
    expect(dateRangeFor({ preset: 'month', from: null, to: null }, today)).toEqual({ from: today, to: '2026-12-05' });
  });

  it('uses custom dates, ignoring them on other presets', () => {
    expect(dateRangeFor({ preset: 'custom', from: '2026-12-01', to: '2026-12-05' }, today)).toEqual({ from: '2026-12-01', to: '2026-12-05' });
    expect(dateRangeFor({ preset: 'any', from: '2026-12-01', to: null }, today)).toEqual({ from: null, to: null });
  });

  it('allows an open end and puts a reversed range in order', () => {
    expect(dateRangeFor({ preset: 'custom', from: '2026-12-01', to: null }, today)).toEqual({ from: '2026-12-01', to: null });
    expect(dateRangeFor({ preset: 'custom', from: '2026-12-05', to: '2026-12-01' }, today)).toEqual({ from: '2026-12-01', to: '2026-12-05' });
  });
});

describe('dateFilterLabel', () => {
  const custom = (from: string | null, to: string | null) => dateFilterLabel({ preset: 'custom', from, to }, today);

  it('names each choice', () => {
    expect(dateFilterLabel(ANY_DATE, today)).toBe('Any date');
    expect(dateFilterLabel({ preset: 'week', from: null, to: null }, today)).toBe('Next 7 days');
    expect(dateFilterLabel({ preset: 'month', from: null, to: null }, today)).toBe('Next 30 days');
  });

  it('describes custom dates without shifting the day', () => {
    expect(custom('2026-12-01', '2026-12-05')).toBe('Dec 1 – Dec 5');
    expect(custom('2026-12-01', '2026-12-01')).toBe('Dec 1');
    expect(custom('2026-12-01', null)).toBe('From Dec 1');
    expect(custom(null, '2026-12-05')).toBe('Until Dec 5');
    expect(custom(null, null)).toBe('Choose dates');
  });
});

describe('monthGrid', () => {
  it('starts on the right weekday, with empty cells around the month', () => {
    // November 2026 starts on a Sunday and has 30 days.
    const grid = monthGrid(2026, 11);
    expect(grid[0]![0]).toBe('2026-11-01');
    expect(grid.at(-1)!.filter(Boolean).at(-1)).toBe('2026-11-30');
    // December 2026 starts on a Tuesday.
    const december = monthGrid(2026, 12);
    expect(december[0]!.slice(0, 3)).toEqual([null, null, '2026-12-01']);
    expect(december.flat().filter(Boolean)).toHaveLength(31);
  });

  it('always has full weeks, and handles leap years', () => {
    for (const row of monthGrid(2028, 2)) expect(row).toHaveLength(7);
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2027, 2).flat().filter(Boolean)).toHaveLength(28);
  });
});

describe('date labels', () => {
  it('names months and full dates without shifting them', () => {
    expect(monthLabel(2026, 12)).toBe('December 2026');
    expect(fullDateLabel('2026-12-01')).toBe('Tuesday, December 1, 2026');
  });
});

describe('nextRange', () => {
  it('starts a range, finishes it, then starts over', () => {
    const first = nextRange({ from: null, to: null }, '2026-12-05');
    expect(first).toEqual({ from: '2026-12-05', to: null });
    const second = nextRange(first, '2026-12-09');
    expect(second).toEqual({ from: '2026-12-05', to: '2026-12-09' });
    expect(nextRange(second, '2026-12-20')).toEqual({ from: '2026-12-20', to: null });
  });

  it('puts an earlier second click first, and allows a single day', () => {
    expect(nextRange({ from: '2026-12-05', to: null }, '2026-12-01')).toEqual({ from: '2026-12-01', to: '2026-12-05' });
    expect(nextRange({ from: '2026-12-05', to: null }, '2026-12-05')).toEqual({ from: '2026-12-05', to: '2026-12-05' });
  });
});
