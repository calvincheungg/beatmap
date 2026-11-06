import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { Plane, Vector3 } from 'three';
import { MAP_BOUNDS } from '../config';
import { boundsToScene } from '../map/projection';
import { MapScene } from './MapScene';

/** Tiles overhang the map's boundary, so everything is cut to a clean edge. */
function boundaryPlanes(): Plane[] {
  const { minX, maxX, minZ, maxZ } = boundsToScene(MAP_BOUNDS);
  return [
    new Plane(new Vector3(1, 0, 0), -minX),
    new Plane(new Vector3(-1, 0, 0), maxX),
    new Plane(new Vector3(0, 0, 1), -minZ),
    new Plane(new Vector3(0, 0, -1), maxZ),
  ];
}

/** `flat` turns off tone mapping so the theme's colours render as written. */
export function MapCanvas() {
  const [labelCanvas, setLabelCanvas] = useState<HTMLCanvasElement | null>(null);

  return (
    <div id="map-root" role="img" aria-label="Isometric map of Toronto and the Greater Toronto Area">
      <Canvas
        flat
        frameloop="demand"
        dpr={[1, 2]}
        onCreated={({ gl }) => {
          gl.clippingPlanes = boundaryPlanes();
        }}
      >
        <MapScene labelCanvas={labelCanvas} />
      </Canvas>
      <canvas id="map-labels" ref={setLabelCanvas} aria-hidden="true" />
    </div>
  );
}
