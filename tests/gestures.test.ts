import { describe, expect, it } from 'vitest';
import { pinchStep } from '../src/scene/camera/gestures';

describe('pinchStep', () => {
  it('zooms in when fingers spread apart', () => {
    const step = pinchStep({ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 50, y: 0 }, { x: 250, y: 0 });
    expect(step.zoomFactor).toBeCloseTo(0.5);
    expect(step.panX).toBeCloseTo(0);
    expect(step.middle).toEqual({ x: 150, y: 0 });
  });

  it('zooms out when fingers pinch together', () => {
    expect(pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 25, y: 0 }, { x: 75, y: 0 }).zoomFactor).toBeCloseTo(2);
  });

  it('pans without zooming when both fingers move together', () => {
    const step = pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 10, y: 20 }, { x: 110, y: 20 });
    expect(step.zoomFactor).toBeCloseTo(1);
    expect(step.panX).toBeCloseTo(10);
    expect(step.panY).toBeCloseTo(20);
  });

  it('does not divide by zero when fingers touch', () => {
    expect(pinchStep({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }).zoomFactor).toBe(1);
  });
});
