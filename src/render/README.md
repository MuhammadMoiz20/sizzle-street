# render

`createRenderer(container)` (index.ts) implements `Renderer` from api.ts; food, stations, effects live in food.ts.

Tiers: mobile = `(pointer: coarse)` or width < 700.
- Desktop: antialias, pixelRatio <= 2, PCFSoft shadows from the key light.
- Mobile: no antialias, pixelRatio <= 1.5, no shadows, particle counts halved.

Doneness: `d` is 0 raw, 1 perfect, 2 burnt. Each cookable item has a 3-stop color ramp
(raw -> perfect -> burnt); color lerps raw->perfect over 0..1 and perfect->burnt over 1..2, and roughness drops as fat renders.
Patty/chicken keep a separate material per side (`side` 0 = the face down first, 1 = the other); fries/rings ignore side.
Shared materials (cache) are flagged `userData.shared` and survive `clearStage()`; per-item ones are disposed.
