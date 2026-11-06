# Toronto Live Music Map

## Overview
A web app showing Toronto/GTA live music events on a stylized isometric 3D map.
Current phase: map only, with mock venue pins (pins not built yet). Milestones 1 to 3 are done, rebuilt on MapLibre.

## Stack
- Vite, React, TypeScript (strict), MapLibre GL JS, PMTiles, Zustand, Vitest.
- TypeScript is pinned to 6.0 because `typescript-eslint` doesn't support 7 yet.
- Map data: OpenStreetMap only, never Google Maps data or tiles. Protomaps builds
  also contain Natural Earth data, so don't add layers or zooms that rely on it.
- Always keep the "© OpenStreetMap contributors" attribution visible.

## Commands
```bash
npm run dev                      # dev server, http://localhost:5173
npm run build                    # type check + production build
npm run typecheck                # type check only
npm run lint                     # ESLint
npm test                         # unit tests (Vitest)
npm run data:fetch               # regenerate public/data/gta.pmtiles (needs pmtiles CLI)
npm run data:fetch -- downtown   # downtown extract only
npm run data:geocode             # fill in lat/lon for new venues in the CSV
```

## Architecture
| Path | Contents |
|---|---|
| `src/map/mapStyle.ts` | The whole MapLibre style, built from the theme: layers, road colours, labels |
| `src/map/view.ts` | Isometric and flat camera angles, boundary clamp |
| `src/map/halftone.ts` | Printed dot patterns for water and parks |
| `src/scene/createMap.ts` | Creates the map and connects it to the store (plain TS) |
| `src/scene/venueLayer.ts` | Venue pins as map layers, with hover and selection |
| `src/scene/MapView.tsx` | The React component that hosts the map |
| `src/ui/` | HTML interface, `tokens.ts` (theme to CSS variables), `style.css` |
| `src/state/mapStore.ts` | Zustand store: view options, selection, fly requests, load state |
| `src/data/toronto_music_venues.csv` | The only venue list. The app reads it directly |
| `src/data/` | Venue and neighbourhood loaders; `neighbourhoods.json` is the base search list |
| `src/theme.ts` | All colours, fonts and sizes |
| `src/config.ts` | Map boundary, starting point, data URL |
| `tests/` | Unit tests |
| `scripts/fetch-data.sh` | Generates map extracts |

Heights come from the tiles (`levels × 3 + 2` m); buildings with no height get 7 m.

MapLibre's worker must stay imported with `?worker&url` in `createMap.ts`, or production builds break.
The Three.js version is kept at the git tag `three-js-version`.

## Performance rules (non-negotiable)
- Never one React component or DOM marker per building, road, park or venue. Draw map
  features through style layers.
- Keep the map outside React state. Components talk to it through the store, and map events
  update the store only on real changes, never every frame.
- Remove the map and its listeners on unmount.
- Target 60 fps on a mid-range laptop. Report frame rate and draw calls after rendering changes.

## Design system rules
- The UI has a deliberate retro style (see Design direction).
- All colours, fonts, spacing, borders and shadows come from `src/theme.ts` through
  `src/ui/tokens.ts`. No hard-coded colours or one-off styles in components.
- Avoid the generic "AI app" look: no default Tailwind/shadcn styling, no purple
  gradients, no glassmorphism, no rounded-everything cards, no generic
  sans-serif-only typography.
- Map styling and UI styling share the same palette.

## Design direction
<!-- PLACEHOLDER: to be filled in by Calvin: exact retro style, fonts, reference images. -->
**Not yet defined.** Ask before making significant visual decisions.

## Coding conventions
- TypeScript strict, no `any`.
- Small, focused modules. Named exports.
- Tests for the map style, camera angles and data parsing.
- Descriptive commit messages. No Claude attribution or co-author lines.

## Workflow
- Non-trivial changes: propose a short plan first and wait for OK.
- After changes: run type check, lint and tests, then take at most one low-resolution
  screenshot. Only do more if something looks wrong or the change is risky, and say what
  wasn't checked. Summarize what changed and what to look at.
- Ask before adding dependencies or changing the data pipeline.

## Don'ts
- Don't scrape Facebook, Instagram or any site whose terms forbid it.
- Don't commit large map data files; document how to regenerate them.
- Don't hard-code API keys. Use `.env` and keep it out of git.
