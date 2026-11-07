---
name: gig-poster-ui
description: Gig-poster and zine visual style for this project's UI and map. Use whenever creating or changing any UI component, page, panel, map styling, colours, typography, icons or animations.
---

# Gig Poster UI Style

The app should feel like a wall of photocopied gig posters and DIY zines from Toronto's small-venue scene: bold, inky, a little rough, and full of character. It must never look like a generic AI or SaaS dashboard.

## Core idea
- Every screen looks printed, not rendered: paper, ink, halftone, tape, stamps.
- Two or three "ink" colours per view, like a riso or screen print, on off-white or dark paper.
- Typography does the heavy lifting: big condensed headlines, typewriter-style details.
- Imperfection is deliberate and controlled: slight rotations, offset ink, rough edges. Never random chaos.

## Design tokens
All values live in the theme/tokens file. Never hard-code colours, fonts, shadows or spacing in components.

### Colour (ink on paper)
| Token | Hex | Use |
|---|---|---|
| paper | #F2EBDD | Main background (light mode) |
| paper-dark | #1B1A17 | Night-mode background, the map at night |
| ink | #141414 | Text, outlines, borders |
| riso-red | #E3412B | Primary accent: CTAs, venue pins, "tonight" |
| riso-blue | #2F5BA8 | Secondary accent: links, water on the map |
| riso-yellow | #F2C230 | Highlights, "FREE" stamps, hover marks |
| riso-green | #3E8E5E | Parks on the map, "open now" |
| highway-orange | #F28C28 | Highways on the map |
| selected-purple | #7B2FBE | The selected venue pin only |
| fade | #8A8274 | Muted text, past events |

Rules:
- Use at most 2 accent inks in a single component.
- Overprint effect: where red and blue overlap, use multiply blending rather than a new colour.
- Body text is always ink on paper (or paper on paper-dark) for contrast. Accents are for shapes, headlines and stamps.

### Typography (Google Fonts)
| Role | Font | Notes |
|---|---|---|
| Display / headlines | Anton (fallback: Bebas Neue) | All caps, tight letter-spacing, big |
| Sub-headlines | Archivo Black | Venue names, section titles |
| Body / details | Space Mono (fallback: IBM Plex Mono) | Dates, times, prices, descriptions |
| Handwritten accents | Permanent Marker | Max one short phrase per screen ("tonight!", "free!") |

Rules:
- Headlines can be huge (48–120px on desktop) and can break across lines like a poster.
- Never use more than 3 font families on one screen.
- Minimum body size 15px; keep line length readable.

### Spacing, borders and shadows
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Borders: solid ink, 2–3px. No 1px grey hairlines.
- Corners: square (0–2px radius). No pill shapes or soft rounded cards.
- Shadows: hard offset "misprint" shadows only, e.g. 4px 4px 0 ink or an accent colour. No blurry drop shadows.

## Textures (keep them light)
- Paper grain: a subtle SVG noise filter or a small tiled texture over backgrounds, at low opacity.
- Halftone: CSS radial-gradient dot patterns for fills, image overlays and shaded areas.
- Misregistration: duplicate headline layers offset 1–3px in a second ink colour.
- Photocopy look for images: high contrast, grayscale or duotone (ink + one accent), optional halftone overlay.
- Textures must never reduce text readability. No texture directly behind body text.

## Components
- **Event card = flyer.** Off-white paper block, thick ink border, slight rotation (between -1.5 and 1.5 degrees, deterministic per card, not random per render), a piece of "tape" on one corner, headline artist name in Anton, details in Space Mono.
- **Date = ticket stub.** Perforated edge (dashed border or notches), big day number, small month.
- **Status stamps.** Rotated rubber-stamp badges with rough edges: "TONIGHT", "FREE", "SOLD OUT", "ALL AGES". Use riso-red or riso-yellow, multiply blend.
- **Buttons.** Rectangular, thick ink border, hard offset shadow. On press, the button shifts into its shadow (translate by the shadow offset, shadow to 0).
- **Dropdowns and calendars.** Custom, in the same style as search results, not native selects or date pickers, whose popups can't be styled. A filter that's on uses a riso-yellow button.
- **Inputs.** Look like a form on a photocopied page: ink underline or box, typewriter font, no glow focus ring. Focus state: thick accent outline that is clearly visible.
- **Side panel / bottom sheet.** A poster pinned to the wall: paper background, torn or zig-zag top edge, push-pin or tape at the top.
- **Icons.** Simple, bold, slightly rough line icons in ink. No glossy, gradient or emoji-style icons.
- **Empty states.** A crossed-out flyer or "NOTHING ON TONIGHT — CHECK BACK" in marker font.

## Map styling (MapLibre, in src/map/mapStyle.ts)
- Shares the same palette as the UI. Night mode uses paper-dark as land.
- Land: paper or paper-dark. Water: riso-blue with a halftone dot pattern. Parks: riso-green halftone.
- Roads: minor streets in fade, major streets in riso-yellow, highways in highway-orange and thicker. No neon.
- Buildings: flat dark greys with darker shading on one side to read as isometric. MapLibre can't draw ink edge outlines on 3D buildings, so rely on face contrast. Avoid photoreal lighting.
- Venue pins: push-pins or small stamped flyers standing on the map. Pins are riso-red, or fade when a venue has no upcoming shows; the selected venue uses selected-purple with a stamp-style label.
- Labels: currently Noto Sans Medium, the font with ready-made map glyphs; move to Archivo Black once its glyphs are generated. Paper text with an ink outline on the dark map. Street names follow the roads.

## Motion
- Snappy and physical, like paper being handled: quick slides, small drops, a 1–2 degree wiggle on hover.
- Cards can "slap" onto the board when they appear (fast scale-down from 1.05 to 1 with slight rotation settle).
- Durations 120–250ms. No slow fades, no floaty glows.
- Respect prefers-reduced-motion: disable rotation wiggles and slap-ins, keep simple opacity changes.

## Do
- Commit fully to the poster look on every screen, including loading, errors and empty states.
- Use real hierarchy: one dominant headline per view, like a poster.
- Keep it fast: textures as small SVGs or CSS, not huge images.
- Check every screen at phone width.

## Don't
- No default Tailwind/shadcn component styling, purple-blue gradients, glassmorphism, frosted blur, soft drop shadows or rounded-everything cards.
- No generic "dashboard" layouts with stat tiles.
- No more than 2 accent inks per component, 3 fonts per screen, or one handwritten phrase per screen.
- No random rotations that change on every render.
- Don't sacrifice contrast or legibility for texture.

## Accessibility
- Text contrast at least WCAG AA (ink on paper passes; check accent-on-paper text before using it).
- Never rely on colour alone for status; stamps always include words.
- Visible keyboard focus on every interactive element.
- Decorative textures and tape are aria-hidden.

## Checklist before finishing any UI change
1. All colours, fonts and shadows come from tokens.
2. The screen reads as a printed poster or zine, not an app dashboard.
3. Text contrast passes and body text sits on plain paper.
4. Works at phone width and with prefers-reduced-motion.
5. Take one low-resolution screenshot, per the limit in CLAUDE.md, and compare against the reference images in /design/references (if present). Describe any differences.
