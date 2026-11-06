import type { IsoCamera } from './isoCamera';

const WHEEL_ZOOM_SPEED = 0.0015;
/** Trackpad pinches report small wheel deltas, so they get a stronger response. */
const PINCH_ZOOM_SPEED = 0.01;

/** Drag to pan, scroll to zoom, Q and E to rotate, F for the flat map, L for place names. Returns a function that removes the listeners. */
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
  let dragging: { pointerId: number; x: number; y: number } | undefined;

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (dragging) return;
      canvas.setPointerCapture(event.pointerId);
      dragging = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.classList.add('dragging');
    },
    { signal },
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      view.panByPixels(event.clientX - dragging.x, event.clientY - dragging.y, canvas.clientHeight);
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      onInput();
    },
    { signal },
  );

  const endDrag = (event: PointerEvent) => {
    if (dragging?.pointerId !== event.pointerId) return;
    dragging = undefined;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag, { signal });
  canvas.addEventListener('pointercancel', endDrag, { signal });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const speed = event.ctrlKey ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED;
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      view.zoomAt(Math.exp(event.deltaY * speed), ndcX, ndcY);
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
