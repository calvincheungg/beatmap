import type { ScenePoint } from './projection';

/** True isometric elevation: atan(1/sqrt(2)), about 35.264 degrees. */
export const ISO_ELEVATION = Math.atan(Math.SQRT1_2);
/** The flat map looks straight down. */
export const FLAT_ELEVATION = Math.PI / 2;

/** Default azimuths. The flat map keeps north up. */
export const ISO_AZIMUTH = Math.PI / 4;
export const FLAT_AZIMUTH = 0;
export const ROTATION_STEP = Math.PI / 2;

/** Unit vector pointing from the look-at target towards the camera. */
export function cameraDirection(azimuth: number, elevation: number = ISO_ELEVATION): [number, number, number] {
  const c = Math.cos(elevation);
  return [c * Math.sin(azimuth), Math.sin(elevation), c * Math.cos(azimuth)];
}

/** The ground direction that points up the screen. */
export function groundForward(azimuth: number): ScenePoint {
  return { x: -Math.sin(azimuth), z: -Math.cos(azimuth) };
}

/**
 * Ground offset from the target for a position on screen, in normalised device
 * coordinates (-1..1, +y up). A vertical screen distance covers more ground
 * than a horizontal one because the ground is foreshortened by sin(elevation).
 */
export function ndcToGroundOffset(
  ndcX: number,
  ndcY: number,
  viewHeight: number,
  aspect: number,
  azimuth: number,
  elevation: number = ISO_ELEVATION,
): ScenePoint {
  const right = (ndcX * viewHeight * aspect) / 2;
  const forward = (ndcY * viewHeight) / 2 / Math.sin(elevation);
  const sin = Math.sin(azimuth);
  const cos = Math.cos(azimuth);
  return {
    x: right * cos - forward * sin,
    z: -right * sin - forward * cos,
  };
}

/** Where a ground offset from the target lands on screen, in scene units from screen centre (+y up). */
export function groundToScreen(dx: number, dz: number, azimuth: number, elevation: number): { x: number; y: number } {
  const sin = Math.sin(azimuth);
  const cos = Math.cos(azimuth);
  return {
    x: dx * cos - dz * sin,
    y: (-dx * sin - dz * cos) * Math.sin(elevation),
  };
}

/** How much further from the camera a ground point is, per unit it sits higher on screen. */
export function depthPerScreenUnit(elevation: number): number {
  return Math.cos(elevation) / Math.sin(elevation);
}
