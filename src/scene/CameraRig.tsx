import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Fog } from 'three';
import { useMapStore } from '../state/mapStore';
import { theme } from '../theme';
import { attachControls } from './camera/controls';
import { CAMERA_DISTANCE, type IsoCamera } from './camera/isoCamera';
import { DEPTH_PER_SCREEN_UNIT } from './camera/isoMath';

/** After an idle gap, the first frame shouldn't jump most of the way to the goal. */
const MAX_FRAME_SECONDS = 1 / 30;

/** Connects input and store state to the camera, and drives per-frame easing and fog. */
export function CameraRig({ view }: { view: IsoCamera }) {
  const canvas = useThree((state) => state.gl.domElement);
  const gl = useThree((state) => state.gl);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const invalidate = useThree((state) => state.invalidate);
  const fog = useRef<Fog>(null);

  useEffect(() => {
    view.setAspect(width / height);
    invalidate();
  }, [view, width, height, invalidate]);

  useEffect(
    () => attachControls(canvas, view, invalidate, (steps) => useMapStore.getState().rotate(steps)),
    [canvas, view, invalidate],
  );

  useEffect(
    () =>
      useMapStore.subscribe((state, previous) => {
        if (state.rotationSteps === previous.rotationSteps) return;
        view.setRotationSteps(state.rotationSteps);
        invalidate();
      }),
    [view, invalidate],
  );

  // A dev-only handle for browser tests and measuring performance.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __map: { view, renderer: gl, invalidate } });
  }, [view, gl, invalidate]);

  useFrame((_, delta) => {
    if (view.update(Math.min(delta, MAX_FRAME_SECONDS))) invalidate();

    // An orthographic camera has no perspective, so scale the fog with the zoom:
    // the same share of the screen fades at every zoom level.
    if (fog.current) {
      const perFraction = view.viewHeight * DEPTH_PER_SCREEN_UNIT;
      fog.current.near = CAMERA_DISTANCE + theme.fog.nearFraction * perFraction;
      fog.current.far = CAMERA_DISTANCE + theme.fog.farFraction * perFraction;
    }
  });

  return <fog ref={fog} attach="fog" args={[theme.background, 1, 2]} />;
}
