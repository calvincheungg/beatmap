import { genreOptions, todayString, venuesWithShows } from '../data/events';
import { useMapStore } from '../state/mapStore';

/** A dropdown that limits the map and panel to one genre. */
export function GenreFilter() {
  const events = useMapStore((state) => state.events);
  const genre = useMapStore((state) => state.selectedGenre);
  const setGenre = useMapStore((state) => state.setGenre);
  if (!events || events.length === 0) return null;

  const today = todayString();
  const options = genreOptions(events, today);
  // A sub-genre chosen in search isn't in the main list, so it needs its own option.
  const isSubGenre = genre !== null && !options.some((option) => option.name === genre);
  const venueCount = genre ? venuesWithShows(events, today, genre).size : 0;

  return (
    <>
      <select
        id="genre-filter"
        aria-label="Filter by genre"
        value={genre ?? ''}
        onChange={(event) => setGenre(event.target.value || null)}
      >
        <option value="">All genres</option>
        {isSubGenre && <option value={genre}>{genre}</option>}
        {options.map(({ name, count }) => (
          <option key={name} value={name}>
            {name} ({count})
          </option>
        ))}
      </select>
      {genre && (
        <div id="genre-summary" role="status">
          {genre}: {venueCount === 1 ? '1 venue' : `${venueCount} venues`} with shows
        </div>
      )}
    </>
  );
}
