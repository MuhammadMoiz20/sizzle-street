import * as THREE from 'three';
import type { MinigameContext } from './types';
import { panel, button, meter, DONENESS_ZONES } from './ui';

/** Shared grill/fry overlay: doneness meter + PULL/BACK buttons. */
export function cookMeter(ctx: MinigameContext, hint: string) {
  const ui = panel(ctx, hint);
  const m = meter(ui.root, DONENESS_ZONES);
  ui.root.insertBefore(ui.root.lastChild!, ui.bar); // meter above buttons
  button(ui.bar, 'PULL', () => ctx.cookActions?.pull());
  button(ui.bar, 'BACK', () => ctx.exit());
  return {
    ui,
    /** doneness 0..2 -> meter 0..1 */
    set(d: number) { m.set(d / 2); },
    dispose() { ui.root.remove(); },
  };
}

export const donenessOf = (ctx: MinigameContext): number => {
  const c = ctx.step.cook;
  return c && c.perfectAt > 0 ? c.elapsed / c.perfectAt : 0;
};

export const STEAM_POS = new THREE.Vector3(0, 0.3, 0);
