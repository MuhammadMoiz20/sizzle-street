import './styles.css';
import type { MinigameKind, ShiftSummary } from '../game/types';
import type { Kitchen } from '../sim/api';
import { h } from './dom';
import { createHud } from './hud';
import { createTicketRail } from './tickets';
import { marketScreen, staffScreen, summaryScreen, titleScreen, type ScreenDeps } from './screens';

export interface UIHooks {
  onOpenStep(orderId: string, stepIndex: number): void;
  onServe(orderId: string): void;
  onScrap(orderId: string): void;
  onStartShift(): void;
  /** Runs an equipment upgrade minigame; resolves 0..1. */
  onEquipmentMinigame(kind: MinigameKind): Promise<number>;
  /** Returns the new muted state. */
  onToggleMute(): boolean;
  isMuted?(): boolean;
  /** Player backed out of a minigame via the chrome back button. */
  onExitMinigame?(): void;
}

export interface UI {
  showTitle(): void;
  showKitchen(): void;
  showSummary(s: ShiftSummary): void;
  showMarket(): void;
  showStaff(): void;
  showMinigameChrome(kind: MinigameKind, on: boolean): void;
  setOverlayTarget(el: HTMLElement): void;
  update(dt: number): void;
  hud: HTMLElement;
  overlay: HTMLElement;
  toast(msg: string): void;
  dispose(): void;
}

export function createUI(root: HTMLElement, kitchen: Kitchen, hooks: UIHooks): UI {
  const hud = document.createElement('div');
  hud.id = 'hud';
  const chrome = createHud(kitchen);
  const rail = createTicketRail(kitchen, hooks);
  chrome.root.insertBefore(rail.el, chrome.root.children[1] ?? null); // after topbar
  chrome.root.append(chrome.overlay);
  const screenHost = document.createElement('div');
  screenHost.id = 'screens';
  hud.append(chrome.root, screenHost, chrome.toasts);
  root.append(hud);

  let muted = hooks.isMuted?.() ?? false;
  if (hooks.onExitMinigame) chrome.mgBack.append(h('button.btn.small', { type: 'button', 'aria-label': 'Back to tickets', onclick: () => hooks.onExitMinigame!() }, '← Back'));
  const deps: ScreenDeps = {
    kitchen, toast: chrome.toast, muted: () => muted,
    hooks: { ...hooks, onToggleMute: () => (muted = hooks.onToggleMute()) },
    go: (s) => (s === 'title' ? ui.showTitle() : s === 'market' ? ui.showMarket() : ui.showStaff()),
    hide: () => showScreen(null),
  };

  const showScreen = (el: HTMLElement | null) => {
    screenHost.replaceChildren(...(el ? [el] : []));
    chrome.root.classList.toggle('hidden', !!el);
  };

  let seatClock = 0;
  const offs = [
    kitchen.events.on('customer:arrive', () => { rail.rebuild(); chrome.rebuildSeats(); }),
    kitchen.events.on('customer:order', () => { rail.rebuild(); chrome.rebuildSeats(); }),
    kitchen.events.on('customer:leave', () => { rail.rebuild(); chrome.rebuildSeats(); }),
    kitchen.events.on('order:step', () => rail.rebuild()),
    kitchen.events.on('order:served', () => { rail.rebuild(); chrome.rebuildSeats(); }),
    kitchen.events.on('shift:tick', ({ remaining }) => chrome.setClock(remaining)),
    kitchen.events.on('money', ({ money }) => chrome.setMoney(money)),
    kitchen.events.on('cook:warning', ({ order, stepIndex, level }) => {
      const step = order.steps[stepIndex];
      const what = step ? step.ingredient.replace(/_/g, ' ') : 'food';
      chrome.toast(level === 'ready' ? `${what} is ready to pull` : level === 'overcooking' ? `${what} is overcooking!` : `${what} burnt!`);
    }),
  ];

  const ui: UI = {
    hud,
    overlay: chrome.overlay,
    toast: chrome.toast,
    showTitle: () => showScreen(titleScreen(deps)),
    showSummary: (s) => showScreen(summaryScreen(deps, s)),
    showMarket: () => showScreen(marketScreen(deps)),
    showStaff: () => showScreen(staffScreen(deps)),
    showKitchen: () => {
      showScreen(null);
      chrome.setShift(kitchen.save.shiftNumber);
      chrome.setMoney(kitchen.save.money);
      chrome.setClock(kitchen.remaining);
      rail.rebuild();
      chrome.rebuildSeats();
    },
    showMinigameChrome: (kind, on) => chrome.showMinigame(kind, on),
    setOverlayTarget: (el) => {
      el.id = 'mg-overlay';
      el.classList.add('ui');
      chrome.overlay.replaceWith(el);
      chrome.overlay = el;
      ui.overlay = el;
    },
    update: (dt) => {
      if (chrome.root.classList.contains('hidden')) return;
      rail.update();
      seatClock += dt;
      if (seatClock > 0.5) { seatClock = 0; chrome.rebuildSeats(); }
    },
    dispose: () => { offs.forEach((f) => f()); hud.remove(); },
  };
  return ui;
}
