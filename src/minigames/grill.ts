import type { Minigame, MinigameContext, MinigameFactory } from './types';
import type { FoodItem } from '../render/api';
import { cookMeter, donenessOf, STEAM_POS } from './cookmeter';
import { sfx } from './ui';
import { clearHeader, zone } from './feedback';

export const grill: MinigameFactory = (): Minigame => {
  let ctx: MinigameContext;
  let item: FoodItem | null = null;
  let steam: ReturnType<MinigameContext['food']['effects']['steam']> | null = null;
  let hud: ReturnType<typeof cookMeter> | null = null;
  let sizzleT = 0;
  let flipped = false;
  let lastLabel = '';

  const flip = () => {
    if (!ctx.cookActions || !item || ctx.step.cook?.side !== 0) return;
    ctx.cookActions.flip();
    item.flip();
    ctx.food.effects.sizzle(STEAM_POS, 1);
    sfx(ctx, 'sizzle_start');
    flipped = true;
  };
  const setLabel = (d: number) => {
    const z = zone(d);
    const label = d >= 1.8 ? 'BURNT - PULL it' : `${z.label} - ${flipped ? 'swipe DOWN or PULL' : d >= 0.85 ? 'swipe UP to FLIP' : 'swipe UP to flip'}`;
    if (label === lastLabel || !hud) return;
    lastLabel = label;
    hud.ui.text.textContent = label;
    hud.ui.text.style.color = z.color;
  };

  return {
    start(c) {
      ctx = c;
      item = ctx.food.make(ctx.step.ingredient);
      ctx.group.add(ctx.food.station('pan'), item.object);
      steam = ctx.food.effects.steam(STEAM_POS, 0);
      hud = cookMeter(ctx, 'Swipe UP to flip, DOWN to pull');
      clearHeader(hud.ui.root);
      flipped = ctx.step.cook?.flipped ?? false;
      ctx.gestures.setHandlers({
        onSwipe: (dir) => {
          if (dir === 'up') flip();
          else if (dir === 'down') ctx.cookActions?.pull();
        },
      });
    },
    update(dt) {
      if (!item || !ctx.step.cook) return;
      const c = ctx.step.cook;
      const d = donenessOf(ctx);
      item.setDoneness(d, c.side);
      steam?.set(Math.min(1, d));
      hud?.set(d);
      setLabel(d);
      sizzleT += dt;
      if (sizzleT > 0.6) { sizzleT = 0; ctx.food.effects.sizzle(STEAM_POS, Math.min(1, d * 0.5)); }
    },
    dispose() {
      ctx?.gestures.setHandlers({});
      steam?.stop();
      hud?.dispose();
      item?.dispose();
      item = null; steam = null; hud = null;
    },
  };
};
