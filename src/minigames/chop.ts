import * as THREE from 'three';
import type { Minigame, MinigameContext, MinigameFactory } from './types';
import type { FoodItem } from '../render/api';
import { panel, toScreen, sfx, nonTimed, clamp01 } from './ui';
import { flash, clearHeader } from './feedback';

const N = 8;
const GUIDE_HALF = 0.35; // world half-width the guide slides across
const HIT_PX = 60;       // px tolerance for full accuracy

export const chop: MinigameFactory = (): Minigame => {
  let ctx: MinigameContext;
  let item: FoodItem | null = null;
  let station: THREE.Group | null = null;
  let guide: THREE.Mesh | null = null;
  let ui: ReturnType<typeof panel> | null = null;
  let cuts = 0;
  let lastCutT = 0;
  let lastInterval = 0;
  let accSum = 0;
  let time = 0;
  const guidePos = new THREE.Vector3();
  const scr = { x: 0, y: 0 };

  const strokeCrossedItem = (from: { x: number; y: number }, to: { x: number; y: number }): number => {
    toScreen(ctx, guidePos, scr);
    // Distance from the guide's screen point to the stroke segment.
    const dx = to.x - from.x, dy = to.y - from.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp01(((scr.x - from.x) * dx + (scr.y - from.y) * dy) / len2);
    const px = from.x + t * dx - scr.x, py = from.y + t * dy - scr.y;
    return clamp01(1 - Math.hypot(px, py) / HIT_PX);
  };

  return {
    start(c) {
      ctx = c;
      station = ctx.food.station('board');
      item = ctx.food.make(ctx.step.ingredient);
      item.object.position.y += 0.05;
      guide = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.02, 1.1),
        new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false }),
      );
      guide.renderOrder = 10; // always drawn over the food so the target never hides
      guide.position.y = 0.2;
      ctx.group.add(station, item.object, guide);
      ui = panel(ctx, `Swipe across the red line  0 / ${N}`);
      clearHeader(ui.root);
      ctx.gestures.setHandlers({
        onSwipe: (_dir, _speed, from, to) => {
          if (!item || cuts >= N) return;
          const now = performance.now();
          const posAcc = strokeCrossedItem(from, to);
          let rhythm = 1;
          if (lastInterval > 0) {
            const interval = now - lastCutT;
            rhythm = clamp01(1 - Math.abs(interval - lastInterval) / lastInterval);
          }
          if (lastCutT > 0) lastInterval = now - lastCutT;
          lastCutT = now;
          cuts++;
          accSum += posAcc * 0.7 + rhythm * 0.3;
          item.setChopProgress(cuts / N);
          sfx(ctx, 'chop');
          flash(ctx, posAcc > 0.7 ? 'PERFECT' : posAcc > 0.3 ? 'GOOD' : 'MISS', posAcc > 0.7 ? '#2ecc71' : posAcc > 0.3 ? '#ffb347' : '#ff3b30');
          if (ui) ui.text.textContent = `Swipe across the red line  ${cuts} / ${N}`;
          if (cuts >= N) ctx.complete(nonTimed(accSum / N));
        },
      });
    },
    update(dt) {
      time += dt;
      if (!guide) return;
      guidePos.set(Math.sin(time * 1.6) * GUIDE_HALF, 0.2, 0);
      guide.position.copy(guidePos);
    },
    dispose() {
      ctx?.gestures.setHandlers({});
      ui?.root.remove();
      item?.dispose();
      item = null; station = null; guide = null; ui = null;
    },
  };
};
