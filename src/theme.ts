/** Every colour and size used by the map and UI. Restyle the app from this file. */

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
  selectedPurple: 0x7b2fbe,
  fade: 0x8a8274,
};

/** Line widths in pixels at given zooms, interpolated in between. */
export type WidthStops = readonly (readonly [zoom: number, width: number])[];

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
      fade: palette.fade,
    },
    fontFamily: "'Space Mono', 'IBM Plex Mono', monospace",
    displayFontFamily: "'Anton', 'Bebas Neue', sans-serif",
    labelFontFamily: "'Archivo Black', 'Space Mono', sans-serif",
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

  roadWidths: {
    highway: [[9, 1], [12, 2.5], [15, 9], [18, 36]] as WidthStops,
    major: [[10, 0.5], [12, 1.2], [15, 6], [18, 24]] as WidthStops,
    minor: [[12, 0.3], [15, 2.5], [18, 12]] as WidthStops,
    /** The zoom at which minor roads first appear. */
    minorMinZoom: 12,
  },

  waterLineWidths: [[10, 0.5], [15, 4], [18, 14]] satisfies WidthStops,

  buildings: {
    /** Dark greys. A building's colour is chosen from its height. */
    palette: [0x6b6e73, 0x63666b, 0x73767b, 0x5d6065, 0x686b70, 0x6f7277, 0x606368],
    /** The zoom at which buildings first appear. */
    minZoom: 13,
    /** Used when a building has no height. Tagged levels are already converted by the tiles. */
    defaultHeight: 7,
  },

  light: {
    color: 0xffffff,
    intensity: 0.75,
    /** Radial distance, azimuth and polar angle, fixed to the map so rotating changes the lit side. */
    position: [1.5, 300, 35] as [number, number, number],
  },

  /** Printed dots on water and parks, repeated as an image pattern. */
  halftone: {
    tileSize: 8,
    /** Dot radius, as a fraction of the tile. */
    radius: 0.2,
    dotColor: palette.ink,
    dotOpacity: 0.28,
  },

  labels: {
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    font: ['Noto Sans Medium'],
    placeSize: { locality: 15, neighbourhood: 12 },
    streetSize: 11,
    fill: palette.paper,
    outline: palette.ink,
    outlineWidth: 1.5,
    /** Zooms at which street names first appear. */
    majorStreetMinZoom: 13.5,
    minorStreetMinZoom: 15,
  },

  /** Venue push-pins. They stay the same size on screen at every zoom. */
  pins: {
    heightPixels: 34,
    activeScale: 1.3,
    color: palette.risoRed,
    /** Venues with no upcoming shows listed, so active venues stand out. */
    quietColor: palette.fade,
    hoverColor: palette.risoYellow,
    selectedColor: palette.selectedPurple,
    outlineColor: palette.ink,
    /** Space between a pin's top and its name label, in pixels. */
    labelGap: 4,
    /** Nearby pins merge into a numbered stamp until this zoom. */
    /** Space around the pins and the most zoom when the map moves to show a genre's venues. */
    fitPadding: 90,
    fitMaxZoom: 14,
    clusterRadius: 44,
    clusterMaxZoom: 15,
    /** Stamp radius in pixels: small, then larger from these venue counts. */
    clusterSizes: { small: 14, medium: 18, mediumFrom: 5, large: 22, largeFrom: 15 },
    clusterTextSize: 13,
    clusterOutlineWidth: 3,
  },

  camera: {
    minZoom: 9,
    maxZoom: 18,
    initialZoom: 14,
    /** Zoom used when flying to a venue from the side panel. */
    venueZoom: 15.5,
    /** Pitch for true isometric: 90 degrees minus an elevation of 35.264. */
    isoPitch: 54.736,
    /** A narrow field of view keeps parallel lines nearly parallel, close to orthographic. */
    fieldOfView: 10,
    rotateDuration: 300,
    flyDuration: 1200,
  },
};

export function toCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
