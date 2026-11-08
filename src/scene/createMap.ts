import { addProtocol, LngLat, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';
import { MAP_BOUNDS, MAP_CENTER, PMTILES_URL } from '../config';
import { halftonePixels } from '../map/halftone';
import { buildMapStyle, LABEL_LAYERS, modePaint, PARK_PATTERN, WATER_PATTERN } from '../map/mapStyle';
import { clampToBounds, viewAngles } from '../map/view';
import { useMapStore } from '../state/mapStore';
import { theme } from '../theme';
import { addVenueLayer } from './venueLayer';

// Vite can't detect MapLibre's worker by itself, which would break production builds.
setWorkerUrl(workerUrl);

// Registered once, so the map can read PMTiles archives. The two libraries' types differ only in how
// they describe the response data, which pmtiles returns in the form MapLibre expects.
addProtocol('pmtiles', new Protocol().tilev4 as unknown as Parameters<typeof addProtocol>[1]);

function addHalftone(map: MapLibreMap, name: string, color: number): void {
  const size = theme.halftone.tileSize;
  map.addImage(name, { width: size, height: size, data: halftonePixels(color) });
}

/** Creates the map, connects it to the store and returns a function that tears it all down. */
export function createMap(container: HTMLElement): () => void {
  const { camera } = theme;
  const initial = useMapStore.getState();
  const startAngles = viewAngles(initial.flat, initial.rotationSteps);
  const absoluteUrl = new URL(PMTILES_URL, location.href).href;

  const map = new MapLibreMap({
    container,
    style: buildMapStyle(absoluteUrl, MAP_BOUNDS, initial.mapMode),
    center: [MAP_CENTER.lon, MAP_CENTER.lat],
    zoom: camera.initialZoom,
    minZoom: camera.minZoom,
    maxZoom: camera.maxZoom,
    ...startAngles,
    // Rotation stays in 90 degree steps, through the controls only.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    // Our own attribution line is in src/ui/Attribution.tsx.
    attributionControl: false,
    canvasContextAttributes: { antialias: true },
    // Hold the centre inside the boundary, so the edge can be reached from any angle.
    transformConstrain: (lngLat, zoom) => {
      const { lon, lat } = clampToBounds(lngLat.lng, lngLat.lat, MAP_BOUNDS);
      return {
        center: new LngLat(lon, lat),
        zoom: Math.min(Math.max(zoom, camera.minZoom), camera.maxZoom),
      };
    },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.setVerticalFieldOfView(camera.fieldOfView);

  map.setMissingStyleImageResolver((id) => {
    if (id === WATER_PATTERN) addHalftone(map, id, theme.colors.water);
    if (id === PARK_PATTERN) addHalftone(map, id, theme.colors.park);
  });

  const applyLabels = (show: boolean) => {
    for (const id of LABEL_LAYERS) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
  };

  let stopVenues: (() => void) | undefined;
  // map.isStyleLoaded() reads false whenever tiles are loading, so it can't guard the names toggle.
  let hasLoaded = false;
  map.once('load', () => {
    hasLoaded = true;
    stopVenues = addVenueLayer(map);
    applyLabels(useMapStore.getState().showLabels);
  });
  map.once('idle', () => useMapStore.getState().setLoadState('ready'));
  map.on('error', ({ error }) => {
    console.error(error);
    if (useMapStore.getState().loadState === 'loading') useMapStore.getState().setLoadState('error');
  });

  const stopStore = useMapStore.subscribe((state, previous) => {
    if (state.rotationSteps !== previous.rotationSteps || state.flat !== previous.flat) {
      map.easeTo({ ...viewAngles(state.flat, state.rotationSteps), duration: camera.rotateDuration });
    }
    if (state.showLabels !== previous.showLabels && hasLoaded) applyLabels(state.showLabels);
    // Only the colours that differ change, so the pins and loaded tiles stay put.
    if (state.mapMode !== previous.mapMode && hasLoaded) {
      for (const { layer, property, value } of modePaint(state.mapMode)) map.setPaintProperty(layer, property, value);
    }
    if (state.flyRequest && state.flyRequest !== previous.flyRequest) {
      const { lon, lat, zoom } = state.flyRequest;
      map.flyTo({ center: [lon, lat], zoom, duration: camera.flyDuration });
    }
  });

  // A dev-only handle for browser tests and measuring performance.
  if (import.meta.env.DEV) Object.assign(window, { __map: map });

  return () => {
    stopStore();
    stopVenues?.();
    map.remove();
  };
}
