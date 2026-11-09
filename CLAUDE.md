# Toronto Live Music Map

## Overview
A web app showing Toronto/GTA live music events on a stylized isometric 3D map.
Current phase: map only, with mock venue pins (pins not built yet). Milestones 1 to 3 are done, rebuilt on MapLibre.

## Stack
- Vite, React, TypeScript (strict), MapLibre GL JS, PMTiles, Zustand, Supabase, Vitest.
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
npm run data:events              # sync Ticketmaster events to Supabase (needs secrets in .env)
npm run data:venues              # sync venue websites (AudienceView, schema.org events) to Supabase
npm run data:venues -- redwood   # sync only the named venues (see the keys in scripts/fetch-venues.ts)
npm run db:new -- name           # create a database migration
npm run db:push                  # apply new migrations to the linked project
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
| `src/data/ticketmaster.ts` | Ticketmaster fetching (music and comedy) and venue matching, used by `scripts/fetch-events.ts` |
| `src/data/eventStore.ts` | Saves events to Supabase per source and enforces the 30 day retention. Script only |
| `src/data/audienceview.ts` | Venue box offices on AudienceView (Richmond Hill Centre, Flato Markham Theatre). Facts only, no descriptions or images |
| `src/data/schemaEvents.ts` | Venue sites with schema.org Event data on event pages (The Redwood Theatre, Geary Warehouse, Leah Posluns Theatre, Backroom Comedy Club, The Second City). Facts only |
| `src/data/politeFetch.ts` | Shared rules for reading venue sites: 2 s gap, BeatMap User-Agent, allow-list, stop on error |
| `src/data/rcmusic.ts` | Koerner Hall and Mazzoleni Concert Hall from rcmusic.com's concert listings. Facts only, no prices |
| `src/data/eventbrite.ts` | Venues selling on Eventbrite (Lula Lounge, SoCap Comedy), through Eventbrite's API. Needs EVENTBRITE_TOKEN |
| `src/data/tribeEvents.ts` | WordPress sites with The Events Calendar's REST API (Jazz Bistro, Grossman's Tavern, Junction Underground, Castro's Lounge, Wiggle Room) |
| `src/data/admitOne.ts` | Venues on Admit One, through its public embed API (Adelaide Hall, Queen Elizabeth Theatre) |
| `src/data/elfsightCalendar.ts` | Venues with an Elfsight event calendar widget (Bovine Sex Club, Japanese Canadian Cultural Centre). Event types can be skipped or given a category |
| `src/data/showpass.ts` | Venues selling on Showpass, through its public discovery API (Burdock Music Hall, Hugh's Room, Absolute Comedy) |
| `src/data/drom.ts` | DROM Taberna's home page event cards. Only about three days ahead are published |
| `src/data/shopifyShows.ts` | Shows sold as Shopify products, from a collection's products.json (The Rex) |
| `src/data/wixEvents.ts` | Wix Events widget data embedded in a page (The Cameron House) |
| `src/data/reservoir.ts` | The Reservoir Lounge's weekly lineup, from the Google Sheet its site publishes. One week at a time |
| `src/data/artsPeople.ts` | Companies on the Arts People box office: production pages with performances (Scarborough Village Theatre) |
| `src/data/tickera.ts` | WordPress sites selling with the Tickera plugin: listing, then show pages (Linsmore Tavern) |
| `src/data/boomtech.ts` | Wix sites with Boomtech's Event Calendar: site token, then its calendar API (Free Times Cafe) |
| `src/data/mrBlack.ts` | Clubs selling on Mr Black, from its public list of upcoming nights (Future). Standing weekly guest-list nights are left out |
| `src/data/rhythm.ts` | Rhythm's Shopify events page: date and title only, ticket links passed on to RA but never requested |
| `src/data/bsmt254.ts` | BSMT 254's listing, then each show's page for the real time, prices and style (cached 3 days) |
| `src/data/squarespaceEvents.ts` | Squarespace events collections, from the collection's own page, since `?format=json` and `/api/` are disallowed (The Painted Lady, The Piston, The Corner Comedy Club) |
| `src/data/tranzac.ts` | The Tranzac: sitemap, then each event page's Nuxt payload for the exact start (cached 3 days, up to 120 pages a run) |
| `src/data/coc.ts` | Canadian Opera Company performances at the Four Seasons Centre, from the feed its calendar page loads |
| `src/data/comedyBar.ts` | Comedy Bar's Bloor and Danforth clubs: home page show links, then each show page's dates (cached 3 days, up to 120 pages a run) |
| `src/data/yukYuks.ts` | Yuk Yuk's Toronto club page: show cards with runs of days and showtimes |
| `src/data/badDog.ts` | Bad Dog Theatre's What's On list, filed under the theatre each show is at (Sweet Action Theatre, Society Clubhouse) |
| `src/data/feedShow.ts` | Shared helpers for feed adapters: building shows, prices and ages from text |
| `src/data/pageCache.ts` | Caches facts from venues' show pages in Supabase for 3 days. Script only |
| `src/data/categories.ts` | Keyword rules sorting non-Ticketmaster shows into Music, Dance, Theatre and so on |
| `src/data/events.ts` | Loads events from Supabase and formats them for the side panel |
| `supabase/migrations/` | Every database change, in order. Never edit one that's applied; add a new one |
| `src/theme.ts` | All colours, fonts and sizes |
| `src/config.ts` | Map boundary, starting point, data URL |
| `tests/` | Unit tests |
| `scripts/fetch-data.sh` | Generates map extracts |

GitHub Actions syncs Ticketmaster (`.github/workflows/refresh-events.yml`, 09:17 UTC) and venue
websites (`refresh-venues.yml`, 09:43 UTC) once a day. Venue sites get 2 seconds between requests, the BeatMap
User-Agent, search pages only, and the adapter stops rather than retrying when blocked. Never expose the service key or Ticketmaster key to the browser: only `VITE_` values reach it, and every table needs row level security.

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
- Don't scrape Facebook or Instagram.
- Don't commit large map data files; document how to regenerate them.
- Don't hard-code API keys. Use `.env` and keep it out of git.
