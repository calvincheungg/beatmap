/** Every colour and size used by the map. Restyle the app from this file. */

export type LayerId = 'land' | 'water' | 'park' | 'roadsMajor' | 'roadsMinor' | 'buildings' | 'edges';

/** The palette shared by the map and the UI. See the gig-poster-ui skill. */
const palette = {
  paper: 0xf2ebdd,
  paperDark: 0x1b1a17,
  ink: 0x141414,
  risoRed: 0xe3412b,
  risoBlue: 0x2f5ba8,
  risoGreen: 0x3e8e5e,
  fade: 0x8a8274,
};

export const theme = {
  background: palette.ink,

  colors: {
    land: palette.paperDark,
    water: palette.risoBlue,
    park: palette.risoGreen,
    // Ink roads wouldn't show on dark paper, so night mode prints them in paper tones.
    roadsMajor: palette.paper,
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
    },
    fontFamily: "'Space Mono', 'IBM Plex Mono', monospace",
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
    /** Faded paper tones. A building's colour is chosen from its height. */
    palette: [0xdcd4c4, 0xd2c9b7, 0xc8bfad, 0xd7cebc, 0xcdc4b2, 0xc3baa8, 0xd0c8b8],
    /** Roofs are multiplied by this so they read apart from the walls. */
    roofTint: 1,
    /** Used when a building has no height. Tagged levels are already converted by the tiles. */
    metresPerLevel: 3.5,
    defaultLevels: 2,
    edgeColor: palette.ink,
    edgeOpacity: 0.9,
    /** Edge lines are hidden above this view height (metres) to avoid shimmer. */
    edgeMaxViewHeight: 4500,
  },

  light: {
    // Neutral light that leaves roofs near full paper colour and darkens one side of each building.
    ambientColor: 0xffffff,
    ambientIntensity: 1.6,
    directionalColor: 0xffffff,
    directionalIntensity: 2,
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
