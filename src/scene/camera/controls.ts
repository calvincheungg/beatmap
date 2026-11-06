import { pinchStep, type Point } from './gestures';
import type { IsoCamera } from './isoCamera';

const WHEEL_ZOOM_SPEED = 0.0015;
/** Trackpad pinches report small wheel deltas, so they get a stronger response. */
const PINCH_ZOOM_SPEED = 0.01;

/** Drag to pan, pinch or scroll to zoom, Q and E to rotate, F for the flat map, L for place names. Returns a function that removes the listeners. */
export function attachControls(
  canvas: HTMLElement,
  view: IsoCamera,
  onInput: () => void,
  onRotate: (steps: number) => void,
  onToggleFlat: () => void,
  onToggleLabels: () => void,
): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  const pointers = new Map<number, Point>();

  const toNdc = ({ x, y }: Point) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((x - rect.left) / rect.width) * 2 - 1, y: -(((y - rect.top) / rect.height) * 2 - 1) };
  };

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.classList.add('dragging');
    },
    { signal },
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const current = { x: event.clientX, y: event.clientY };

      if (pointers.size === 1) {
        view.panByPixels(current.x - previous.x, current.y - previous.y, canvas.clientHeight);
      } else {
        // The other finger hasn't moved in this event, so each event is one step of the gesture.
        const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)![1];
        const step = pinchStep(previous, other, current, other);
        view.panByPixels(step.panX, step.panY, canvas.clientHeight);
        const middle = toNdc(step.middle);
        view.zoomAt(step.zoomFactor, middle.x, middle.y);
      }
      pointers.set(event.pointerId, current);
      onInput();
    },
    { signal },
  );

  const endDrag = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag, { signal });
  canvas.addEventListener('pointercancel', endDrag, { signal });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const speed = event.ctrlKey ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED;
      const cursor = toNdc({ x: event.clientX, y: event.clientY });
      view.zoomAt(Math.exp(event.deltaY * speed), cursor.x, cursor.y);
      onInput();
    },
    { signal, passive: false },
  );

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === 'q') onRotate(-1);
      else if (key === 'e') onRotate(1);
      else if (key === 'f') onToggleFlat();
      else if (key === 'l') onToggleLabels();
    },
    { signal },
  );

  return () => abort.abort();
}
