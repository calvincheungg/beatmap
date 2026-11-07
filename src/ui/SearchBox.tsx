import { useState, type KeyboardEvent } from 'react';
import { searchGenres, todayString } from '../data/events';
import { searchNeighbourhoods, type Neighbourhood } from '../data/neighbourhoods';
import { showFilterFrom, useMapStore } from '../state/mapStore';

type Result = { type: 'area'; area: Neighbourhood } | { type: 'genre'; name: string; count: number };

function resultId(result: Result): string {
  return result.type === 'area' ? `search-area-${result.area.id}` : `search-genre-${result.name.replace(/\W+/g, '-')}`;
}

/** Searches neighbourhoods, which fly the map there, and genres, which set the filter. */
export function SearchBox() {
  const selectNeighbourhood = useMapStore((state) => state.selectNeighbourhood);
  const setGenre = useMapStore((state) => state.setGenre);
  const events = useMapStore((state) => state.events);
  const dateFilter = useMapStore((state) => state.dateFilter);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const today = todayString();
  const genres = searchGenres(query, events ?? [], today, showFilterFrom(null, dateFilter, today)).map(
    (item): Result => ({ type: 'genre', ...item }),
  );
  const areas = searchNeighbourhoods(query).map((area): Result => ({ type: 'area', area }));
  const results = [...genres, ...areas];
  const activeResult = results[active];

  const choose = (result: Result) => {
    if (result.type === 'area') {
      selectNeighbourhood(result.area);
      setQuery(result.area.name);
    } else {
      setGenre(result.name);
      setQuery('');
    }
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setOpen(true);
      setActive((active + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      if (open && activeResult) choose(activeResult);
    }
  };

  return (
    <>
      <input
        type="search"
        role="combobox"
        aria-label="Search neighbourhoods and genres"
        aria-expanded={open}
        aria-controls="search-results"
        aria-activedescendant={open && activeResult ? resultId(activeResult) : undefined}
        placeholder="Search places or genres"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id="search-results" role="listbox" aria-label="Search results">
          {results.length === 0 && (
            <li role="option" aria-selected="false" aria-disabled="true">
              No matches
            </li>
          )}
          {results.map((result, index) => (
            <li
              key={resultId(result)}
              id={resultId(result)}
              role="option"
              aria-selected={index === active}
              // Runs before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(result);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {result.type === 'area' ? (
                result.area.name
              ) : (
                <>
                  <span className="result-type">Genre: </span>
                  {result.name} ({result.count})
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
