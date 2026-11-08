import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '../state/mapStore';
import { FilterBar } from './FilterBar';
import { SearchBox } from './SearchBox';

const STORAGE_KEY = 'beatmap:filters-open';
/** Matches the phone layout in style.css, where the panel takes up most of the screen. */
const PHONE_QUERY = '(max-width: 760px)';

/** Remembers the visitor's choice. Otherwise it starts open, except on phones, where space is tight. */
function initiallyOpen(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // Storage can be blocked, for example in private browsing.
  }
  return !window.matchMedia(PHONE_QUERY).matches;
}

/** Search and filters, which can collapse to one button. Filters stay applied while it's collapsed. */
export function SearchPanel() {
  const [open, setOpen] = useState(initiallyOpen);
  const toggled = useRef(false);
  const toggle = (next: boolean) => {
    toggled.current = true;
    setOpen(next);
  };
  const activeFilters = useMapStore(
    (state) =>
      [state.selectedGenre !== null, state.dateFilter.preset !== 'any', state.priceFilter !== null, state.ageFilter !== null].filter(Boolean)
        .length,
  );

  // The button is replaced when it toggles, so keep keyboard focus on its replacement.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    document.getElementById('filters-toggle')?.focus();
  }, [open]);

  useEffect(() => {
    // The map controls sit below this on phones, so the stylesheet needs to know its height.
    document.documentElement.dataset.filters = open ? 'open' : 'closed';
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      // Not remembering is fine.
    }
  }, [open]);

  if (!open) {
    return (
      <div id="search">
        <button
          type="button"
          id="filters-toggle"
          className={`filters-open${activeFilters > 0 ? ' is-active' : ''}`}
          aria-expanded="false"
          aria-controls="search-content"
          onClick={() => toggle(true)}
        >
          <span>
            Search &amp; filters
            {activeFilters > 0 && ` · ${activeFilters} on`}
          </span>
          <span aria-hidden="true">▾</span>
        </button>
      </div>
    );
  }

  return (
    <div id="search">
      <div id="search-content">
        <div className="search-row">
          <SearchBox />
          <button
            type="button"
            id="filters-toggle"
            aria-expanded="true"
            aria-controls="search-content"
            aria-label="Hide search and filters"
            title="Hide search and filters"
            onClick={() => toggle(false)}
          >
            ▴
          </button>
        </div>
        <FilterBar />
      </div>
    </div>
  );
}
