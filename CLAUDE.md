# Toronto Live Music Map

## Overview
A web app showing Toronto/GTA live music events on a stylized isometric 3D map.
Current phase: map only, with mock venue pins (pins not built yet).

## Stack
- Vite, React, TypeScript (strict), Three.js via React Three Fiber + drei, Zustand, Vitest.
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
```

## Architecture
| Path | Contents |
|---|---|
| `src/map/` | Plain TS, no React: projection, geometry, tile loading |
| `src/map/projection.ts` | The only place that converts lat/lon to scene coordinates |
| `src/map/layers/` | Tile features to merged geometry, per layer |
| `src/map/tiles/` | Tile loading: web worker, `tileManager.ts` (mesh lifecycle) |
| `src/map/materials.ts` | Shared materials |
| `src/scene/` | React Three Fiber components: canvas, camera rig, tiles, lights |
| `src/scene/camera/` | Isometric camera maths, camera, input controls (plain TS) |
| `src/ui/` | HTML interface, `tokens.ts` (theme to CSS variables), `style.css` |
| `src/state/mapStore.ts` | Zustand store: rotation, load progress |
| `src/data/` | `TileSource` interface and PMTiles source |
| `src/theme.ts` | All colours, fonts, sizes and layer draw order |
| `src/config.ts` | Loaded area, tile zoom, data URL |
| `tests/` | Unit tests |
| `scripts/fetch-data.sh` | Generates map extracts |

Scene units are about 1 ground metre near the origin. Heights come from the tiles
(`levels × 3 + 2` m); buildings with no height get 7 m.

The canvas uses `frameloop="demand"`: call `invalidate()` after anything that changes the view.

## Performance rules (non-negotiable)
- Never one React component or mesh per building/road/park. Merge geometry per tile
  and layer in plain TS outside React.
- Dispose geometries on tile unload. Share materials across tiles.
- No React state updates inside `useFrame`; per-frame logic stays in `useFrame`.
- Target 60 fps on a mid-range laptop. Report draw calls after rendering changes.

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
- Tests for projection and data parsing.
- Descriptive commit messages.

## Workflow
- Non-trivial changes: propose a short plan first and wait for OK.
- After changes: run type check, lint and tests. Run the dev server and visually check
  in a browser where possible. Summarize what changed and what to look at.
- Ask before adding dependencies or changing the data pipeline.

## Don'ts
- Don't scrape Facebook, Instagram or any site whose terms forbid it.
- Don't commit large map data files; document how to regenerate them.
- Don't hard-code API keys. Use `.env` and keep it out of git.
