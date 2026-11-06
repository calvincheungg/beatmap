import type { ScenePoint } from '../../map/projection';

/** True isometric elevation: atan(1/sqrt(2)), about 35.264 degrees. */
export const ISO_ELEVATION = Math.atan(Math.SQRT1_2);

/** Default azimuth, and the size of one rotation step. */
export const ISO_AZIMUTH = Math.PI / 4;
export const ROTATION_STEP = Math.PI / 2;

/** Unit vector pointing from the look-at target towards the camera. */
export function cameraDirection(azimuth: number): [number, number, number] {
  const c = Math.cos(ISO_ELEVATION);
  return [c * Math.sin(azimuth), Math.sin(ISO_ELEVATION), c * Math.cos(azimuth)];
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
): ScenePoint {
  const right = (ndcX * viewHeight * aspect) / 2;
  const forward = (ndcY * viewHeight) / 2 / Math.sin(ISO_ELEVATION);
  const sin = Math.sin(azimuth);
  const cos = Math.cos(azimuth);
  return {
    x: right * cos - forward * sin,
    z: -right * sin - forward * cos,
  };
}

/** How much further from the camera a ground point is, per unit it sits higher on screen. */
export const DEPTH_PER_SCREEN_UNIT = 1 / Math.tan(ISO_ELEVATION);
