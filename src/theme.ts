/** Every colour and size used by the map. Restyle the app from this file. */

export type LayerId = 'land' | 'water' | 'park' | 'roadsMajor' | 'roadsMinor' | 'buildings' | 'edges';

/** The palette shared by the map and the UI. */
const palette = {
  night: 0x090e1c,
  navy: 0x18213a,
  deepBlue: 0x0c2f63,
  mutedGreen: 0x2b4b3c,
  softGrey: 0x8d92a3,
  slate: 0x596074,
  paper: 0xe7e9f2,
  coral: 0xffb4a8,
};

export const theme = {
  background: palette.night,

  colors: {
    land: palette.navy,
    water: palette.deepBlue,
    park: palette.mutedGreen,
    roadsMajor: palette.softGrey,
    roadsMinor: palette.slate,
  },

  /** Applied to the page as CSS variables by src/ui/tokens.ts. */
  ui: {
    colors: {
      page: palette.night,
      panel: palette.navy,
      border: palette.slate,
      text: palette.paper,
      muted: palette.softGrey,
      error: palette.coral,
    },
    /** A placeholder until the retro fonts are chosen. */
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: '13px',
    smallFontSize: '12px',
    iconSize: '20px',
    spacing: '8px',
    gutter: '16px',
    controlSize: '44px',
    borderWidth: '1px',
    /** Keeps the rotate buttons clear of the attribution line. */
    controlsBottom: '44px',
  },

  /** Draw order, lowest first. Reorder these values to change the layer stack. */
  renderOrder: {
    land: 0,
    water: 1,
    park: 2,
    roadsMinor: 3,
    roadsMajor: 4,
    buildings: 5,
    edges: 6,
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
    /** Warm, low-saturation tones. A building's colour is chosen from its height. */
    palette: [0x9c8a80, 0x8a7a76, 0xa8958a, 0x7f7472, 0x94857f, 0xa08c7a, 0x8c8079],
    /** Roofs are multiplied by this so they read apart from the walls. */
    roofTint: 0.9,
    /** Used when a building has no height. Tagged levels are already converted by the tiles. */
    metresPerLevel: 3.5,
    defaultLevels: 2,
    edgeColor: 0x241f2b,
    edgeOpacity: 0.45,
    /** Edge lines are hidden above this view height (metres) to avoid shimmer. */
    edgeMaxViewHeight: 4500,
  },

  light: {
    ambientColor: 0x8f9bc4,
    ambientIntensity: 1.15,
    directionalColor: 0xffe6c8,
    directionalIntensity: 1.5,
    direction: [-0.55, 0.8, 0.35] as const,
  },

  /** Fog starts and ends at these fractions of the view height above screen centre. */
  fog: {
    nearFraction: 0.1,
    farFraction: 1.0,
  },

  camera: {
    minViewHeight: 250,
    maxViewHeight: 9000,
    initialViewHeight: 2600,
    /** Higher is snappier. Used for zoom, rotate and fly-to easing. */
    damping: 10,
  },
};
