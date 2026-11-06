import { findNeighbourhood } from '../data/neighbourhoods';
import { venuesIn } from '../data/venues';
import { useMapStore } from '../state/mapStore';

/** Shows the selected neighbourhood and its venues. Picking a venue flies the map to it. */
export function SidePanel() {
  const selectedId = useMapStore((state) => state.selectedNeighbourhoodId);
  const selectedVenueId = useMapStore((state) => state.selectedVenueId);
  const selectVenue = useMapStore((state) => state.selectVenue);
  const closePanel = useMapStore((state) => state.closePanel);

  const area = findNeighbourhood(selectedId);
  if (!area) return null;
  const areaVenues = venuesIn(area.id);
  const venue = areaVenues.find(({ id }) => id === selectedVenueId);

  return (
    <>
      <div id="side-panel-edge" aria-hidden="true" />
      <aside id="side-panel" aria-label={`${area.name} venues`}>
        <button id="panel-close" type="button" aria-label="Close panel" onClick={closePanel}>
          ×
        </button>
        <h2>{venue?.name ?? area.name}</h2>
        {venue && <p>{area.name}</p>}
        {areaVenues.length === 0 ? (
          <p>Nothing listed here yet.</p>
        ) : (
          <ul>
            {areaVenues.map((listed) => (
              <li key={listed.id}>
                <button
                  type="button"
                  aria-current={listed.id === selectedVenueId}
                  onClick={() => selectVenue(listed)}
                >
                  {listed.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
