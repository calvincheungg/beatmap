import { Marker, type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';
import { todayString } from '../data/events';
import { venues } from '../data/venues';
import { useMapStore } from '../state/mapStore';
import { theme, toCssColor } from '../theme';

const SOURCE = 'venues';
/** The same venues without clustering, so a hovered or selected pin always shows. */
const ACTIVE_SOURCE = 'venues-active';
const CLUSTER_LAYER = 'venue-clusters';
const CLUSTER_COUNT_LAYER = 'venue-cluster-counts';
const BASE_LAYER = 'venue-pins';
const HOVER_LAYER = 'venue-pins-hover';
const SELECTED_LAYER = 'venue-pins-selected';
/** Pin images are drawn at twice their display size, so they stay sharp on high density screens. */
const IMAGE_SCALE = 2;

/** A push-pin: a round head on a tapered stem, with an ink outline. */
function drawPin(color: number): ImageData {
  const height = theme.pins.heightPixels * IMAGE_SCALE;
  const width = Math.round(height * 0.7);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const middle = width / 2;
  const radius = width * 0.42;
  const headY = radius + IMAGE_SCALE * 2;

  context.lineWidth = IMAGE_SCALE * 1.5;
  context.strokeStyle = toCssColor(theme.pins.outlineColor);
  context.fillStyle = toCssColor(color);
  context.beginPath();
  context.moveTo(middle, height - IMAGE_SCALE);
  context.lineTo(middle - width * 0.14, headY);
  context.lineTo(middle + width * 0.14, headY);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(middle, headY, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  return context.getImageData(0, 0, width, height);
}

function nothingMatches(): ['==', ['get', string], string] {
  return ['==', ['get', 'id'], ''];
}

/** Adds the pins as map layers, so they scale to many venues. Returns a function to stop updates. */
export function addVenueLayer(map: MapLibreMap): () => void {
  const { pins } = theme;
  map.addImage('pin', drawPin(pins.color), { pixelRatio: IMAGE_SCALE });
  map.addImage('pin-quiet', drawPin(pins.quietColor), { pixelRatio: IMAGE_SCALE });
  map.addImage('pin-hover', drawPin(pins.hoverColor), { pixelRatio: IMAGE_SCALE });
  map.addImage('pin-selected', drawPin(pins.selectedColor), { pixelRatio: IMAGE_SCALE });

  /** Every pin stays red until listings load, or if they can't load. */
  const pinData = () => {
    const { events, eventsLoaded } = useMapStore.getState();
    const withShows = new Set((events ?? []).filter((event) => event.date >= todayString()).map((event) => event.venueId));
    return {
      type: 'FeatureCollection' as const,
      features: venues.map(({ id, name, lat, lon }) => ({
        type: 'Feature' as const,
        properties: { id, name, quiet: eventsLoaded && events !== null && !withShows.has(id) },
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
      })),
    };
  };
  const data = pinData();
  map.addSource(SOURCE, {
    type: 'geojson',
    data,
    cluster: true,
    clusterRadius: pins.clusterRadius,
    clusterMaxZoom: pins.clusterMaxZoom,
  });
  map.addSource(ACTIVE_SOURCE, { type: 'geojson', data });

  const { clusterSizes } = pins;
  map.addLayer({
    id: CLUSTER_LAYER,
    type: 'circle',
    source: SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': toCssColor(pins.color),
      'circle-stroke-color': toCssColor(pins.outlineColor),
      'circle-stroke-width': pins.clusterOutlineWidth,
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        clusterSizes.small,
        clusterSizes.mediumFrom,
        clusterSizes.medium,
        clusterSizes.largeFrom,
        clusterSizes.large,
      ],
    },
  });
  map.addLayer({
    id: CLUSTER_COUNT_LAYER,
    type: 'symbol',
    source: SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': theme.labels.font,
      'text-size': pins.clusterTextSize,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': toCssColor(pins.outlineColor) },
  });

  const addPinLayer = (id: string, image: string, size: number) =>
    map.addLayer({
      id,
      type: 'symbol',
      source: id === BASE_LAYER ? SOURCE : ACTIVE_SOURCE,
      layout: {
        'icon-image': id === BASE_LAYER ? ['case', ['get', 'quiet'], 'pin-quiet', 'pin'] : image,
        'icon-size': size,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
      },
      filter: id === BASE_LAYER ? ['!', ['has', 'point_count']] : nothingMatches(),
    });
  addPinLayer(BASE_LAYER, 'pin', 1);
  addPinLayer(HOVER_LAYER, 'pin-hover', pins.activeScale);
  addPinLayer(SELECTED_LAYER, 'pin-selected', pins.activeScale);

  const canvas = map.getCanvas();
  const venueAt = (event: MapMouseEvent & { features?: { properties: { id?: string } }[] }) =>
    venues.find((venue) => venue.id === event.features?.[0]?.properties.id);

  map.on('mousemove', BASE_LAYER, (event) => {
    const venue = venueAt(event);
    if (venue && useMapStore.getState().hoveredVenueId !== venue.id) useMapStore.getState().setHoveredVenue(venue.id);
  });
  map.on('mouseleave', BASE_LAYER, () => useMapStore.getState().setHoveredVenue(null));
  map.on('click', BASE_LAYER, (event) => {
    const venue = venueAt(event);
    if (venue) useMapStore.getState().selectVenue(venue, { fly: false });
  });

  // Clicking a cluster zooms in far enough to split it apart.
  map.on('click', CLUSTER_LAYER, (event) => {
    const cluster = event.features?.[0];
    const clusterId = cluster?.properties.cluster_id as number | undefined;
    if (clusterId === undefined || cluster?.geometry.type !== 'Point') return;
    const [lon, lat] = cluster.geometry.coordinates as [number, number];
    void (map.getSource(SOURCE) as GeoJSONSource)
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => map.easeTo({ center: [lon, lat], zoom, duration: theme.camera.rotateDuration }));
  });
  let overCluster = false;
  const updateCursor = () => {
    canvas.style.cursor = overCluster || useMapStore.getState().hoveredVenueId ? 'pointer' : '';
  };
  map.on('mouseenter', CLUSTER_LAYER, () => {
    overCluster = true;
    updateCursor();
  });
  map.on('mouseleave', CLUSTER_LAYER, () => {
    overCluster = false;
    updateCursor();
  });

  const labelElement = document.createElement('div');
  labelElement.className = 'pin-label';
  const label = new Marker({
    element: labelElement,
    anchor: 'bottom',
    offset: [0, -(pins.heightPixels * pins.activeScale + pins.labelGap)],
    pitchAlignment: 'viewport',
    rotationAlignment: 'viewport',
  });

  const applySelection = () => {
    const { hoveredVenueId, selectedVenueId } = useMapStore.getState();
    const matchId = (id: string | null) => ['==', ['get', 'id'], id ?? ''] as ['==', ['get', string], string];
    map.setFilter(HOVER_LAYER, matchId(hoveredVenueId));
    map.setFilter(SELECTED_LAYER, matchId(selectedVenueId));
    updateCursor();

    const shown = venues.find((venue) => venue.id === (hoveredVenueId ?? selectedVenueId));
    if (shown) {
      labelElement.textContent = shown.name;
      label.setLngLat([shown.lon, shown.lat]).addTo(map);
    } else {
      label.remove();
    }
  };
  applySelection();

  const stopListening = useMapStore.subscribe((state, previous) => {
    if (state.events !== previous.events) {
      const updated = pinData();
      (map.getSource(SOURCE) as GeoJSONSource).setData(updated);
      (map.getSource(ACTIVE_SOURCE) as GeoJSONSource).setData(updated);
    }
    if (state.hoveredVenueId !== previous.hoveredVenueId || state.selectedVenueId !== previous.selectedVenueId) {
      applySelection();
    }
  });
  return () => {
    stopListening();
    label.remove();
  };
}
