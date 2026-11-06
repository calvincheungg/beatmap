import { OrthographicCamera } from '@react-three/drei';
import { useMemo, useState } from 'react';
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three';
import { MAP_BOUNDS } from '../config';
import { lonLatToScene } from '../map/projection';
import { theme } from '../theme';
import { CameraRig } from './CameraRig';
import { IsoCamera, type SceneBounds } from './camera/isoCamera';
import { MapTiles } from './MapTiles';

function sceneBounds(): SceneBounds {
  const northWest = lonLatToScene({ lat: MAP_BOUNDS.north, lon: MAP_BOUNDS.west });
  const southEast = lonLatToScene({ lat: MAP_BOUNDS.south, lon: MAP_BOUNDS.east });
  return { minX: northWest.x, maxX: southEast.x, minZ: northWest.z, maxZ: southEast.z };
}

export function MapScene() {
  const [camera, setCamera] = useState<ThreeOrthographicCamera | null>(null);
  const view = useMemo(() => (camera ? new IsoCamera(camera, sceneBounds()) : null), [camera]);
  const { light } = theme;

  return (
    <>
      <color attach="background" args={[theme.background]} />
      <ambientLight color={light.ambientColor} intensity={light.ambientIntensity} />
      <directionalLight
        color={light.directionalColor}
        intensity={light.directionalIntensity}
        position={light.direction}
      />
      {/* `manual` leaves the frustum to IsoCamera. */}
      <OrthographicCamera ref={setCamera} makeDefault manual />
      {view && (
        <>
          <CameraRig view={view} />
          <MapTiles view={view} />
        </>
      )}
    </>
  );
}
