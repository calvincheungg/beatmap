import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cameraDirection, ISO_AZIMUTH, ISO_ELEVATION, ndcToGroundOffset, ROTATION_STEP } from '../src/scene/camera/isoMath';

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
});
