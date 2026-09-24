import type { Minigame, MinigameContext, MinigameFactory } from './types';
import type { FoodItem } from '../render/api';
import { cookMeter, donenessOf, STEAM_POS } from './cookmeter';
import { sfx } from './ui';
import { clearHeader, zone } from './feedback';

export const fry: MinigameFactory = (): Minigame => {
  let ctx: MinigameContext;
  let item: FoodItem | null = null;
  let hud: ReturnType<typeof cookMeter> | null = null;
  let bubbleT = 0;
  let lastLabel = '';

  return {
    start(c) {
      ctx = c;
      item = ctx.food.make(ctx.step.ingredient);
      ctx.group.add(ctx.food.station('fryer'), item.object);
      hud = cookMeter(ctx, 'Frying: swipe UP or PULL when golden');
      clearHeader(hud.ui.root);
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
      const z = zone(d);
      if (hud && z.label !== lastLabel) { lastLabel = z.label; hud.ui.text.textContent = `${z.label} - swipe UP or PULL`; hud.ui.text.style.color = z.color; }
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
