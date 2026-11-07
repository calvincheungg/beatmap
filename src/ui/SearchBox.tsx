import { useState, type KeyboardEvent } from 'react';
import { formatShowDate, searchGenres, searchShows, todayString, type ShowEvent } from '../data/events';
import { searchNeighbourhoods, type Neighbourhood } from '../data/neighbourhoods';
import { searchVenues, venues, type Venue } from '../data/venues';
import { showFilterFrom, useMapStore } from '../state/mapStore';

type Result =
  | { type: 'area'; area: Neighbourhood }
  | { type: 'genre'; name: string; count: number }
  | { type: 'venue'; venue: Venue }
  | { type: 'show'; show: ShowEvent; artist: string | null; venue: Venue };

function resultId(result: Result): string {
  if (result.type === 'area') return `search-area-${result.area.id}`;
  if (result.type === 'venue') return `search-venue-${result.venue.id}`;
  if (result.type === 'show') return `search-show-${result.show.id.replace(/\W+/g, '-')}`;
  return `search-genre-${result.name.replace(/\W+/g, '-')}`;
}

/** Searches places and venues, which fly the map there, genres, which set the filter, and shows, which open their venue. */
export function SearchBox() {
  const selectNeighbourhood = useMapStore((state) => state.selectNeighbourhood);
  const setGenre = useMapStore((state) => state.setGenre);
  const selectShow = useMapStore((state) => state.selectShow);
  const selectVenue = useMapStore((state) => state.selectVenue);
  const events = useMapStore((state) => state.events);
  const dateFilter = useMapStore((state) => state.dateFilter);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const today = todayString();
  const genres = searchGenres(query, events ?? [], today, showFilterFrom({ selectedGenre: null, dateFilter, priceFilter: null, ageFilter: null }, today)).map(
    (item): Result => ({ type: 'genre', ...item }),
  );
  const areas = searchNeighbourhoods(query).map((area): Result => ({ type: 'area', area }));
  const shows = searchShows(query, events ?? [], today).flatMap(({ show, artist }): Result[] => {
    const venue = venues.find((item) => item.id === show.venueId);
    return venue ? [{ type: 'show', show, artist, venue }] : [];
  });
  const matchedVenues = searchVenues(query).map((venue): Result => ({ type: 'venue', venue }));
  const results = [...matchedVenues, ...genres, ...areas, ...shows];
  const activeResult = results[active];

  const choose = (result: Result) => {
    if (result.type === 'area') {
      selectNeighbourhood(result.area);
      setQuery(result.area.name);
    } else if (result.type === 'venue') {
      selectVenue(result.venue);
      setQuery(result.venue.name);
    } else if (result.type === 'show') {
      selectShow(result.show, result.venue, today);
      setQuery(result.artist ?? result.show.name);
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
        aria-label="Search artists, venues, places and genres"
        aria-expanded={open}
        aria-controls="search-results"
        aria-activedescendant={open && activeResult ? resultId(activeResult) : undefined}
        placeholder="Search artists, venues, places"
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
        // The box keeps focus after a pick, so clicking it again wouldn't fire onFocus.
        onClick={() => {
          if (open) return;
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
              {result.type === 'area' && result.area.name}
              {result.type === 'venue' && (
                <>
                  <span className="result-type">Venue: </span>
                  {result.venue.name}
                  <span className="result-detail">{result.venue.neighbourhoodName}</span>
                </>
              )}
              {result.type === 'show' && (
                <>
                  <strong>{result.artist ?? result.show.name}</strong>
                  <span className="result-detail">
                    {result.artist && result.artist.toLowerCase() !== result.show.name.toLowerCase() ? `${result.show.name} · ` : ''}
                    {result.venue.name} · {formatShowDate(result.show.date)}
                  </span>
                </>
              )}
              {result.type === 'genre' && (
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
