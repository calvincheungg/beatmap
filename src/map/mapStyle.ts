import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { LonLatBounds } from '../config';
import { theme, toCssColor, type MapMode, type WidthStops } from '../theme';

export const SOURCE = 'protomaps';
export const WATER_PATTERN = 'halftone-water';
export const PARK_PATTERN = 'halftone-park';

/** The layers the names setting shows and hides. */
export const LABEL_LAYERS = ['street-names-minor', 'street-names-major', 'place-names'] as const;

export interface ModePaint {
  layer: string;
  property: 'fill-color' | 'fill-extrusion-color' | 'text-color' | 'text-halo-color';
  value: string | ExpressionSpecification;
}

/** The `landuse` kinds drawn as green space. */
const GREEN_KINDS = [
  'park',
  'garden',
  'grass',
  'grassland',
  'wood',
  'forest',
  'scrub',
  'meadow',
  'dog_park',
  'playground',
  'recreation_ground',
  'golf_course',
  'cemetery',
  'nature_reserve',
  'village_green',
  'wetland',
];

const MAJOR_KINDS = ['major_road', 'medium_road'];
const MINOR_KINDS = ['minor_road', 'other'];
const NEIGHBOURHOOD_KINDS = ['neighbourhood', 'macrohood'];
const WATER_LINE_KINDS = ['river', 'canal', 'stream', 'ditch', 'drain'];

function kindIn(kinds: string[]): ExpressionSpecification {
  return ['in', ['get', 'kind'], ['literal', kinds]];
}

/** Keeps the underground PATH network and buried roads and rivers off the street map. */
const NOT_TUNNEL: ExpressionSpecification = ['!=', ['get', 'is_tunnel'], true];

function widthByZoom(stops: WidthStops): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()] as unknown as ExpressionSpecification;
}

function roadLayer(id: string, kinds: string[], color: number, stops: WidthStops, minzoom?: number): LayerSpecification {
  return {
    id,
    type: 'line',
    source: SOURCE,
    'source-layer': 'roads',
    filter: ['all', kindIn(kinds), NOT_TUNNEL],
    ...(minzoom === undefined ? {} : { minzoom }),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': toCssColor(color), 'line-width': widthByZoom(stops) },
  };
}

function streetNameLayer(id: string, kinds: string[], minzoom: number): LayerSpecification {
  const { labels } = theme;
  return {
    id,
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'roads',
    filter: ['all', kindIn(kinds), NOT_TUNNEL, ['has', 'name']],
    minzoom,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-font': labels.font,
      'text-size': labels.streetSize,
      // Lying flat on an angled road makes names hard to read, so keep the letters facing the viewer.
      'text-pitch-alignment': 'viewport',
    },
    paint: { 'text-halo-width': labels.outlineWidth },
  };
}

/** Chooses a grey from the height, so overlapping building parts of equal height match. */
function buildingColor(palette: readonly number[]): ExpressionSpecification {
  const { defaultHeight } = theme.buildings;
  return [
    'to-color',
    [
      'at',
      // A few buildings are mapped with negative heights.
      ['%', ['abs', ['round', ['to-number', ['coalesce', ['get', 'height'], defaultHeight]]]], palette.length],
      ['literal', palette.map(toCssColor)],
    ],
  ] as unknown as ExpressionSpecification;
}

/** Tiles overhang the boundary, so everything beyond it is painted over for a clean edge. */
function outsideBoundary(bounds: LonLatBounds) {
  const { west, south, east, north } = bounds;
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]],
        [[west, south], [west, north], [east, north], [east, south], [west, south]],
      ],
    },
  };
}

/** The paint values that differ between night and day, so a switch can change just these. */
export function modePaint(mode: MapMode): ModePaint[] {
  const { land, buildings, labelFill, labelOutline } = theme.mapModes[mode];
  return [
    { layer: 'land', property: 'fill-color', value: toCssColor(land) },
    { layer: 'buildings', property: 'fill-extrusion-color', value: buildingColor(buildings) },
    ...LABEL_LAYERS.flatMap((layer): ModePaint[] => [
      { layer, property: 'text-color', value: toCssColor(labelFill) },
      { layer, property: 'text-halo-color', value: toCssColor(labelOutline) },
    ]),
  ];
}

