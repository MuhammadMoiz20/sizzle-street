import * as THREE from 'three';
import { createRenderer } from './render';
import { createGestures } from './input/gestures';
import { MINIGAMES } from './minigames';
import { createKitchen } from './sim/kitchen';
import { createUI } from './ui';
import { createAudio } from './audio';
import type { Minigame, MinigameContext } from './minigames/types';
import type { MinigameKind, StepResult } from './game/types';
import { recipeById } from './game/data';

const root = document.getElementById('app')!;
const stageHost = document.createElement('div');
stageHost.id = 'stage';
root.appendChild(stageHost);

const kitchen = createKitchen();
const renderer = createRenderer(stageHost);
const gestures = createGestures(renderer.canvas);
const audio = createAudio();

let active: { mg: Minigame; orderId: string; stepIndex: number; kind: MinigameKind } | null = null;

const viewport = () => ({ width: innerWidth, height: innerHeight, portrait: innerHeight > innerWidth });
const stationFor = (kind: MinigameKind) =>
  kind === 'chop' ? 'board' : kind === 'grill' ? 'pan' : kind === 'fry' ? 'fryer' : kind === 'stir' ? 'bowl' : 'board';

function closeMinigame() {
  if (!active) return;
  active.mg.dispose();
  ui.showMinigameChrome(active.kind, false);
  ui.overlay.innerHTML = '';
  gestures.setHandlers({});
  renderer.clearStage();
  renderer.showKitchen();
  active = null;
  audio.play('sizzle_loop_stop');
}

function openStep(orderId: string, stepIndex: number) {
  if (active) closeMinigame();
  const order = kitchen.orders.find((o) => o.id === orderId);
  if (!order) return;
  const step = order.steps[stepIndex];
  if (step.status === 'done' || step.helperId) return;
  if (step.status === 'pending') {
    try { kitchen.beginStep(orderId, stepIndex); } catch (e) { ui.toast(String((e as Error).message)); return; }
  }
  const kind = step.kind;
  const mg = MINIGAMES[kind]();
  active = { mg, orderId, stepIndex, kind };
  renderer.clearStage();
  renderer.frameStation(stationFor(kind) as any);
  ui.showMinigameChrome(kind, true);
  const ctx: MinigameContext = {
    step, kind, group: renderer.stage, camera: renderer.camera, gestures, food: renderer.food,
    equipmentLevel: kitchen.save.equipmentLevel[kind], viewport: viewport(), overlay: ui.overlay,
    complete: (result: StepResult) => {
      if (kind !== 'grill' && kind !== 'fry') kitchen.finishStep(orderId, stepIndex, result);
      audio.play(result.accuracy > 0.7 ? 'good' : 'bad');
      closeMinigame();
      ui.showKitchen();
    },
    exit: () => { closeMinigame(); ui.showKitchen(); },
    cookActions: {
      flip: () => { kitchen.flip(orderId, stepIndex); audio.play('sizzle_start'); },
      pull: () => {
        const res = kitchen.pull(orderId, stepIndex, 1);
        audio.play(res.doneness === 'burnt' ? 'burn' : res.timing > 0.8 ? 'good' : 'bad');
        closeMinigame();
        ui.showKitchen();
      },
    },
  };
  if (kind === 'grill') audio.play('sizzle_start');
  if (kind === 'fry') audio.play('fry_drop');
  mg.start(ctx);
}

