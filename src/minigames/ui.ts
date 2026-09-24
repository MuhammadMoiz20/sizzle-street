import * as THREE from 'three';
import type { MinigameContext } from './types';
import type { StepResult } from '../game/types';

/** Shared overlay widgets. Big text, real buttons, bottom-anchored in portrait. */
export function panel(ctx: MinigameContext, text: string): { root: HTMLElement; text: HTMLElement; bar: HTMLElement } {
  const root = document.createElement('div');
  root.style.cssText = `position:absolute;left:0;right:0;${(ctx.overlay.clientHeight || ctx.viewport.height) > (ctx.overlay.clientWidth || ctx.viewport.width) ? 'bottom:0' : 'top:0'};` +
    'display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;pointer-events:none;' +
    'font:700 clamp(20px,4vw,32px)/1.2 system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000;text-align:center';
  const t = document.createElement('div');
  t.textContent = text;
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;pointer-events:auto';
  root.append(t, bar);
  ctx.overlay.appendChild(root);
  return { root, text: t, bar };
}

export function button(parent: HTMLElement, label: string, onPress: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText = 'min-width:96px;min-height:56px;padding:0 24px;border:0;border-radius:12px;' +
    'font:700 22px system-ui,sans-serif;background:#ffb347;color:#222;touch-action:manipulation;cursor:pointer';
  b.addEventListener('click', onPress);
  parent.appendChild(b);
  return b;
}

/** Horizontal fill meter with optional target marker. `set(0..1)` moves the fill. */
export function meter(parent: HTMLElement, zones: string, target?: number): { set(v: number): void } {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;width:min(80vw,420px);height:22px;border-radius:11px;background:${zones};` +
    'box-shadow:0 0 0 2px #fff inset';
  const needle = document.createElement('div');
  needle.style.cssText = 'position:absolute;top:-6px;width:6px;height:34px;margin-left:-3px;background:#fff;border-radius:3px;' +
    'box-shadow:0 0 4px #000;left:0';
  wrap.appendChild(needle);
  if (target !== undefined) {
    const m = document.createElement('div');
    m.style.cssText = `position:absolute;top:-4px;bottom:-4px;width:3px;left:${target * 100}%;background:#0f0`;
    wrap.appendChild(m);
  }
  parent.appendChild(wrap);
  return { set: (v) => { needle.style.left = `${Math.min(1, Math.max(0, v)) * 100}%`; } };
}

/** Doneness meter: 0..2 doneness mapped so 1 (perfect) sits at the centre. */
export const DONENESS_ZONES = 'linear-gradient(90deg,#c9c9c9 0 25%,#e0a86b 25% 44%,#2ecc71 44% 56%,#8b4513 56% 78%,#111 78%)';

const _v = new THREE.Vector3();
/** Project world position to overlay/canvas CSS px. */
export function toScreen(ctx: MinigameContext, pos: THREE.Vector3, out: { x: number; y: number }): void {
  _v.copy(pos).project(ctx.camera);
  const w = ctx.overlay.clientWidth || ctx.viewport.width, h = ctx.overlay.clientHeight || ctx.viewport.height;
  out.x = (_v.x + 1) / 2 * w;
  out.y = (1 - _v.y) / 2 * h;
}

export function sfx(ctx: MinigameContext, name: string): void {
  ctx.overlay.dispatchEvent(new CustomEvent('sfx', { bubbles: true, detail: name }));
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function nonTimed(accuracy: number): StepResult {
  return { accuracy: clamp01(accuracy), timing: 1 };
}
