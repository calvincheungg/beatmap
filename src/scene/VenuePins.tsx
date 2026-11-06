import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { venues } from '../data/venues';
import { lonLatToScene } from '../map/projection';
import { useMapStore } from '../state/mapStore';
import { theme } from '../theme';
import type { IsoCamera } from './camera/isoCamera';
import { createPinGeometry } from './pinGeometry';

/** Ink outline thickness, as a fraction of the pin's height. */
const OUTLINE_GROW = 0.05;
/** Pointer travel (pixels) above which a press counts as a drag, not a click. */
const CLICK_MAX_TRAVEL = 4;

const positions = venues.map((venue) => lonLatToScene(venue));

/** All venue pins, drawn as one instanced mesh plus one for their outlines. */
export function VenuePins({ view }: { view: IsoCamera }) {
  const canvas = useThree((state) => state.gl.domElement);
  const screenHeight = useThree((state) => state.size.height);
  const invalidate = useThree((state) => state.invalidate);

  const hoveredId = useMapStore((state) => state.hoveredVenueId);
  const selectedId = useMapStore((state) => state.selectedVenueId);
  const setHoveredVenue = useMapStore((state) => state.setHoveredVenue);
  const selectVenue = useMapStore((state) => state.selectVenue);

  const pins = useRef<THREE.InstancedMesh>(null);
  const outlines = useRef<THREE.InstancedMesh>(null);
  const lastScale = useRef(0);

  const { geometry, outlineGeometry, material, outlineMaterial } = useMemo(() => {
    // Transparent materials draw after the map's edge lines. Ignoring depth keeps pins in front of buildings.
    const shared = { depthTest: false, depthWrite: false, transparent: true, fog: false };
    return {
      geometry: createPinGeometry(),
      outlineGeometry: createPinGeometry(OUTLINE_GROW),
      material: new THREE.MeshBasicMaterial({ ...shared, color: 0xffffff }),
      outlineMaterial: new THREE.MeshBasicMaterial({ ...shared, color: theme.pins.outlineColor }),
    };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      outlineGeometry.dispose();
      material.dispose();
      outlineMaterial.dispose();
    },
    [geometry, outlineGeometry, material, outlineMaterial],
  );

  // Hover and selection change colour and size. Forcing lastScale to 0 rebuilds the matrices next frame.
  useEffect(() => {
    const mesh = pins.current;
    if (!mesh) return;
    const color = new THREE.Color();
    venues.forEach((venue, index) => {
      if (venue.id === selectedId) color.set(theme.pins.selectedColor);
      else if (venue.id === hoveredId) color.set(theme.pins.hoverColor);
      else color.set(theme.pins.color);
      mesh.setColorAt(index, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    lastScale.current = 0;
    canvas.classList.toggle('over-pin', hoveredId !== null);
    invalidate();
  }, [hoveredId, selectedId, canvas, invalidate]);

  // Keep pins the same size on screen as the zoom changes.
  useFrame(() => {
    const mesh = pins.current;
    const outlineMesh = outlines.current;
    if (!mesh || !outlineMesh) return;
    const scale = (view.viewHeight / screenHeight) * theme.pins.heightPixels;
    if (scale === lastScale.current) return;
    lastScale.current = scale;

    const matrix = new THREE.Matrix4();
    venues.forEach((venue, index) => {
      const position = positions[index]!;
      const isActive = venue.id === hoveredId || venue.id === selectedId;
      const size = scale * (isActive ? theme.pins.hoverScale : 1);
      matrix.makeScale(size, size, size).setPosition(position.x, 0, position.z);
      mesh.setMatrixAt(index, matrix);
      outlineMesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    outlineMesh.instanceMatrix.needsUpdate = true;
    // Raycasting checks this first, so it has to follow the new sizes.
    mesh.computeBoundingSphere();
  });

  const onMove = (event: ThreeEvent<PointerEvent>) => {
    const venue = venues[event.instanceId ?? -1];
    if (venue && venue.id !== hoveredId) setHoveredVenue(venue.id);
  };

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    const venue = venues[event.instanceId ?? -1];
    if (venue && event.delta <= CLICK_MAX_TRAVEL) selectVenue(venue, { fly: false });
  };

  const labelled = venues.find((venue) => venue.id === (hoveredId ?? selectedId));
  const labelPosition = labelled ? lonLatToScene(labelled) : null;

  return (
    <>
      <instancedMesh
        ref={outlines}
        args={[outlineGeometry, outlineMaterial, venues.length]}
        frustumCulled={false}
        renderOrder={theme.pins.renderOrder}
        raycast={() => null}
      />
      <instancedMesh
        ref={pins}
        args={[geometry, material, venues.length]}
        frustumCulled={false}
        renderOrder={theme.pins.renderOrder + 1}
        onPointerMove={onMove}
        onPointerOut={() => setHoveredVenue(null)}
        onClick={onClick}
      />
      {labelled && labelPosition && (
        <Html position={[labelPosition.x, 0, labelPosition.z]} center zIndexRange={[0, 0]}>
          <div className="pin-label">{labelled.name}</div>
        </Html>
      )}
    </>
  );
}
