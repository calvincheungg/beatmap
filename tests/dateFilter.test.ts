import { describe, expect, it } from 'vitest';
import { addDays, ANY_DATE, dateFilterLabel, dateRangeFor } from '../src/data/dateFilter';

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
