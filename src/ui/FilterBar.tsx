import { useEffect, useState } from 'react';
import { dateFilterLabel, type DatePreset } from '../data/dateFilter';
import { genreOptions, isFiltering, matchingShows, todayString, venuesWithShows, type AgeFilter } from '../data/events';
import { showFilterFrom, useMapStore } from '../state/mapStore';
import { DateRangePicker } from './DateRangePicker';
import { Dropdown, type DropdownGroup } from './Dropdown';

const ALL_GENRES = '';
const ANY = '';
const PRICE_ITEMS = [
  { value: ANY, label: 'Any price' },
  { value: '25', label: 'Under $25' },
  { value: '50', label: 'Under $50' },
  { value: '100', label: 'Under $100' },
];
const AGE_ITEMS = [
  { value: ANY, label: 'Any age' },
  { value: 'all-ages', label: 'All ages' },
  { value: 'adults', label: 'Adults only (19+)' },
];
const DATE_ITEMS: { value: DatePreset; label: string }[] = [
  { value: 'any', label: 'Any date' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'month', label: 'Next 30 days' },
  { value: 'custom', label: 'Choose dates…' },
];

/** The genre and date filters, and a summary of what they match. */
export function FilterBar() {
  const events = useMapStore((state) => state.events);
  const genre = useMapStore((state) => state.selectedGenre);
  const dateFilter = useMapStore((state) => state.dateFilter);
  const setGenre = useMapStore((state) => state.setGenre);
  const setDateFilter = useMapStore((state) => state.setDateFilter);
  const priceFilter = useMapStore((state) => state.priceFilter);
  const ageFilter = useMapStore((state) => state.ageFilter);
  const setPriceFilter = useMapStore((state) => state.setPriceFilter);
  const setAgeFilter = useMapStore((state) => state.setAgeFilter);
  const [choosingDates, setChoosingDates] = useState(false);

  // Clicking anywhere else, including the map, closes the calendar.
  useEffect(() => {
    if (!choosingDates) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('#date-range, #date-filter')) setChoosingDates(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [choosingDates]);

  /** Closes the calendar, returning focus to the button that opened it. */
  const finishChoosing = () => {
    setChoosingDates(false);
    document.getElementById('date-filter')?.focus();
  };

  if (!events || events.length === 0) return null;

  const today = todayString();
  const filter = showFilterFrom({ selectedGenre: genre, dateFilter, priceFilter, ageFilter }, today);
  const { genres, subGenres } = genreOptions(events, today, filter);
  const toItems = (list: typeof genres) => list.map(({ name, count }) => ({ value: name, label: `${name} (${count})` }));

  const genreGroups: DropdownGroup[] = [{ items: [{ value: ALL_GENRES, label: 'All genres' }] }];
  // A genre with no shows in the current dates still needs to appear, so it can be seen and changed.
  const known = [...genres, ...subGenres].some((item) => item.name === genre);
  if (genre && !known) genreGroups.push({ heading: 'Selected', items: [{ value: genre, label: `${genre} (0)` }] });
  if (genres.length > 0) genreGroups.push({ heading: 'Genres', items: toItems(genres) });
  if (subGenres.length > 0) genreGroups.push({ heading: 'More specific', items: toItems(subGenres) });

  const dateLabel = dateFilterLabel(dateFilter, today);
  const shows = matchingShows(events, today, filter).length;
  const venues = venuesWithShows(events, today, filter).size;
  const priceLabelText = PRICE_ITEMS.find((item) => item.value === String(priceFilter ?? ANY))?.label ?? 'Any price';
  const ageLabelText = AGE_ITEMS.find((item) => item.value === (ageFilter ?? ANY))?.label ?? 'Any age';
  const describe = [
    genre,
    dateFilter.preset === 'any' ? null : dateLabel,
    priceFilter === null ? null : priceLabelText,
    ageFilter === null ? null : ageLabelText,
  ]
    .filter(Boolean)
    .join(' · ');
  // Price and age come only from some listings, so say when shows without them are left out.
  const leavesOutUnknown = priceFilter !== null || ageFilter !== null;

  return (
    <>
      <div className="filter-row">
        <Dropdown
          id="genre-filter"
          label="Genre"
          buttonText={genre ?? 'All genres'}
          value={genre ?? ALL_GENRES}
          groups={genreGroups}
          active={genre !== null}
          onChange={(value) => setGenre(value || null)}
        />
        <Dropdown
          id="date-filter"
          label="Date"
          buttonText={dateLabel}
          value={dateFilter.preset}
          groups={[{ items: DATE_ITEMS }]}
          active={dateFilter.preset !== 'any'}
          onChange={(value) => {
            const preset = value as DatePreset;
            if (preset === 'custom') {
              setChoosingDates(true);
              setDateFilter({ preset, from: dateFilter.from, to: dateFilter.to });
            } else {
              setChoosingDates(false);
              setDateFilter({ preset, from: null, to: null });
            }
          }}
        />
        {choosingDates && (
          <DateRangePicker
            range={{ from: dateFilter.from, to: dateFilter.to }}
            today={today}
            onChange={(range) => setDateFilter({ preset: 'custom', ...range })}
            onDone={finishChoosing}
          />
        )}
      </div>
      <div className="filter-row">
        <Dropdown
          id="price-filter"
          label="Price"
          buttonText={priceLabelText}
          value={String(priceFilter ?? ANY)}
          groups={[{ items: PRICE_ITEMS }]}
          active={priceFilter !== null}
          onChange={(value) => setPriceFilter(value ? Number(value) : null)}
        />
        <Dropdown
          id="age-filter"
          label="Age"
          buttonText={ageLabelText}
          value={ageFilter ?? ANY}
          groups={[{ items: AGE_ITEMS }]}
          active={ageFilter !== null}
          onChange={(value) => setAgeFilter((value || null) as AgeFilter | null)}
        />
      </div>
      {isFiltering(filter) && (
        <div id="filter-summary" role="status">
          {describe}: {shows === 1 ? '1 show' : `${shows} shows`} at {venues === 1 ? '1 venue' : `${venues} venues`}
          {leavesOutUnknown && <span className="summary-note">Only shows that list this are included.</span>}
        </div>
      )}
    </>
  );
}
