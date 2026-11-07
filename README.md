# Toronto Live Music Map

A stylized isometric 3D map of Toronto, built with React, MapLibre GL JS and TypeScript, for showing live music events.

**Status: Milestone 2.** The GTA, covering Mississauga, Brampton, Vaughan, Markham, Pickering and Toronto, with level of detail, tiles that load as you move, street and place names, isometric and flat views, neighbourhood search, a side panel, venue pins and touch controls.

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

**Controls:** drag to pan, scroll or pinch to zoom, hover or click a pin to see a venue, click a numbered stamp to zoom into that group of venues, Q/E or the on-screen buttons to rotate, F or the FLAT/ISO button to switch views, L or the NAMES button to show or hide place names. 

## Map data

All map features come from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, licensed under the ODbL. The attribution on screen is required, so keep it if you restyle the app.

The data is packaged by [Protomaps](https://protomaps.com) as vector tiles in a single PMTiles file. The browser fetches only the tiles it needs using HTTP range requests.

Protomaps builds also include some non-OSM data. The app doesn't draw the `landcover` layer, and its minimum zoom is 9, well above where the Natural Earth water data appears. Map label fonts load from the Protomaps assets site at runtime.

### Regenerate or replace the data

```bash
npm run data:fetch                         # Mississauga and Brampton to Pickering
npm run data:fetch -- downtown             # Downtown only: public/data/downtown.pmtiles
BUILD=20261201 npm run data:fetch          # A specific daily build
```

Builds are listed at <https://maps.protomaps.com/builds/>, and older ones get removed. To change the area, edit the bounding box in [scripts/fetch-data.sh](scripts/fetch-data.sh) and `MAP_BOUNDS` in [src/config.ts](src/config.ts).

To use a file with another name or location, set `VITE_PMTILES_URL` (see [.env.example](.env.example)). A production host must support HTTP range requests.

To use another tile source, change the source in [src/map/mapStyle.ts](src/map/mapStyle.ts). The layers expect vector tiles that follow the [Protomaps schema](https://docs.protomaps.com/basemaps/layers).

### Venues

Venues live in one file, [src/data/toronto_music_venues.csv](src/data/toronto_music_venues.csv), which you can edit in any spreadsheet. The optional `website` column adds a link in the side panel and must start with `http://` or `https://`. To add a venue, add a row without `lat` and `lon`, then fill them in from the address:

```bash
npm run data:geocode
```

This uses OpenStreetMap's Nominatim service and only touches rows missing coordinates. Rows with no coordinates or neighbourhood stay off the map. A neighbourhood not already in [src/data/neighbourhoods.json](src/data/neighbourhoods.json) is added to search automatically.

### Events

Upcoming events come from Ticketmaster's Discovery API and are stored in Supabase. The app reads them directly, so new events appear without a deploy. Without Supabase configured, the app still runs, just without listings.

To set it up:

1. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor. It's safe to run again after it changes.
2. Fill in `.env` from [.env.example](.env.example). `VITE_` values also go in your host's environment settings.
3. Add `TICKETMASTER_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as GitHub repository secrets.

[.github/workflows/refresh-events.yml](.github/workflows/refresh-events.yml) then syncs every 6 hours. To sync by hand:

```bash
npm run data:events
```

Genres come from Ticketmaster too. Search finds genres and sub-genres, and the genre and date filters limit the map and panel to matching shows. Choosing a main genre like Rock includes its sub-genres, like Punk. Placeholder labels like "Other" count as no genre.

Each sync removes upcoming events no longer listed, and deletes events more than 30 days past. A show's `timing` (`upcoming` or `over`) comes from the `events_with_timing` view rather than being stored.

### Building heights

Heights come from the tiles, which convert `building:levels` to `levels × 3 + 2` metres and drop the raw level count. Buildings with no height information get 7 m (2 levels at 3.5 m). Getting exactly 3.5 m per level would require building custom tiles.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/theme.ts` | All colours, fonts and sizes |
| `src/config.ts` | Map boundary, starting point and data URL |
| `src/map/` | The MapLibre style, built from the theme, plus camera angles and halftone patterns |
| `src/scene/` | Creates the map and connects it to the store, venue pins and keyboard |
| `src/data/` | The venue CSV and neighbourhoods |
| `src/ui/` | HTML interface and CSS |
| `src/state/` | Zustand store |

The version built on Three.js, with true orthographic isometric and ink building outlines, is kept at the git tag `three-js-version`.

See [CLAUDE.md](CLAUDE.md) for the project rules.
