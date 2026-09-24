# PROGRESS

## Iteration 1 — 2026-09-24
✅ Modules built: render, sim (14 unit tests green), input+minigames, ui, audio; integrated in main.ts
✅ `npm run build` zero TS errors; `npm run test` 14/14
✅ Playwright full shift desktop 1440x900: served 9/9, avg 59.9 fps, min 57.9
✅ Playwright full shift mobile 390x844 touch: served 9/9, avg 60.0 fps, min 59.6 (note: headless on laptop GPU, not a real phone)
✅ Save/reload restores shift number; tap targets ≥44px; no horizontal scroll
❌ Fixed this iteration: #stage had no CSS (150px canvas); headless-shell software GL made swipes too slow → new-headless Chromium + Metal
❌ Not yet verified in-browser: helpers/market/critic/equipment flows (unit-tested only); real-device mobile fps
Next: push → Vercel deploy check; e2e for market/staff/upgrade; visual pass on food realism; verify critic path.
## Iteration 2 — 2026-09-24
✅ e2e/flows.spec.ts: market buy recipe+spice, equipment upgrade via real strokes, hire+assign helper (auto-completes steps), critic badge, reset-save inline confirm — 10/10 on desktop+mobile
✅ Bug fixed: market/hire/upgrade never persisted until a shift ended (lost on reload)
✅ Visual pass: procedural produce textures, edge-in Maillard crust + char + grill stripes, glossy liquids, rim light, contact shadows, softer steam. Draw calls +1 per item (chop 32, fry 29)
✅ Gate: build 0 errors, 14 unit tests, 14 e2e; desktop avg 60.0 min 59.8 fps; mobile avg 60.0 min 59.8 (headless laptop GPU)
❌ Remaining: no real-device phone fps number; fries visual change marginal; no e2e for critic scoring path (signature dish → critic star)
Next: real Chrome mobile-emulation fps check via CPU throttling; critic-star e2e; playtest UX at 390px landscape; CREDITS/README final.