/** Equipment upgrade: a standalone chop/stir/etc minigame with a dummy step; resolves 0..1. */
function equipmentMinigame(kind: MinigameKind): Promise<number> {
  return new Promise((resolve) => {
    if (active) closeMinigame();
    const mg = MINIGAMES[kind]();
    const step = { kind, ingredient: 'onion' as const, status: 'cooking' as const, targetAmount: 4,
      cookTime: 6, cook: { elapsed: 0, side: 0 as 0 | 1, flipped: false, perfectAt: 6, slotIndex: 0 } };
    active = { mg, orderId: '', stepIndex: -1, kind };
    renderer.clearStage();
    renderer.frameStation(stationFor(kind) as any);
    ui.showMinigameChrome(kind, true);
    let t = 0;
    const tickCook = (dt: number) => { if (step.cook) step.cook.elapsed += dt; t += dt; };
    (active as any).tickCook = tickCook;
    const finish = (score: number) => { closeMinigame(); resolve(score); };
    (active as any).exitEquip = () => finish(0);
    mg.start({
      step, kind, group: renderer.stage, camera: renderer.camera, gestures, food: renderer.food,
      equipmentLevel: kitchen.save.equipmentLevel[kind], viewport: viewport(), overlay: ui.overlay,
      complete: (r) => finish(0.6 * r.accuracy + 0.4 * r.timing),
      exit: () => finish(0),
      cookActions: {
        flip: () => { if (step.cook) { step.cook.side = 1; step.cook.flipped = true; step.cook.elapsed = 0; } },
        pull: () => { const r = step.cook ? Math.abs(1 - step.cook.elapsed / step.cook.perfectAt) : 1; finish(Math.max(0, 1 - r)); },
      },
    });
    void t;
  });
}

const ui = createUI(root, kitchen, {
  onOpenStep: openStep,
  onServe: (id) => { kitchen.serve(id); audio.play('bell'); },
  onScrap: (id) => { kitchen.scrap(id); audio.play('bad'); },
  onStartShift: () => { audio.unlock(); kitchen.startShift(); ui.showKitchen(); renderer.showKitchen(); },
  onEquipmentMinigame: equipmentMinigame,
  onToggleMute: () => { audio.setMuted(!audio.muted); return audio.muted; },
  onExitMinigame: () => {
    if (!active) return;
    if (active.stepIndex < 0) { active.mg.dispose(); (active as any).exitEquip?.(); return; }
    const order = kitchen.orders.find((o) => o.id === active!.orderId);
    const step = order?.steps[active.stepIndex];
    // Timed steps keep cooking in the sim; hands-on steps go back to pending.
    if (order && step && step.kind !== 'grill' && step.kind !== 'fry') {
      step.status = 'pending';
      kitchen.events.emit('order:step', { order, stepIndex: active.stepIndex, status: 'pending' });
    }
    closeMinigame();
    ui.showKitchen();
  },
});

// route events -> audio
kitchen.events.on('customer:arrive', () => audio.play('ding'));
kitchen.events.on('order:served', ({ tip }) => audio.play(tip > 0 ? 'coin' : 'bad'));
kitchen.events.on('cook:warning', ({ level }) => audio.play(level === 'ready' ? 'ding' : level === 'burnt' ? 'burn' : 'bad'));
kitchen.events.on('customer:leave', ({ served }) => { if (!served) audio.play('bad'); });
kitchen.events.on('sfx', ({ name }) => audio.play(name));
kitchen.events.on('shift:phase', ({ phase, summary }) => {
  if (phase === 'ended' && summary) { closeMinigame(); ui.showSummary(summary); }
});
root.addEventListener('sfx', (e) => audio.play((e as CustomEvent).detail));
root.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// main loop
const clock = new THREE.Clock();
let acc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  acc += dt;
  kitchen.tick(dt);
  if (active) {
    active.mg.update(dt);
    (active as any).tickCook?.(dt);
    // grill/fry step finished by sim externally (e.g. burnt-away) -> nothing; sim keeps cooking.
  }
  ui.update(dt);
  renderer.update(dt);
  if (acc > 1) { acc = 0; (window as any).__fps = renderer.stats().fps; }
  requestAnimationFrame(frame);
}
ui.showTitle();
renderer.showKitchen();
requestAnimationFrame(frame);

// debug/testing hooks (used by Playwright)
(window as any).__game = { kitchen, renderer, ui, openStep, audio, recipeById, gestures,
  activeStep: () => active && active.stepIndex >= 0 ? kitchen.orders.find((o) => o.id === active!.orderId)?.steps[active!.stepIndex] : null };
