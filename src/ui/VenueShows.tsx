import { useEffect, useRef, useState } from 'react';
import { artistsNotInTitle, formatShowDate, formatShowTime, isFiltering, showStatusLabel, todayString, upcomingShows } from '../data/events';
import { showFilterFrom, useMapStore } from '../state/mapStore';

/** How many shows to list before the "show all" button. */
const INITIAL_SHOWS = 10;

/** A venue's upcoming shows, with links to buy tickets. */
export function VenueShows({ venueId }: { venueId: string }) {
  const events = useMapStore((state) => state.events);
  const genre = useMapStore((state) => state.selectedGenre);
  const dateFilter = useMapStore((state) => state.dateFilter);
  const highlightedId = useMapStore((state) => state.highlightedShowId);
  const [showAll, setShowAll] = useState(false);
  const highlighted = useRef<HTMLLIElement>(null);

  useEffect(() => {
    // Only as far as needed, so the venue's name stays in view when the show is near the top.
    highlighted.current?.scrollIntoView({ block: 'nearest' });
  }, [highlightedId]);

  if (events === null) return <p>Show listings aren't available right now.</p>;

  const today = todayString();
  const filter = showFilterFrom(genre, dateFilter, today);
  const shows = upcomingShows(events, venueId, today, filter);
  if (shows.length === 0) {
    return <p>{isFiltering(filter) ? 'No shows here match your filters.' : 'No upcoming shows listed on Ticketmaster.'}</p>;
  }
  // A show picked in search has to be listed, even if it's further down.
  const needsAll = shows.findIndex((show) => show.id === highlightedId) >= INITIAL_SHOWS;
  const visible = showAll || needsAll ? shows : shows.slice(0, INITIAL_SHOWS);

  return (
    <section aria-label="Upcoming shows">
      <h3>{genre ? `Upcoming ${genre} shows` : 'Upcoming shows'}</h3>
      <ul className="show-list">
        {visible.map((show) => {
          const time = formatShowTime(show.time);
          const status = showStatusLabel(show.status);
          const others = artistsNotInTitle(show);
          const isHighlighted = show.id === highlightedId;
          return (
            <li key={show.id} ref={isHighlighted ? highlighted : undefined} className={isHighlighted ? 'is-highlighted' : undefined}>
              <strong>{show.name}</strong>
              {others.length > 0 && <span>With {others.join(', ')}</span>}
              <span>
                {formatShowDate(show.date)}
                {time ? ` · ${time}` : ''}
              </span>
              {(show.subGenre ?? show.genre) && <span>{show.subGenre ?? show.genre}</span>}
              {status && <span className="show-status">{status}</span>}
              <a href={show.url} target="_blank" rel="noopener noreferrer">
                Tickets
                <span className="visually-hidden"> for {show.name} (opens in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ul>
      {shows.length > visible.length && (
        <button type="button" className="show-more" onClick={() => setShowAll(true)}>
          Show all {shows.length} shows
        </button>
      )}
      <p className="show-source">Listings from Ticketmaster</p>
    </section>
  );
}
