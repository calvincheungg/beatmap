import { Canvas } from '@react-three/fiber';
import { MapScene } from './MapScene';

/** `flat` turns off tone mapping so the theme's colours render as written. */
export function MapCanvas() {
  return (
    <div id="map-root" role="img" aria-label="Isometric map of downtown Toronto">
      <Canvas flat frameloop="demand" dpr={[1, 2]}>
        <MapScene />
      </Canvas>
    </div>
  );
}
