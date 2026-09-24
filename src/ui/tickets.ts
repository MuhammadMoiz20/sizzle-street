import type { Customer, Order, OrderStep } from '../game/types';
import { recipeById } from '../game/data';
import type { Kitchen } from '../sim/api';
import { h } from './dom';
import type { UIHooks } from './index';

const KIND_LABEL = { chop: 'CHOP', grill: 'GRILL', fry: 'FRY', stir: 'STIR', season: 'SEASON' } as const;

interface Live {
  card: HTMLElement;
  patience: HTMLElement;
  patienceText: HTMLElement;
  customer: Customer;
  chips: { step: OrderStep; btn: HTMLButtonElement; bar: HTMLElement | null; label: HTMLElement }[];
}

/** Ticket rail: rebuilt on order/customer events, bars updated each frame. */
export function createTicketRail(kitchen: Kitchen, hooks: UIHooks) {
  const el = h('section#tickets.ui', { 'aria-label': 'Order tickets' });
  let live: Live[] = [];

  const chip = (order: Order, i: number, step: OrderStep) => {
    const kind = KIND_LABEL[step.kind];
    const timed = step.kind === 'grill' || step.kind === 'fry';
    const bar = timed ? h('span.chip-bar', {}, h('span.chip-fill')) : null;
    const nextIdx = order.steps.findIndex((s) => s.status !== 'done' && !s.helperId);
    const isNext = i === nextIdx && step.status === 'pending';
    const label = h('span.chip-status', {}, step.helperId ? 'helper' : isNext ? 'TAP TO START' : step.status);
    if (isNext) label.style.cssText = 'color:var(--red);font-weight:800';
    const btn = h(`button.chip.s-${step.status}`, {
      type: 'button',
      'aria-label': `${kind} ${step.ingredient.replace(/_/g, ' ')}, ${step.status}`,
      onclick: () => hooks.onOpenStep(order.id, i),
    }, h('span.chip-kind', {}, kind), label, bar) as HTMLButtonElement;
    if (isNext) btn.style.borderColor = 'var(--red)';
    btn.disabled = step.status === 'done' || !!step.helperId;
    return { btn, bar: bar ? (bar.firstChild as HTMLElement) : null, label };
  };

  const card = (order: Order, customer: Customer): Live => {
    const recipe = recipeById(order.recipeId);
    const allDone = order.steps.every((s) => s.status === 'done');
    const chips = order.steps.map((s, i) => ({ ...chip(order, i, s), step: s }));
    const patience = h('span.patience-fill');
    const patienceText = h('span.patience-text', {}, '');
    const c = h(`article.ticket${customer.isCritic ? '.critic' : ''}`, { 'aria-label': `Order for ${customer.name}` },
      h('header.ticket-head', {},
        h('span.ticket-name', {}, customer.name),
        customer.isCritic ? h('span.badge', {}, 'CRITIC') : null),
      h('div.ticket-recipe', {}, recipe.name),
      h('div.patience', { role: 'progressbar', 'aria-label': 'Patience' }, patience, patienceText),
      h('div.chips', {}, ...chips.map((x) => x.btn)),
      allDone
        ? h('div.ticket-actions', {},
            h('button.btn.serve', { type: 'button', 'aria-label': `Serve ${recipe.name}`, onclick: () => hooks.onServe(order.id) }, 'SERVE'),
            h('button.btn.ghost.small', { type: 'button', 'aria-label': 'Scrap order', onclick: () => hooks.onScrap(order.id) }, 'scrap'))
        : h('div.ticket-actions', {},
            h('button.btn.ghost.small', { type: 'button', 'aria-label': 'Scrap order', onclick: () => hooks.onScrap(order.id) }, 'scrap')),
    );
    return { card: c, patience, patienceText, customer, chips };
  };

  const rebuild = () => {
    live = [];
    el.replaceChildren();
    const rows: [Order, Customer][] = [];
    for (const order of kitchen.orders) {
      if (order.servedAt !== undefined) continue;
      const customer = kitchen.customers.find((c) => c.id === order.customerId);
      if (!customer || customer.status === 'left') continue;
      rows.push([order, customer]);
    }
    rows.sort((a, b) => a[1].patience - b[1].patience); // most urgent first
    for (const [order, customer] of rows) {
      const l = card(order, customer);
      live.push(l);
      el.append(l.card);
    }
    if (!live.length) el.append(h('p.empty', {}, 'No orders yet. Customers are on their way.'));
    update();
  };

  const update = () => {
    for (const l of live) {
      const p = l.customer.patienceMax ? l.customer.patience / l.customer.patienceMax : 0;
      l.patience.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
      l.patience.style.background = `hsl(${p * 120} 70% 45%)`;
      l.patienceText.textContent = p < 0.25 ? `HURRY ${Math.ceil(l.customer.patience)}s` : `${Math.ceil(l.customer.patience)}s`;
      l.card.classList.toggle('low', p < 0.25);
      l.card.style.animation = p < 0.25 ? 'cooking 0.4s infinite alternate' : '';
      l.card.style.setProperty('--gold', p < 0.25 ? 'var(--bad)' : '');
      for (const c of l.chips) {
        if (c.step.helperId) { c.btn.disabled = true; c.label.textContent = 'helper'; }
        if (!c.bar || !c.step.cook || c.step.helperId) continue;
        const d = c.step.cook.elapsed / Math.max(0.01, c.step.cook.perfectAt);
        c.bar.style.width = `${Math.min(1, d / 1.5) * 100}%`;
        c.bar.style.background = d < 0.85 ? 'var(--ok)' : d < 1.15 ? 'var(--gold)' : 'var(--bad)';
        if (c.step.status === 'cooking') {
          c.label.textContent = d < 0.85 ? 'cooking' : d < 1.15 ? 'PULL NOW' : d < 1.8 ? 'OVER!' : 'BURNT';
          c.btn.classList.toggle('s-ready', d >= 0.85 && d < 1.15); // green flash = ready badge
          c.btn.style.borderColor = d >= 1.15 ? 'var(--bad)' : '';
          c.btn.style.background = d >= 1.15 ? '#fde3df' : '';
        }
      }
    }
  };

  return { el, rebuild, update };
}
