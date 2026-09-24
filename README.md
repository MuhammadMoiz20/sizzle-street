# Sizzle Street

An original browser cooking game. You run **The Copper Skillet**, a small comfort-food
restaurant on Sizzle Street in the town of Brambleford. Customers sit down, order, and you
cook each dish step by step with hand gestures: chop, grill, fry, stir, season. Serve fast
and well for tips, unlock recipes and spices at the market, hire helpers, upgrade your
equipment, and impress the visiting critic, Marguerite Pell of *The Brambleford Ledger*.

Inspired by the time-management cooking genre only. All names, recipes, art (procedural
3D), and sounds (procedural Web Audio) are original; no third-party assets.

**Play it:** https://sizzle-street.vercel.app

## Run locally

```sh
npm i
npm run dev            # Vite dev server
npm run test           # vitest unit tests (sim + gesture classifier)
npm run build          # tsc --noEmit && vite build
npx playwright test    # e2e: full shift, market/staff/upgrade flows, critic (desktop + mobile)
```

Playwright runs against `npm run preview` (port 4173) in new-headless Chromium with GPU
enabled; run `npm run build` first.

## Controls

Mouse and touch are the same: every gesture is a single pointer stroke on the 3D stage.
Nothing relies on hover or keyboard.

| Step   | Gesture |
|--------|---------|
| Chop   | Swipe across the guide line; repeat until the ingredient is fully sliced |
| Grill  | Wait for the meter, **swipe up** to flip, wait again, **swipe down** or tap PULL |
| Fry    | Tap DROP, wait for golden, tap PULL (or swipe down) |
| Stir   | Draw circles in the bowl or pan; steady rhythm scores higher |
| Season | Hold and shake the shaker over the dish; hit the target count, then tap DONE |

Tap a ticket step to open its minigame; tap SERVE when every step is done. Overcooked
food burns if left, so pull it in the perfect window (wider with upgraded equipment).

## Project layout

```
src/game/       types, event emitter, original content (recipes, customers, critic)
src/sim/        pure simulation: shift loop, patience, cook timers, helpers, economy,
                critic scoring, save/load (no DOM, no three.js; unit-tested)
src/input/      pointer-events gesture controller (swipe / circle / hold / drag / tap)
src/render/     three.js renderer, procedural food meshes, doneness shading, particles
src/minigames/  chop, grill, fry, stir, season (consume render API + gestures)
src/ui/         DOM HUD, ticket rail, title / summary / market / staff screens
src/audio/      procedural Web Audio synth
src/main.ts     wiring + `window.__game` test hooks
tests/          vitest unit tests
e2e/            Playwright specs (shift, flows, critic) and screenshots
```

Save data lives in `localStorage` under `sizzle-street-save`.

## Known issues

- Mobile fps numbers come from headless Chromium on a laptop GPU, not a real phone.
- The fries texture change during frying is subtle; hard to read at a glance.
- Stir scoring rewards rhythm consistency, which is easy to miss with a trackpad.
- Helpers auto-complete steps with fixed accuracy; they never burn food.

## v2 ideas

- Restaurants 2-4 around Brambleford, each with its own menu and station mix.
- Rival cook-off against Corvin Lasche of Maison Lasche: head-to-head shifts scored by the critic.
- Real-device performance pass and a landscape-first phone layout.
