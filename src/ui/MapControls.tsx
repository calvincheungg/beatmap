import { useMapStore } from '../state/mapStore';

export function MapControls() {
  const rotate = useMapStore((state) => state.rotate);
  const flat = useMapStore((state) => state.flat);
  const toggleFlat = useMapStore((state) => state.toggleFlat);
  const showLabels = useMapStore((state) => state.showLabels);
  const toggleLabels = useMapStore((state) => state.toggleLabels);
  const nextView = flat ? 'isometric' : 'flat';

  return (
    <div id="map-controls">
      <button
        id="labels-toggle"
        className="text-button"
        type="button"
        aria-pressed={showLabels}
        title={`${showLabels ? 'Hide' : 'Show'} place names (L)`}
        onClick={toggleLabels}
      >
        NAMES
      </button>
      <button
        id="view-toggle"
        className="text-button"
        type="button"
        aria-label={`Switch to ${nextView} map (F)`}
        title={`Switch to ${nextView} map (F)`}
        onClick={toggleFlat}
      >
        {flat ? 'ISO' : 'FLAT'}
      </button>
      <button id="rotate-left" type="button" aria-label="Rotate left (Q)" title="Rotate left (Q)" onClick={() => rotate(-1)}>
        ⟲
      </button>
      <button id="rotate-right" type="button" aria-label="Rotate right (E)" title="Rotate right (E)" onClick={() => rotate(1)}>
        ⟳
      </button>
    </div>
  );
}
