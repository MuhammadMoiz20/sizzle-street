import type { Minigame, MinigameContext, MinigameFactory } from './types';
import type { FoodItem } from '../render/api';
import { cookMeter, donenessOf, STEAM_POS } from './cookmeter';
import { sfx } from './ui';

export const grill: MinigameFactory = (): Minigame => {
  let ctx: MinigameContext;
  let item: FoodItem | null = null;
  let steam: ReturnType<MinigameContext['food']['effects']['steam']> | null = null;
  let hud: ReturnType<typeof cookMeter> | null = null;
  let sizzleT = 0;

  const flip = () => {
    if (!ctx.cookActions || !item || ctx.step.cook?.side !== 0) return;
    ctx.cookActions.flip();
    item.flip();
    ctx.food.effects.sizzle(STEAM_POS, 1);
    sfx(ctx, 'sizzle_start');
    if (hud) hud.ui.text.textContent = 'Swipe DOWN or PULL when done';
  };

  return {
    start(c) {
      ctx = c;
      item = ctx.food.make(ctx.step.ingredient);
      ctx.group.add(ctx.food.station('pan'), item.object);
      steam = ctx.food.effects.steam(STEAM_POS, 0);
      hud = cookMeter(ctx, 'Swipe UP to flip, DOWN to pull');
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
