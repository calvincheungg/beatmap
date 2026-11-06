import { OrthographicCamera, Stats } from '@react-three/drei';
import { useMemo, useState } from 'react';
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three';
import { MAP_BOUNDS } from '../config';
import { boundsToScene } from '../map/projection';
import { theme } from '../theme';
import { CameraRig } from './CameraRig';
import { IsoCamera } from './camera/isoCamera';
import { MapTiles } from './MapTiles';

/** `?stats` in the URL shows a frame time overlay during development. */
const showStats = import.meta.env.DEV && new URLSearchParams(location.search).has('stats');

export function MapScene({ labelCanvas }: { labelCanvas: HTMLCanvasElement | null }) {
  const [camera, setCamera] = useState<ThreeOrthographicCamera | null>(null);
  const view = useMemo(() => (camera ? new IsoCamera(camera, boundsToScene(MAP_BOUNDS)) : null), [camera]);
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
          {labelCanvas && <MapTiles view={view} labelCanvas={labelCanvas} />}
        </>
      )}
      {showStats && <Stats />}
    </>
  );
}
