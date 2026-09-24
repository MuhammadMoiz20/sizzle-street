import type { MinigameKind, ShiftSummary } from '../game/types';
import { EQUIPMENT_UPGRADE_COST, HIREABLE_HELPERS, RECIPES, RESTAURANT, SPICES, recipeById } from '../game/data';
import type { Kitchen } from '../sim/api';
import { h, money } from './dom';
import type { UIHooks } from './index';

const KINDS: MinigameKind[] = ['chop', 'grill', 'fry', 'stir', 'season'];
const KIND_NAME: Record<MinigameKind, string> = { chop: 'Knife', grill: 'Grill', fry: 'Fryer', stir: 'Bowl', season: 'Shaker' };

export interface ScreenDeps {
  kitchen: Kitchen;
  hooks: UIHooks;
  toast(msg: string): void;
  go(screen: 'title' | 'market' | 'staff'): void;
  hide(): void;
  muted(): boolean;
}

const btn = (label: string, onclick: () => void, cls = 'btn', aria = label) =>
  h(`button.${cls.replace(/ /g, '.')}`, { type: 'button', 'aria-label': aria, onclick }, label) as HTMLButtonElement;

const moneyBar = (k: Kitchen) => h('div.money-bar', {}, h('span', {}, 'Wallet'), h('strong', {}, money(k.save.money)));

export function titleScreen(d: ScreenDeps): HTMLElement {
  const { kitchen, hooks } = d;
  const mute = btn(d.muted() ? 'Sound: off' : 'Sound: on', () => {
    mute.textContent = hooks.onToggleMute() ? 'Sound: off' : 'Sound: on';
  }, 'btn ghost', 'Toggle sound');

  // Inline two-tap confirm; ponytail: clears the whole origin's storage (save key lives in sim).
  let armed: number | undefined;
  const reset = btn('Reset save', () => {
    if (armed === undefined) {
      reset.textContent = 'Tap again to erase';
      reset.classList.add('danger');
      armed = window.setTimeout(() => { armed = undefined; reset.textContent = 'Reset save'; reset.classList.remove('danger'); }, 3000);
      return;
    }
    try { localStorage.clear(); } catch { /* blocked */ }
    location.reload();
  }, 'btn ghost small', 'Reset save');

  return h('div.screen#title', {},
    h('div.panel.center', {},
      h('p.eyebrow', {}, RESTAURANT.town),
      h('h1.logo', {}, 'Sizzle Street'),
      h('p.sub', {}, `${RESTAURANT.name} · ${RESTAURANT.tagline}`),
      moneyBar(kitchen),
      btn(`Start Shift ${kitchen.save.shiftNumber}`, hooks.onStartShift, 'btn primary big', `Start shift ${kitchen.save.shiftNumber}`),
      h('div.row', {}, btn('Market', () => d.go('market')), btn('Staff', () => d.go('staff'))),
      h('div.row', {}, mute, reset),
      h('p.stars-total', {}, `Critic stars: ${'★'.repeat(kitchen.save.criticStars)}${kitchen.save.criticStars ? '' : 'none yet'}`)));
}

export function summaryScreen(d: ScreenDeps, s: ShiftSummary): HTMLElement {
  const row = (k: string, v: string) => h('div.stat', {}, h('span', {}, k), h('strong', {}, v));
  const stars = h('div.stars', { 'aria-label': `${s.stars} of 3 stars` },
    ...[0, 1, 2].map((i) => h(`span.star${i < s.stars ? '.on' : ''}`, {}, '★')));
  return h('div.screen#summary', {},
    h('div.panel', {},
      h('p.eyebrow', {}, `Shift ${s.shiftNumber} closed`),
      stars,
      h('p.center', {}, `${s.stars} / 3 stars`),
      row('Earnings', money(s.earnings)),
      row('Tips', money(s.tips)),
      row('Wages', `-${money(s.wages)}`),
      row('Net', money(s.earnings + s.tips - s.wages)),
      row('Served / lost', `${s.served} / ${s.lost}`),
      s.bestDish ? row('Best dish', `${recipeById(s.bestDish.recipeId).name} (${Math.round(s.bestDish.score * 100)}%)`) : null,
      row('Critic stars', s.criticStars ? '★'.repeat(s.criticStars) : 'none'),
      btn('Continue', () => d.go('title'), 'btn primary big')));
}

