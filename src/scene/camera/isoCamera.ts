import * as THREE from 'three';
import type { ScenePoint } from '../../map/projection';
import { theme } from '../../theme';
import { cameraDirection, ISO_AZIMUTH, ndcToGroundOffset, ROTATION_STEP } from './isoMath';

/** Far enough that nothing crosses the near plane, in scene units. */
export const CAMERA_DISTANCE = 150000;

const SETTLED = 1e-3;

export interface SceneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Isometric orthographic camera. Holds the current view and a goal view, and
 * eases one towards the other. Zoom is the visible height in scene units.
 */
export class IsoCamera {
  private target: ScenePoint = { x: 0, z: 0 };
  private goalTarget: ScenePoint = { x: 0, z: 0 };
  private azimuth = ISO_AZIMUTH;
  private goalAzimuth = ISO_AZIMUTH;
  private height = theme.camera.initialViewHeight;
  private goalHeight = theme.camera.initialViewHeight;
  private aspect = 1;

  constructor(
    readonly camera: THREE.OrthographicCamera,
    private readonly bounds: SceneBounds,
  ) {
    camera.near = 1;
    camera.far = CAMERA_DISTANCE * 2;
    this.apply();
  }

  get viewHeight(): number {
    return this.height;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.apply();
  }

  /** Moves the map with the pointer, by a drag measured in device-independent pixels. */
  panByPixels(dx: number, dy: number, canvasHeight: number): void {
    const ndcX = (-dx / canvasHeight) * (2 / this.aspect);
    const ndcY = (dy / canvasHeight) * 2;
    const offset = ndcToGroundOffset(ndcX, ndcY, this.height, this.aspect, this.azimuth);
    this.target = this.clamp({ x: this.target.x + offset.x, z: this.target.z + offset.z });
    this.goalTarget = this.clamp({ x: this.goalTarget.x + offset.x, z: this.goalTarget.z + offset.z });
    this.apply();
  }

  /** Zooms by a factor while keeping the ground under the given screen position in place. */
  zoomAt(factor: number, ndcX: number, ndcY: number): void {
    const { minViewHeight, maxViewHeight } = theme.camera;
    const before = this.goalHeight;
    this.goalHeight = THREE.MathUtils.clamp(before * factor, minViewHeight, maxViewHeight);
    const offset = ndcToGroundOffset(ndcX, ndcY, 1, this.aspect, this.goalAzimuth);
    const change = before - this.goalHeight;
    this.goalTarget = this.clamp({
      x: this.goalTarget.x + offset.x * change,
      z: this.goalTarget.z + offset.z * change,
    });
  }

  /** Sets the goal rotation, as a total number of 90 degree steps from the default view. */
  setRotationSteps(steps: number): void {
    this.goalAzimuth = ISO_AZIMUTH + steps * ROTATION_STEP;
  }

  /** Eases towards the goal view. Returns true if the view changed. */
  update(dt: number): boolean {
    const t = 1 - Math.exp(-theme.camera.damping * dt);
    const moving =
      Math.abs(this.goalHeight - this.height) > SETTLED * this.height ||
      Math.abs(this.goalAzimuth - this.azimuth) > SETTLED ||
      Math.hypot(this.goalTarget.x - this.target.x, this.goalTarget.z - this.target.z) > SETTLED * this.height;

    if (!moving) {
      if (this.height === this.goalHeight && this.azimuth === this.goalAzimuth) return false;
      this.height = this.goalHeight;
      this.azimuth = this.goalAzimuth;
      this.target = { ...this.goalTarget };
    } else {
      this.height += (this.goalHeight - this.height) * t;
      this.azimuth += (this.goalAzimuth - this.azimuth) * t;
      this.target.x += (this.goalTarget.x - this.target.x) * t;
      this.target.z += (this.goalTarget.z - this.target.z) * t;
    }
    this.apply();
    return true;
  }

  private clamp({ x, z }: ScenePoint): ScenePoint {
    return {
      x: THREE.MathUtils.clamp(x, this.bounds.minX, this.bounds.maxX),
      z: THREE.MathUtils.clamp(z, this.bounds.minZ, this.bounds.maxZ),
    };
  }

  private apply(): void {
    const [dx, dy, dz] = cameraDirection(this.azimuth);
    this.camera.position.set(
      this.target.x + dx * CAMERA_DISTANCE,
      dy * CAMERA_DISTANCE,
      this.target.z + dz * CAMERA_DISTANCE,
    );
    this.camera.lookAt(this.target.x, 0, this.target.z);
    const halfHeight = this.height / 2;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.left = -halfHeight * this.aspect;
    this.camera.right = halfHeight * this.aspect;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
}
