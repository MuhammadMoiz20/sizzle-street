import type { Minigame, MinigameContext, MinigameFactory } from './types';
import type { FoodItem } from '../render/api';
import { panel, sfx, nonTimed, clamp01 } from './ui';

const N = 6;

export const stir: MinigameFactory = (): Minigame => {
  let ctx: MinigameContext;
  let item: FoodItem | null = null;
  let ui: ReturnType<typeof panel> | null = null;
  let count = 0;
  let lastT = 0;
  let speed = 0;
  let cw = 0, ccw = 0;
  const intervals: number[] = [];

  return {
    start(c) {
      ctx = c;
      item = ctx.food.make(ctx.step.ingredient);
      ctx.group.add(ctx.food.station(ctx.step.ingredient === 'pan_sauce' ? 'pan' : 'bowl'), item.object);
      ui = panel(ctx, `Circle to stir  0 / ${N}`);
      ctx.gestures.setHandlers({
        onDrag: (_p, vx, vy) => { speed = Math.min(1, Math.hypot(vx, vy) / 1500); },
        onCircle: (clockwise) => {
          if (count >= N) return;
          const now = performance.now();
          if (lastT) intervals.push(now - lastT);
          lastT = now;
          if (clockwise) cw++; else ccw++;
          count++;
          sfx(ctx, 'stir');
          if (ui) ui.text.textContent = `Circle to stir  ${count} / ${N}`;
          if (count < N) return;
          const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const sd = Math.sqrt(intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length);
          let acc = Math.max(0.5, 1 - sd / mean);
          if (cw === 0 || ccw === 0) acc += 0.1;
          ctx.complete(nonTimed(clamp01(acc)));
        },
      });
    },
    update(dt) {
      if (!item) return;
      if (!ctx.gestures.isDown()) speed = Math.max(0, speed - dt * 2);
      item.setStir(speed);
    },
    dispose() {
      ctx?.gestures.setHandlers({});
      ui?.root.remove();
      item?.dispose();
      item = null; ui = null;
    },
  };
};