/** The whole map style, built from the theme, in night or day colours. */
export function buildMapStyle(pmtilesUrl: string, bounds: LonLatBounds, mode: MapMode = 'night'): StyleSpecification {
  const style = baseStyle(pmtilesUrl, bounds);
  for (const { layer, property, value } of modePaint(mode)) {
    const target = style.layers.find((item) => item.id === layer) as { paint?: Record<string, unknown> } | undefined;
    if (target) target.paint = { ...target.paint, [property]: value };
  }
  return style;
}

function baseStyle(pmtilesUrl: string, bounds: LonLatBounds): StyleSpecification {
  const { colors, roadWidths, waterLineWidths, buildings, labels, light } = theme;

  return {
    version: 8,
    glyphs: labels.glyphs,
    light: {
      anchor: 'map',
      color: toCssColor(light.color),
      intensity: light.intensity,
      position: light.position,
    },
    sources: {
      [SOURCE]: { type: 'vector', url: `pmtiles://${pmtilesUrl}` },
      boundary: { type: 'geojson', data: outsideBoundary(bounds) },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': toCssColor(theme.background) } },
      {
        id: 'land',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'earth',
      },
      {
        id: 'water',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'water',
        // Fill layers close and fill line features too, which would turn rivers into huge shapes.
        filter: ['all', ['!=', ['get', 'kind'], 'reef'], ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]],
        paint: { 'fill-pattern': WATER_PATTERN },
      },
      {
        id: 'water-lines',
        type: 'line',
        source: SOURCE,
        'source-layer': 'water',
        filter: ['all', kindIn(WATER_LINE_KINDS), NOT_TUNNEL],
        paint: { 'line-color': toCssColor(colors.water), 'line-width': widthByZoom(waterLineWidths) },
      },
      {
        id: 'parks',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'landuse',
        filter: kindIn(GREEN_KINDS),
        paint: { 'fill-pattern': PARK_PATTERN },
      },
      roadLayer('roads-minor', MINOR_KINDS, colors.roadsMinor, roadWidths.minor, roadWidths.minorMinZoom),
      roadLayer('roads-major', MAJOR_KINDS, colors.roadsMajor, roadWidths.major),
      roadLayer('roads-highway', ['highway'], colors.roadsHighway, roadWidths.highway),
      {
        id: 'buildings',
        type: 'fill-extrusion',
        source: SOURCE,
        'source-layer': 'buildings',
        minzoom: buildings.minZoom,
        // This layer also holds address points.
        filter: kindIn(['building', 'building_part']),
        paint: {
          'fill-extrusion-height': ['coalesce', ['get', 'height'], buildings.defaultHeight],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          // A flat colour per face, not a soft gradient, keeps the printed look.
          'fill-extrusion-vertical-gradient': false,
        },
      },
      {
        id: 'outside-boundary',
        type: 'fill',
        source: 'boundary',
        paint: { 'fill-color': toCssColor(theme.background) },
      },
      streetNameLayer('street-names-minor', MINOR_KINDS, labels.minorStreetMinZoom),
      streetNameLayer('street-names-major', [...MAJOR_KINDS, 'highway'], labels.majorStreetMinZoom),
      {
        id: 'place-names',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'places',
        filter: [
          'all',
          kindIn(['locality', ...NEIGHBOURHOOD_KINDS]),
          ['>=', ['zoom'], ['coalesce', ['get', 'min_zoom'], 0]],
          ['within', insideBoundary(bounds)],
        ] as unknown as ExpressionSpecification,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': labels.font,
          'text-transform': 'uppercase',
          'text-size': [
            'case',
            ['==', ['get', 'kind'], 'locality'],
            labels.placeSize.locality,
            labels.placeSize.neighbourhood,
          ],
          'symbol-sort-key': ['coalesce', ['get', 'sort_key'], 0],
        },
        paint: { 'text-halo-width': labels.outlineWidth },
      },
    ],
  };
}

function insideBoundary({ west, south, east, north }: LonLatBounds) {
  return {
    type: 'Polygon' as const,
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}
