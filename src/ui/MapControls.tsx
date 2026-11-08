import { useMapStore } from '../state/mapStore';
import { SettingsMenu } from './SettingsMenu';

export function MapControls() {
  const rotate = useMapStore((state) => state.rotate);

  return (
    <div id="map-controls">
      <button id="rotate-left" type="button" aria-label="Rotate left (Q)" title="Rotate left (Q)" onClick={() => rotate(-1)}>
        ⟲
      </button>
      <button id="rotate-right" type="button" aria-label="Rotate right (E)" title="Rotate right (E)" onClick={() => rotate(1)}>
        ⟳
      </button>
      <SettingsMenu />
    </div>
  );
}
