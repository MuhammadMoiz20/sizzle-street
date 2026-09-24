import type { Minigame, MinigameContext, MinigameFactory } from './types';
import type { FoodItem } from '../render/api';
import { cookMeter, donenessOf, STEAM_POS } from './cookmeter';
import { sfx } from './ui';

export const fry: MinigameFactory = (): Minigame => {
  let ctx: MinigameContext;
  let item: FoodItem | null = null;
  let hud: ReturnType<typeof cookMeter> | null = null;
  let bubbleT = 0;

  return {
    start(c) {
      ctx = c;
      item = ctx.food.make(ctx.step.ingredient);
      ctx.group.add(ctx.food.station('fryer'), item.object);
      hud = cookMeter(ctx, 'Frying now: swipe UP or PULL when golden');
      ctx.food.effects.sizzle(STEAM_POS, 1);
      ctx.gestures.setHandlers({
        onSwipe: (dir) => { if (dir === 'up') { sfx(ctx, 'fry_pull'); ctx.cookActions?.pull(); } },
      });
    },
    update(dt) {
      if (!item) return;
      const d = donenessOf(ctx);
      item.setDoneness(d);
      hud?.set(d);
      bubbleT += dt;
      if (bubbleT > 0.4) { bubbleT = 0; ctx.food.effects.sizzle(STEAM_POS, 0.4); }
    },
    dispose() {
      ctx?.gestures.setHandlers({});
      hud?.dispose();
      item?.dispose();
      item = null; hud = null;
    },
  };
};
