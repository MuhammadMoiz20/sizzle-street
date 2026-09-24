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
## Iteration 3 — 2026-09-24
✅ Phone landscape 844x390: ticket rail as left column, minigame controls right column; food never covered (e2e/landscape.spec.ts)
✅ Throttled 4x CPU fps (mobile + landscape): avg 60.0 min 59.8 — GPU-bound scene, still headless laptop GPU, not a phone
✅ Critic path e2e: perfect signature dish via real grill gestures → critic star saved + shown in summary; 2 new unit tests (16 total)
✅ UX playtest fixes: tickets sorted by urgency, HURRY + pulsing card, TAP TO START chip, live PERFECT/OVER/BURNT meter labels, per-swipe PERFECT/GOOD/MISS flash, thicker chop guide drawn over food, prompts no longer hidden under header
✅ Back button wired for all minigames (hands-on steps return to pending, timed steps keep cooking); duplicate BACK removed
✅ README.md added. Gate: build 0 errors, 16 unit, 36 e2e across desktop/mobile/mobile-landscape, served 9/9 each
❌ Real-device phone fps still unmeasured (needs a physical phone); fries visual still weakest
Next: final acceptance sweep against checklist, CREDITS review, deploy verify, status report.
## Iteration 4 (final sweep) — 2026-09-24
✅ Genuine touch events (CDP Input.dispatchTouchEvent, pointerType 'touch') complete the chop minigame on mobile + landscape (e2e/touch.spec.ts)
✅ Production https://sizzle-street.vercel.app serves the latest bundle hash from main
✅ Acceptance checklist: all items pass on 1440x900 and 390x844 (plus 844x390). 38 e2e, 16 unit, 0 TS errors
Known: fps numbers are from headless Chromium on a laptop GPU (60/60, 4x CPU-throttled 60/59.8), not a physical phone.
Loop ended: goal met after 4 iterations.
