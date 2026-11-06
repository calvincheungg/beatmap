import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const HEAD_RADIUS = 0.3;
const HEAD_HEIGHT = 0.72;
const STEM_RADIUS = 0.1;

/** A push-pin one unit tall, with its tip at the origin. `grow` thickens it, for the ink outline. */
export function createPinGeometry(grow = 0): THREE.BufferGeometry {
  const head = new THREE.SphereGeometry(HEAD_RADIUS + grow, 16, 12);
  head.translate(0, HEAD_HEIGHT, 0);

  const stem = new THREE.ConeGeometry(STEM_RADIUS + grow, HEAD_HEIGHT, 10);
  stem.rotateX(Math.PI);
  stem.translate(0, HEAD_HEIGHT / 2, 0);

  const pin = mergeGeometries([head, stem])!;
  head.dispose();
  stem.dispose();
  return pin;
}
