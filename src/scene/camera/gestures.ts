export interface Point {
  x: number;
  y: number;
}

export interface PinchStep {
  /** The factor to multiply the view height by. Below 1 zooms in. */
  zoomFactor: number;
  /** How far the midpoint moved, in pixels. */
  panX: number;
  panY: number;
  /** The midpoint after the move, to zoom around. */
  middle: Point;
}

/** One step of a two-finger gesture, from the two fingers' previous and current positions. */
export function pinchStep(a0: Point, b0: Point, a1: Point, b1: Point): PinchStep {
  const before = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  const after = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  const middle = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  return {
    zoomFactor: after > 0 && before > 0 ? before / after : 1,
    panX: middle.x - (a0.x + b0.x) / 2,
    panY: middle.y - (a0.y + b0.y) / 2,
    middle,
  };
}
