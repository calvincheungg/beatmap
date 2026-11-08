import { useEffect, useRef, useState } from 'react';
import {
  artistsNotInTitle,
  formatShowDate,
  formatShowTime,
  isCancelled,
  isFiltering,
  priceLabel,
  showStamp,
  showStatusLabel,
  stampTilt,
  todayString,
  upcomingShows,
  type ShowEvent,
} from '../data/events';
import { showFilterFrom, useMapStore } from '../state/mapStore';

/** The most specific label for a show: its sub-genre or genre, or its category when it isn't music. */
function kindOf(show: ShowEvent): string | null {
  return show.subGenre ?? show.genre ?? (show.category === 'Music' ? null : show.category);
}

/** Names where a venue's listings came from, using the source at the start of each show's id. */
function sourcesOf(shows: ShowEvent[]): string {
  const names = new Set(shows.map((show) => (show.id.startsWith('ticketmaster:') ? 'Ticketmaster' : "the venue's box office")));
  return [...names].join(' and ');
}

/** How many shows to list before the "show all" button. */
const INITIAL_SHOWS = 10;

/** A venue's upcoming shows, with links to buy tickets. */
export function VenueShows({ venueId }: { venueId: string }) {
  const events = useMapStore((state) => state.events);
  const genre = useMapStore((state) => state.selectedGenre);
  const dateFilter = useMapStore((state) => state.dateFilter);
  const priceFilter = useMapStore((state) => state.priceFilter);
  const ageFilter = useMapStore((state) => state.ageFilter);
  const highlightedId = useMapStore((state) => state.highlightedShowId);
  const [showAll, setShowAll] = useState(false);
  const highlighted = useRef<HTMLLIElement>(null);

  useEffect(() => {
    // Only as far as needed, so the venue's name stays in view when the show is near the top.
    highlighted.current?.scrollIntoView({ block: 'nearest' });
  }, [highlightedId]);

  if (events === null) return <p>Show listings aren't available right now.</p>;

  const now = new Date();
  const today = todayString(now);
  const filter = showFilterFrom({ selectedGenre: genre, dateFilter, priceFilter, ageFilter }, today);
  const shows = upcomingShows(events, venueId, today, filter);
  if (shows.length === 0) {
    return <p>{isFiltering(filter) ? 'No shows here match your filters.' : 'No upcoming shows listed.'}</p>;
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
          const stamp = showStamp(show, now);
          const cancelled = isCancelled(show);
          const others = artistsNotInTitle(show);
          const price = priceLabel(show);
          const isHighlighted = show.id === highlightedId;
          const classes = [isHighlighted && 'is-highlighted', cancelled && 'is-cancelled'].filter(Boolean).join(' ');
          return (
            <li key={show.id} ref={isHighlighted ? highlighted : undefined} className={classes || undefined}>
              <div className="show-details">
                {stamp && (
                  <span className={`stamp stamp-${stamp.kind}`} style={{ rotate: `${stampTilt(show.id)}deg` }}>
                    {stamp.label}
                  </span>
                )}
                <strong className="show-name">{show.name}</strong>
                {others.length > 0 && <span>With {others.join(', ')}</span>}
                <span>
                  {formatShowDate(show.date)}
                  {time ? ` · ${time}` : ''}
                </span>
                {!cancelled && (price || show.ageLabel) && (
                  <span className="show-price">{[price, show.ageLabel].filter(Boolean).join(' · ')}</span>
                )}
                {kindOf(show) && <span>{kindOf(show)}</span>}
                {status && <span className="show-status">{status}</span>}
                {!cancelled && (
                  <a href={show.url} target="_blank" rel="noopener noreferrer">
                    Tickets
                    <span className="visually-hidden"> for {show.name} (opens in a new tab)</span>
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {shows.length > visible.length && (
        <button type="button" className="show-more" onClick={() => setShowAll(true)}>
          Show all {shows.length} shows
        </button>
      )}
      <p className="show-source">Listings from {sourcesOf(shows)}</p>
    </section>
  );
}
