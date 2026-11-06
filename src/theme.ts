/** Every colour and size used by the map. Restyle the app from this file. */

export interface LodBand {
  maxViewHeight: number;
  tileZoom: number;
  buildings: boolean;
  edges: boolean;
  minorRoads: boolean;
  labels: 'locality' | 'neighbourhood';
  lineScale: number;
}

export type LayerId = 'land' | 'water' | 'park' | 'roadsHighway' | 'roadsMajor' | 'roadsMinor' | 'buildings' | 'edges';

/** The palette shared by the map and the UI. See the gig-poster-ui skill. */
const palette = {
  paper: 0xf2ebdd,
  paperDark: 0x1b1a17,
  ink: 0x141414,
  risoRed: 0xe3412b,
  risoBlue: 0x2f5ba8,
  risoYellow: 0xf2c230,
  risoGreen: 0x3e8e5e,
  highwayOrange: 0xf28c28,
  fade: 0x8a8274,
};

export const theme = {
  background: palette.ink,

  colors: {
    land: palette.paperDark,
    water: palette.risoBlue,
    park: palette.risoGreen,
    roadsHighway: palette.highwayOrange,
    roadsMajor: palette.risoYellow,
    roadsMinor: palette.fade,
  },

  /** Applied to the page as CSS variables by src/ui/tokens.ts. */
  ui: {
    colors: {
      page: palette.paperDark,
      panel: palette.paper,
      border: palette.ink,
      text: palette.ink,
      accent: palette.risoRed,
      tape: palette.risoYellow,
    },
    fontFamily: "'Space Mono', 'IBM Plex Mono', monospace",
    displayFontFamily: "'Anton', 'Bebas Neue', sans-serif",
    headlineSize: '40px',
    panelWidth: '340px',
    edgeSize: '8px',
    motionDuration: '200ms',
    fontSize: '15px',
    smallFontSize: '12px',
    iconSize: '20px',
    spacing: '8px',
    gutter: '16px',
    controlSize: '48px',
    borderWidth: '3px',
    shadowOffset: '4px',
    pressDuration: '120ms',
    /** Keeps the rotate buttons clear of the attribution line. */
    controlsBottom: '48px',
  },

  /** Draw order, lowest first. Reorder these values to change the layer stack. */
  renderOrder: {
    land: 0,
    water: 1,
    park: 2,
    roadsMinor: 3,
    roadsMajor: 4,
    roadsHighway: 5,
    buildings: 6,
    edges: 7,
  } satisfies Record<LayerId, number>,

  /** Ribbon widths in metres, keyed by the Protomaps `kind`. */
  roadWidths: {
    highway: 26,
    major_road: 16,
    medium_road: 12,
    minor_road: 8,
    other: 4,
  } as Record<string, number>,

  waterLineWidths: {
    river: 24,
    canal: 14,
    stream: 5,
    ditch: 2,
    drain: 2,
  } as Record<string, number>,

  buildings: {
    /** Dark greys. A building's colour is chosen from its height. */
    palette: [0x6b6e73, 0x63666b, 0x73767b, 0x5d6065, 0x686b70, 0x6f7277, 0x606368],
    /** Roofs are multiplied by this so they read apart from the walls. */
    roofTint: 1,
    /** Corners next to wall segments shorter than this (metres) get no vertical line, so stepped towers don't go black. */
    minCornerSegment: 6,
    /** Used when a building has no height. Tagged levels are already converted by the tiles. */
    metresPerLevel: 3.5,
    defaultLevels: 2,
    edgeColor: palette.ink,
    edgeOpacity: 0.9,
  },

  light: {
    // Neutral light that leaves roofs near full paper colour and darkens one side of each building.
    ambientColor: 0xffffff,
    ambientIntensity: 1.6,
    directionalColor: 0xffffff,
    directionalIntensity: 2,
    direction: [-0.55, 0.8, 0.35] as const,
  },

  /**
   * Level of detail, most detailed first. The camera uses the first band whose
   * maxViewHeight (metres visible top to bottom) fits. lineScale widens roads and
   * rivers so they stay visible when zoomed out.
   */
  lodBands: [
    { maxViewHeight: 3000, tileZoom: 15, buildings: true, edges: true, minorRoads: true, labels: 'neighbourhood', lineScale: 1 },
    { maxViewHeight: 5000, tileZoom: 14, buildings: true, edges: false, minorRoads: true, labels: 'neighbourhood', lineScale: 1.5 },
    { maxViewHeight: 30000, tileZoom: 12, buildings: false, edges: false, minorRoads: false, labels: 'locality', lineScale: 2.5 },
    { maxViewHeight: Infinity, tileZoom: 11, buildings: false, edges: false, minorRoads: false, labels: 'locality', lineScale: 5 },
  ] satisfies LodBand[],

  /** Tiles start loading this far (metres) below the screen, so tall buildings don't pop in. */
  tallestBuildingMargin: 600,

  /** Printed dots on water and parks. Spacing snaps to powers of two as the zoom changes. */
  halftone: {
    pixelSpacing: 7,
    /** Dot radius, as a fraction of the spacing. */
    radius: 0.2,
    dotColor: palette.ink,
    dotOpacity: 0.28,
  },

  labels: {
    fontFamily: "'Archivo Black', 'Space Mono', sans-serif",
    localitySize: 15,
    neighbourhoodSize: 12,
    fill: palette.paper,
    outline: palette.ink,
    outlineWidth: 3,
    /** Clear space kept around each label, in CSS pixels. */
    padding: 6,
    maxPerFrame: 60,
  },

  /** Fog starts and ends at these fractions of the view height above screen centre. */
  fog: {
    nearFraction: 0.1,
    farFraction: 1.0,
  },

  camera: {
    minViewHeight: 250,
    maxViewHeight: 70000,
    /** Zoom used when flying to a venue from the side panel. */
    venueViewHeight: 900,
    initialViewHeight: 2600,
    /** Higher is snappier. Used for zoom, rotate and fly-to easing. */
    damping: 10,
  },
};