export function marketScreen(d: ScreenDeps): HTMLElement {
  const { kitchen, hooks } = d;
  const refresh = () => d.go('market');
  const can = (cost: number) => kitchen.save.money >= cost;

  const recipes = RECIPES.map((r) => {
    const owned = kitchen.save.unlockedRecipes.includes(r.id);
    const b = owned ? h('span.tag', {}, 'Owned')
      : btn(`Buy ${money(r.unlockCost)}`, () => { kitchen.buyRecipe(r.id) ? d.toast(`Unlocked ${r.name}`) : d.toast('Not enough money'); refresh(); }, 'btn', `Buy ${r.name} for ${money(r.unlockCost)}`);
    if (b instanceof HTMLButtonElement) b.disabled = !can(r.unlockCost);
    return h('li.item', {}, h('div', {}, h('strong', {}, r.name), h('p.desc', {}, r.description)), b);
  });

  const spices = SPICES.map((s) => {
    const owned = kitchen.save.ownedSpices.includes(s.id);
    const b = owned ? h('span.tag', {}, 'Owned')
      : btn(`Buy ${money(s.cost)}`, () => { kitchen.buySpice(s.id) ? d.toast(`Bought ${s.name}`) : d.toast('Not enough money'); refresh(); }, 'btn', `Buy ${s.name} for ${money(s.cost)}`);
    if (b instanceof HTMLButtonElement) b.disabled = !can(s.cost);
    return h('li.item', {}, h('div', {}, h('strong', {}, s.name), h('p.desc', {}, `Tips +${Math.round((s.tipBonus - 1) * 100)}%`)), b);
  });

  const equipment = KINDS.map((k) => {
    const level = kitchen.save.equipmentLevel[k] ?? 1;
    const cost = EQUIPMENT_UPGRADE_COST[level];
    const dots = h('span.dots', { 'aria-label': `Level ${level} of 3` }, ...[1, 2, 3].map((i) => h(`i${i <= level ? '.on' : ''}`)));
    const b = cost === undefined ? h('span.tag', {}, 'Maxed')
      : btn(`${k === 'chop' ? 'Sharpen' : 'Upgrade'} ${money(cost)}`, async () => {
          d.hide();
          const score = await hooks.onEquipmentMinigame(k);
          const ok = kitchen.upgradeEquipment(k, score);
          d.toast(ok ? `${KIND_NAME[k]} upgraded to level ${level + 1}` : `Upgrade failed (${Math.round(score * 100)}%)`);
          refresh();
        }, 'btn', `Upgrade ${KIND_NAME[k]} for ${money(cost)}`);
    if (b instanceof HTMLButtonElement) b.disabled = !can(cost ?? 0);
    return h('li.item', {}, h('div', {}, h('strong', {}, `${KIND_NAME[k]} (${k})`), dots), b);
  });

  return h('div.screen#market', {},
    h('div.panel', {},
      h('h2', {}, 'Market'), moneyBar(kitchen),
      h('h3', {}, 'Recipes'), h('ul.list', {}, ...recipes),
      h('h3', {}, 'Spices'), h('ul.list', {}, ...spices),
      h('h3', {}, 'Equipment'), h('ul.list', {}, ...equipment),
      btn('Back', () => d.go('title'), 'btn primary big')));
}

export function staffScreen(d: ScreenDeps): HTMLElement {
  const { kitchen } = d;
  const refresh = () => d.go('staff');
  const items = HIREABLE_HELPERS.map((def) => {
    const hired = kitchen.save.helpers.find((x) => x.id === def.id);
    const head = h('div', {},
      h('strong', {}, def.name),
      h('p.desc', {}, `Wage ${money(def.wagePerShift)}/shift · speed ${Math.round(def.speed * 100)}% · accuracy ${Math.round(def.accuracy * 100)}%`));
    if (!hired) {
      const b = btn(`Hire ${money(def.hireCost)}`, () => { kitchen.hire(def.id) ? d.toast(`Hired ${def.name}`) : d.toast('Not enough money'); refresh(); }, 'btn', `Hire ${def.name} for ${money(def.hireCost)}`);
      b.disabled = kitchen.save.money < def.hireCost;
      return h('li.item', {}, head, b);
    }
    const stations = h('div.stations', { role: 'group', 'aria-label': `${def.name} station` },
      ...[...KINDS, undefined].map((k) =>
        btn(k ?? 'none', () => { kitchen.assignHelper(def.id, k); refresh(); },
          `btn toggle${hired.station === k ? ' on' : ''}`, `Assign ${def.name} to ${k ?? 'no station'}`)));
    return h('li.item.col', {}, head, stations);
  });
  return h('div.screen#staff', {},
    h('div.panel', {},
      h('h2', {}, 'Staff'), moneyBar(kitchen),
      h('ul.list', {}, ...items),
      btn('Back', () => d.go('title'), 'btn primary big')));
}
