import * as THREE from 'three';
import type { Minigame, MinigameContext, MinigameFactory } from './types';
import type { FoodItem } from '../render/api';
import { panel, button, meter, toScreen, sfx, clamp01 } from './ui';

const OVER_ITEM_PX = 140;
const SHAKE_V = 250; // px/s: velocity magnitude that counts as a shake

export const season: MinigameFactory = (): Minigame => {
  let ctx: MinigameContext;
  let item: FoodItem | null = null;
  let shaker: THREE.Group | null = null;
  let ui: ReturnType<typeof panel> | null = null;
  let fill: ReturnType<typeof meter> | null = null;
  let amount = 0;
  let target = 4;
  let lastVx = 0, lastVy = 0;
  const itemPos = new THREE.Vector3(0, 0.1, 0);
  const scr = { x: 0, y: 0 };
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  const makeShaker = (): THREE.Group => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 16), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0x444444 }));
    cap.position.y = 0.17;
    g.add(body, cap);
    g.position.set(0.5, 0.4, 0);
    g.visible = false;
    return g;
  };

  const setAmount = (a: number) => {
    amount = a;
    item?.setSeasoning(a / target);
    fill?.set(a / (target * 2));
    if (ui) ui.text.textContent = `Shake over the dish  ${a} / ${target}`;
  };

  return {
    start(c) {
      ctx = c;
      target = ctx.step.targetAmount ?? 4;
      item = ctx.food.make(ctx.step.ingredient);
      shaker = makeShaker();
      ctx.group.add(ctx.food.station('plate'), item.object, shaker);
      ui = panel(ctx, '');
      fill = meter(ui.root, 'linear-gradient(90deg,#555,#ffb347)', 0.5);
      ui.root.insertBefore(ui.root.lastChild!, ui.bar);
      button(ui.bar, 'DONE', () => {
        ctx.complete({
          accuracy: clamp01(1 - Math.abs(amount - target) / target),
          timing: 1,
          overSeasoned: amount > target * 1.5,
        });
      });
      setAmount(0);
      ctx.gestures.setHandlers({
        onDown: () => { if (shaker) shaker.visible = true; lastVx = lastVy = 0; },
        onUp: () => { if (shaker) shaker.visible = false; },
        onDrag: (p, vx, vy) => {
          if (!shaker) return;
          ndc.set(p.nx, -p.ny);
          ray.setFromCamera(ndc, ctx.camera);
          if (ray.ray.intersectPlane(plane, hit)) shaker.position.copy(hit);
          shaker.rotation.z = clamp01(Math.abs(vx) / 1000) * 0.6 * Math.sign(vx || 1);
          const reversed = (vx * lastVx < 0 && Math.abs(vx) > SHAKE_V) || (vy * lastVy < 0 && Math.abs(vy) > SHAKE_V);
          lastVx = vx; lastVy = vy;
          if (!reversed) return;
          toScreen(ctx, itemPos, scr);
          if (Math.hypot(p.x - scr.x, p.y - scr.y) > OVER_ITEM_PX) return;
          ctx.food.effects.sprinkle(itemPos, 12);
          sfx(ctx, 'shake');
          setAmount(amount + 1);
        },
      });
    },
    update() { /* nothing per-frame; all driven by gestures */ },
    dispose() {
      ctx?.gestures.setHandlers({});
      ui?.root.remove();
      item?.dispose();
      item = null; shaker = null; ui = null; fill = null;
    },
  };
};
