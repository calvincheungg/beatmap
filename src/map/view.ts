import type { LonLatBounds } from '../config';
import { theme } from '../theme';

const ISO_START_BEARING = -45;
const FLAT_START_BEARING = 0;
const ROTATION_STEP = 90;

export interface ViewAngles {
  bearing: number;
  pitch: number;
}

/** The camera angles for a view. The flat map starts north-up and looks straight down. */
export function viewAngles(flat: boolean, rotationSteps: number): ViewAngles {
  return {
    bearing: (flat ? FLAT_START_BEARING : ISO_START_BEARING) - rotationSteps * ROTATION_STEP,
    pitch: flat ? 0 : theme.camera.isoPitch,
  };
}

/** Holds a coordinate inside the bounds. */
export function clampToBounds(lon: number, lat: number, bounds: LonLatBounds): { lon: number; lat: number } {
  return {
    lon: Math.min(Math.max(lon, bounds.west), bounds.east),
    lat: Math.min(Math.max(lat, bounds.south), bounds.north),
  };
}
