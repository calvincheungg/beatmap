# Toronto Live Music Map

A stylized isometric 3D map of Toronto, built with React, Three.js (React Three Fiber) and TypeScript, for showing live music events.

**Status: Milestone 2.** The GTA, covering Mississauga, Brampton, Vaughan, Markham, Pickering and Toronto, with level of detail, tiles that load as you move, place names, isometric and flat views, neighbourhood search and a side panel. Venue pins and touch pinch zoom come next.

## Run it

Requires Node 20 or later.

```bash
npm install
brew install pmtiles    # or use a binary from github.com/protomaps/go-pmtiles/releases
npm run data:fetch      # creates public/data/gta.pmtiles
npm run dev             # http://localhost:5173
```

To try it without downloading anything, read directly from the public build:

```bash
VITE_PMTILES_URL=https://build.protomaps.com/20261106.pmtiles npm run dev
```

This is for local development only: it loads more slowly, the build eventually gets deleted, and it only works on the default port 5173 because of the server's CORS rules.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run typecheck` | Run the TypeScript type check |
| `npm run lint` | Run ESLint |
| `npm test` | Run the unit tests |
| `npm run build` | Type check and build for production |

**Controls:** drag to pan, scroll or trackpad-pinch to zoom, Q/E or the on-screen buttons to rotate, F or the FLAT/ISO button to switch views, L or the NAMES button to show or hide place names. Add `?stats` to the URL in development for a frame time overlay.

## Map data

All map features come from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, licensed under the ODbL. The attribution on screen is required, so keep it if you restyle the app.

The data is packaged by [Protomaps](https://protomaps.com) as vector tiles in a single PMTiles file. The browser fetches only the tiles it needs using HTTP range requests.

Protomaps builds also include some non-OSM data. The app doesn't draw the `landcover` layer and never loads tiles below zoom 10.

### Regenerate or replace the data

```bash
npm run data:fetch                         # Mississauga and Brampton to Pickering
npm run data:fetch -- downtown             # Downtown only: public/data/downtown.pmtiles
BUILD=20261201 npm run data:fetch          # A specific daily build
```

Builds are listed at <https://maps.protomaps.com/builds/>, and older ones get removed. To change the area, edit the bounding box in [scripts/fetch-data.sh](scripts/fetch-data.sh) and `MAP_BOUNDS` in [src/config.ts](src/config.ts).

To use a file with another name or location, set `VITE_PMTILES_URL` (see [.env.example](.env.example)). A production host must support HTTP range requests.

To use something other than PMTiles, implement the `TileSource` interface in [src/data/tileSource.ts](src/data/tileSource.ts). It has to return vector tiles that follow the [Protomaps schema](https://docs.protomaps.com/basemaps/layers).

### Building heights

Heights come from the tiles, which convert `building:levels` to `levels × 3 + 2` metres and drop the raw level count. Buildings with no height information get 7 m (2 levels at 3.5 m). Getting exactly 3.5 m per level would require building custom tiles.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/theme.ts` | All colours, fonts, sizes and the layer draw order |
| `src/config.ts` | Loaded area, tile zoom and data URL |
| `src/map/` | Plain TypeScript: projection, camera maths, geometry builders, labels, tile loading in web workers |
| `src/data/` | Tile sources, plus neighbourhoods and mock venues |
| `src/scene/` | React Three Fiber components, plus the isometric camera and controls |
| `src/ui/` | HTML interface and CSS |
| `src/state/` | Zustand store |

See [CLAUDE.md](CLAUDE.md) for the project rules.
