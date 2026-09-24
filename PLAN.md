# PLAN — Sizzle Street (working title)

Original browser cooking game. Town: Brambleford. Restaurant 1: The Copper Skillet.
Critic: Marguerite Pell. Rival: Corvin Lasche (v2).

## Stack decision
Vite + TypeScript + vanilla Three.js. No react-three-fiber: the HUD is plain DOM and the 3D
stage has one scene with swapped station groups; R3F would add ~100KB and a reconciler for no gain.
Physics: none for v1 (flip/toss are tweened; add a tiny spring if it feels dead).

## Architecture
- `src/game/` types, event emitter, original content data (recipes, names). Contract layer.
- `src/sim/` pure simulation: shift loop, customers, patience, station cook timers, helpers,
  economy, critic, save/load. No DOM/Three. Unit-tested with vitest.
- `src/input/` Pointer-Events gesture controller (swipe/circle/hold/drag/tap). Mouse == touch.
- `src/render/` Three renderer, PBR materials, procedural food meshes, doneness shading,
  steam/sizzle particles, station props, fps stats. Quality tiers for mobile.
- `src/minigames/` chop, grill, fry, stir, season. Consume render API + gestures.
- `src/ui/` DOM HUD, ticket rail, station overview, screens (title, summary, market, staff).
- `src/audio/` Web Audio synth (all sounds procedural, no files).
- `src/main.ts` wires everything.

## Milestone 1 (current): playable v1 shift
Acceptance:
- [x] `npm run build` zero TS errors; `npm run test` green
- [x] Full shift completable desktop 1440x900 and mobile 390x844 touch (Playwright)
- [x] All 5 minigames mouse+touch, no hover-only
- [x] No horizontal scroll, HUD readable at 390px, tap targets >= 44px
- [x] >= 55fps desktop, >= 30fps mobile emulation during busy shift (logged)
- [x] Save/reload restores progress
- [x] Helpers, market, equipment upgrade, critic implemented
- [x] Deployed to Vercel from GitHub main; CREDITS.md complete

## Later
- Restaurants 2-4, rival cook-off (only after all v1 checks pass)
