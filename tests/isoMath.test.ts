import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  cameraDirection,
  FLAT_ELEVATION,
  groundForward,
  groundToScreen,
  ISO_AZIMUTH,
  ISO_ELEVATION,
  ndcToGroundOffset,
  ROTATION_STEP,
} from '../src/map/isoMath';

describe('isometric camera maths', () => {
  it('uses the true isometric elevation', () => {
    expect((ISO_ELEVATION * 180) / Math.PI).toBeCloseTo(35.264, 3);
  });

  it('has a unit camera direction', () => {
    const [x, y, z] = cameraDirection(ISO_AZIMUTH);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
  });

  // The strongest check: project the computed ground point with a real camera
  // and confirm it lands back at the screen position we started from.
  it.each([0, 1, 2, 3])('round-trips through a real camera after %i rotations', (steps) => {
    const azimuth = ISO_AZIMUTH + steps * ROTATION_STEP;
    const viewHeight = 1000;
    const aspect = 1.6;
    const [dx, dy, dz] = cameraDirection(azimuth);
    const camera = new THREE.OrthographicCamera(
      (-viewHeight * aspect) / 2,
      (viewHeight * aspect) / 2,
      viewHeight / 2,
      -viewHeight / 2,
      1,
      10000,
    );
    camera.position.set(dx * 5000, dy * 5000, dz * 5000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const offset = ndcToGroundOffset(0.4, -0.3, viewHeight, aspect, azimuth);
    const projected = new THREE.Vector3(offset.x, 0, offset.z).project(camera);
    expect(projected.x).toBeCloseTo(0.4, 6);
    expect(projected.y).toBeCloseTo(-0.3, 6);
  });

  it('round-trips through a real camera looking straight down', () => {
    const azimuth = 0;
    const [dx, dy, dz] = cameraDirection(azimuth, FLAT_ELEVATION);
    const camera = new THREE.OrthographicCamera(-800, 800, 500, -500, 1, 10000);
    const forward = groundForward(azimuth);
    camera.up.set(forward.x, 0, forward.z);
    camera.position.set(dx * 5000, dy * 5000, dz * 5000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const offset = ndcToGroundOffset(0.4, -0.3, 1000, 1.6, azimuth, FLAT_ELEVATION);
    const projected = new THREE.Vector3(offset.x, 0, offset.z).project(camera);
    expect(projected.x).toBeCloseTo(0.4, 6);
    expect(projected.y).toBeCloseTo(-0.3, 6);
    // North (-z) is up the screen on the flat map.
    expect(new THREE.Vector3(0, 0, -100).project(camera).y).toBeGreaterThan(0);
  });

  it('groundToScreen undoes ndcToGroundOffset', () => {
    const offset = ndcToGroundOffset(0.5, 0.25, 1000, 2, ISO_AZIMUTH, ISO_ELEVATION);
    const screen = groundToScreen(offset.x, offset.z, ISO_AZIMUTH, ISO_ELEVATION);
    expect(screen.x).toBeCloseTo(500, 6);
    expect(screen.y).toBeCloseTo(125, 6);
  });
});
