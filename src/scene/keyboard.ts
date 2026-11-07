import { useMapStore } from '../state/mapStore';

/** Q and E rotate, F switches to the flat map, L toggles names. Returns a function that removes the listener. */
export function attachKeyboard(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const inList = event.target instanceof Element && event.target.closest('[role="listbox"]');
    if (event.target instanceof HTMLInputElement || inList || event.metaKey || event.ctrlKey) return;
    const store = useMapStore.getState();
    const key = event.key.toLowerCase();
    if (key === 'q') store.rotate(-1);
    else if (key === 'e') store.rotate(1);
    else if (key === 'f') store.toggleFlat();
    else if (key === 'l') store.toggleLabels();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
