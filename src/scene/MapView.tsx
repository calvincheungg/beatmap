import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createMap } from './createMap';
import { attachKeyboard } from './keyboard';

/** The map itself is plain TypeScript. React only gives it a place on the page. */
export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const removeMap = createMap(container.current!);
    const removeKeyboard = attachKeyboard();
    return () => {
      removeKeyboard();
      removeMap();
    };
  }, []);

  return <div id="map-root" ref={container} role="img" aria-label="Map of Toronto and the Greater Toronto Area" />;
}
