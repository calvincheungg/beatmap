import { useState } from 'react';
import { formatShowDate, formatShowTime, isFiltering, showStatusLabel, todayString, upcomingShows } from '../data/events';
import { showFilterFrom, useMapStore } from '../state/mapStore';

/** How many shows to list before the "show all" button. */
const INITIAL_SHOWS = 10;

/** A venue's upcoming shows, with links to buy tickets. */
export function VenueShows({ venueId }: { venueId: string }) {
  const events = useMapStore((state) => state.events);
  const genre = useMapStore((state) => state.selectedGenre);
  const dateFilter = useMapStore((state) => state.dateFilter);
  const [showAll, setShowAll] = useState(false);

  if (events === null) return <p>Show listings aren't available right now.</p>;

  const today = todayString();
  const filter = showFilterFrom(genre, dateFilter, today);
  const shows = upcomingShows(events, venueId, today, filter);
  if (shows.length === 0) {
    return <p>{isFiltering(filter) ? 'No shows here match your filters.' : 'No upcoming shows listed on Ticketmaster.'}</p>;
  }
  const visible = showAll ? shows : shows.slice(0, INITIAL_SHOWS);

  return (
    <section aria-label="Upcoming shows">
      <h3>{genre ? `Upcoming ${genre} shows` : 'Upcoming shows'}</h3>
      <ul className="show-list">
        {visible.map((show) => {
          const time = formatShowTime(show.time);
          const status = showStatusLabel(show.status);
          return (
            <li key={show.id}>
              <strong>{show.name}</strong>
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
