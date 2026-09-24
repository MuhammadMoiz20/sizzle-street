import type { MinigameKind } from '../game/types';
import { RESTAURANT } from '../game/data';
import type { Kitchen } from '../sim/api';
import { clock, h, money } from './dom';

const MOOD_LABEL = { happy: 'happy', neutral: 'ok', annoyed: 'annoyed', angry: 'angry' } as const;
const MG_TITLE: Record<MinigameKind, string> = {
  chop: 'CHOP — swipe across the board',
  grill: 'GRILL — flip, then pull at the right time',
  fry: 'FRY — drop in, pull when golden',
  stir: 'STIR — circle the bowl',
  season: 'SEASON — shake to the mark',
};

const initials = (name: string) => name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();

/** Kitchen HUD chrome: top bar, seats strip, minigame header, toasts. */
export function createHud(kitchen: Kitchen) {
  const clockEl = h('span#clock', { 'aria-label': 'Time remaining' }, clock(kitchen.remaining));
  const moneyEl = h('span#money', { 'aria-label': 'Money' }, money(kitchen.save.money));
  const shiftEl = h('span#shift', {}, `Shift ${kitchen.save.shiftNumber}`);
  const topbar = h('header#topbar.ui', {}, clockEl, moneyEl, shiftEl);

  const seats = h('section#seats.ui', { 'aria-label': 'Seats' });
  const rebuildSeats = () => {
    seats.replaceChildren();
    for (let i = 0; i < RESTAURANT.seats; i++) {
      const c = kitchen.customers.find((x) => x.seat === i && x.status !== 'left');
      const p = c ? c.patience / Math.max(1, c.patienceMax) : 1;
      const mood: keyof typeof MOOD_LABEL | 'empty' =
        !c ? 'empty' : p > 0.6 ? 'happy' : p > 0.35 ? 'neutral' : p > 0.15 ? 'annoyed' : 'angry';
      const label = mood === 'empty' ? '' : MOOD_LABEL[mood];
      seats.append(h(`div.seat.m-${mood}`, { 'aria-label': c ? `${c.name}, ${label}` : `Seat ${i + 1} empty` },
        h('span.avatar', {}, c ? initials(c.name) : '·'),
        h('span.seat-name', {}, c ? c.name.split(' ')[0] : 'empty'),
        h('span.seat-mood', {}, label)));
    }
  };

  const mgBack = h('div#mg-back', { 'aria-label': 'Back button slot' });
  const mgTitle = h('h2#mg-title');
  const mgChrome = h('header#mg-chrome.ui.hidden', {}, mgBack, mgTitle);
  const overlay = h('div#mg-overlay.ui');

  const toasts = h('div#toasts', { 'aria-live': 'polite' });
  const toast = (msg: string) => {
    const t = h('div.toast', {}, msg);
    toasts.append(t);
    while (toasts.children.length > 4) toasts.firstChild?.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2200);
  };

  const root = h('div#kitchen-hud.hidden', {}, topbar, seats, mgChrome);

  return {
    root, overlay, toasts, toast, rebuildSeats, mgBack,
    setClock: (s: number) => { clockEl.textContent = clock(s); clockEl.classList.toggle('urgent', s < 20); },
    setMoney: (m: number) => { moneyEl.textContent = money(m); },
    setShift: (n: number) => { shiftEl.textContent = `Shift ${n}`; },
    showMinigame(kind: MinigameKind, on: boolean) {
      mgChrome.classList.toggle('hidden', !on);
      mgTitle.textContent = MG_TITLE[kind];
      root.classList.toggle('in-minigame', on);
    },
  };
}
