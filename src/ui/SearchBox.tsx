import { useState, type KeyboardEvent } from 'react';
import { searchNeighbourhoods, type Neighbourhood } from '../data/neighbourhoods';
import { useMapStore } from '../state/mapStore';

/** A search box that flies the map to a neighbourhood and opens its panel. */
export function SearchBox() {
  const selectNeighbourhood = useMapStore((state) => state.selectNeighbourhood);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = searchNeighbourhoods(query);

  const choose = (area: Neighbourhood) => {
    selectNeighbourhood(area);
    setQuery(area.name);
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
      const area = results[active];
      if (open && area) choose(area);
    }
  };

  return (
    <div id="search">
      <input
        type="search"
        role="combobox"
        aria-label="Search neighbourhoods"
        aria-expanded={open}
        aria-controls="search-results"
        aria-activedescendant={open && results[active] ? `search-${results[active].id}` : undefined}
        placeholder="Search neighbourhoods"
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
        <ul id="search-results" role="listbox" aria-label="Neighbourhoods">
          {results.length === 0 && <li role="option" aria-selected="false" aria-disabled="true">No matches</li>}
          {results.map((area, index) => (
            <li
              key={area.id}
              id={`search-${area.id}`}
              role="option"
              aria-selected={index === active}
              // Runs before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(area);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {area.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
