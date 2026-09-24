import type {
  Customer, Helper, MinigameKind, Order, OrderStep, SaveData, ShiftPhase, ShiftSummary, StepResult,
} from '../game/types';
import { Emitter } from '../game/events';
import {
  CRITIC, CUSTOMER_NAMES, EQUIPMENT_UPGRADE_COST, HIREABLE_HELPERS, RECIPES, RESTAURANT, SPICES,
  recipeById,
} from '../game/data';
import type { Kitchen, KitchenOptions } from './api';

export const SAVE_KEY = 'sizzle-street-save';
const CLOSING_GRACE = 30;
const HELPER_BASE_TIME = 6;
const PERFECT_WINDOW = [0, 0.15, 0.22, 0.3];

/** mulberry32 seeded PRNG -> () => [0,1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    money: 60,
    shiftNumber: 1,
    unlockedRecipes: RECIPES.filter((r) => r.unlockCost === 0).map((r) => r.id),
    ownedSpices: [],
    helpers: [],
    equipmentLevel: { chop: 1, grill: 1, fry: 1, stir: 1, season: 1 },
    criticStars: 0,
    totalStars: 0,
    bestScores: {},
  };
}

function loadSave(storage: Storage | null): SaveData | undefined {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return undefined;
    return { ...defaultSave(), ...parsed };
  } catch {
    return undefined;
  }
}

/** Doneness ratio -> timing/doneness, window widened by equipment level. */
export function donenessFromRatio(r: number, level: number): Pick<StepResult, 'timing' | 'doneness'> {
  const w = PERFECT_WINDOW[Math.min(3, Math.max(1, level))]!;
  if (r < 0.5) return { timing: 0, doneness: 'raw' };
  if (r < 1 - w) return { timing: 0.3 + 0.55 * ((r - 0.5) / (0.5 - w)), doneness: 'under' };
  if (r <= 1 + w) return { timing: 1, doneness: 'perfect' };
  if (r < 1.6) return { timing: 0.85 - 0.55 * ((r - 1 - w) / (0.6 - w)), doneness: 'over' };
  return { timing: 0, doneness: 'burnt' };
}

/** Per-step transient state the sim keeps off the public OrderStep. */
interface StepExtra { side0Ratio: number; warned: number /* 0 none,1 ready,2 over,3 burnt */ }

export function createKitchen(opts: KitchenOptions = {}): Kitchen & { debugSpawnCritic(): void } {
  let storage: Storage | null = opts.storage ?? null;
  if (opts.storage === undefined) {
    try { storage = globalThis.localStorage ?? null; } catch { storage = null; }
  }
  const save: SaveData = opts.save ?? loadSave(storage) ?? defaultSave();
  const rnd = mulberry32(opts.seed ?? 1);
  const events = new Emitter();

  let phase: ShiftPhase = 'idle';
  let elapsed = 0;
  let closingAt = 0;
  let nextArrival = 0;
  let idCounter = 0;
  let criticPending = false;
  const customers: Customer[] = [];
  const orders: Order[] = [];
  const extras = new WeakMap<OrderStep, StepExtra>();
  const slots: Record<'grill' | 'fry', boolean[]> = { grill: [], fry: [] };
  let summary: ShiftSummary = blankSummary();

  const slotCount = (kind: 'grill' | 'fry'): number => 2 + (save.equipmentLevel[kind] >= 3 ? 1 : 0);
  const nextId = (p: string): string => `${p}${++idCounter}`;
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;

  function blankSummary(): ShiftSummary {
    return { shiftNumber: save.shiftNumber, earnings: 0, tips: 0, wages: 0, served: 0, lost: 0, stars: 0, criticStars: 0 };
  }

  function setMoney(delta: number): void {
    save.money += delta;
    events.emit('money', { money: save.money, delta });
  }

  function findOrder(orderId: string): Order {
    const o = orders.find((x) => x.id === orderId);
    if (!o) throw new Error(`unknown order ${orderId}`);
    return o;
  }

  function step(orderId: string, idx: number): [Order, OrderStep] {
    const o = findOrder(orderId);
    const s = o.steps[idx];
    if (!s) throw new Error(`bad step ${idx}`);
    return [o, s];
  }

  function setStatus(o: Order, idx: number, status: OrderStep['status']): void {
    o.steps[idx]!.status = status;
    events.emit('order:step', { order: o, stepIndex: idx, status });
  }

  function takeSlot(kind: 'grill' | 'fry'): number {
    const arr = slots[kind];
    for (let i = 0; i < slotCount(kind); i++) if (!arr[i]) { arr[i] = true; return i; }
    return -1;
  }

  function freeStep(s: OrderStep): void {
    if (s.cook && (s.kind === 'grill' || s.kind === 'fry')) slots[s.kind][s.cook.slotIndex] = false;
    s.cook = undefined;
    extras.delete(s);
  }

  function startCooking(o: Order, idx: number): boolean {
    const s = o.steps[idx]!;
    if (s.kind === 'grill' || s.kind === 'fry') {
      const slot = takeSlot(s.kind);
      if (slot < 0) return false;
      s.cook = { elapsed: 0, side: 0, flipped: false, perfectAt: s.cookTime ?? 8, slotIndex: slot };
      extras.set(s, { side0Ratio: 0, warned: 0 });
      events.emit('sfx', { name: s.kind === 'grill' ? 'sizzle_start' : 'fry_drop' });
    }
    setStatus(o, idx, 'cooking');
    return true;
  }

  function finish(o: Order, idx: number, result: StepResult): void {
    const s = o.steps[idx]!;
    freeStep(s);
    s.result = result;
    s.helperId = undefined;
    setStatus(o, idx, 'done');
  }

  function ratioOf(s: OrderStep): number {
    const c = s.cook!;
    const cur = c.elapsed / c.perfectAt;
    if (s.kind !== 'grill') return cur;
    const ex = extras.get(s)!;
    return c.flipped ? (ex.side0Ratio + cur) / 2 : cur / 2;
  }

  function spawnCustomer(critic: boolean): void {
    const used = new Set(customers.map((c) => c.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const unlocked = save.unlockedRecipes.map(recipeById);
    const recipe = critic
      ? (unlocked.find((r) => r.signature) ?? unlocked.reduce((a, b) => (b.price > a.price ? b : a)))
      : pick(unlocked);
    const patienceMax = critic
      ? 150
      : 60 + 6 * recipe.steps.length + (save.shiftNumber === 1 ? 15 : 0);
    const customer: Customer = {
      id: nextId('c'), name: critic ? CRITIC.name : pick(CUSTOMER_NAMES), seat,
      patience: patienceMax, patienceMax, status: 'waiting', isCritic: critic || undefined, arrivedAt: elapsed,
    };
    const order: Order = {
      id: nextId('o'), customerId: customer.id, recipeId: recipe.id, createdAt: elapsed,
      steps: recipe.steps.map((d) => ({ ...d, status: 'pending' as const })),
    };
    customer.orderId = order.id;
    customers.push(customer);
    orders.push(order);
    events.emit('customer:arrive', { customer });
    events.emit('customer:order', { customer, order });
    events.emit('sfx', { name: 'bell' });
  }

  function removeCustomer(c: Customer, served: boolean): void {
    customers.splice(customers.indexOf(c), 1);
    const oi = orders.findIndex((o) => o.id === c.orderId);
    if (oi >= 0) {
      const o = orders[oi]!;
      for (const s of o.steps) {
        freeStep(s);
        if (s.helperId) {
          const h = save.helpers.find((x) => x.id === s.helperId);
          if (h) h.busyWith = undefined;
        }
      }
      orders.splice(oi, 1);
    }
    events.emit('customer:leave', { customer: c, served });
  }

  function tickCook(dt: number): void {
    for (const o of orders) {
      o.steps.forEach((s, idx) => {
        if (s.status !== 'cooking' || !s.cook || s.helperId) return;
        const c = s.cook;
        c.elapsed += dt;
        const ex = extras.get(s)!;
        const r = c.elapsed / c.perfectAt;
        const lvl = r >= 1.8 ? 3 : r >= 1.35 ? 2 : r >= 1 ? 1 : 0;
        if (lvl > ex.warned) {
          ex.warned = lvl;
          events.emit('cook:warning', { order: o, stepIndex: idx, level: (['ready', 'overcooking', 'burnt'] as const)[lvl - 1]! });
        }
      });
    }
  }

  function tickHelpers(dt: number): void {
    for (const h of save.helpers) {
      if (!h.station) continue;
      if (h.busyWith) {
        const o = orders.find((x) => x.id === h.busyWith!.orderId);
        const s = o?.steps[h.busyWith.stepIndex];
        if (!o || !s || s.helperId !== h.id) { h.busyWith = undefined; continue; }
        h.busyWith.remaining -= dt;
        const total = helperTime(h, s);
        if (s.cook) s.cook.elapsed += dt; // tickCook skips helper-owned steps
        if (s.kind === 'grill' && s.cook && !s.cook.flipped && h.busyWith.remaining <= total / 2) {
          const ex = extras.get(s)!;
          ex.side0Ratio = s.cook.elapsed / s.cook.perfectAt;
          ex.warned = 0;
          s.cook.flipped = true; s.cook.side = 1; s.cook.elapsed = 0;
        }
        if (h.busyWith.remaining <= 0) {
          const timing = h.accuracy;
          const accuracy = Math.min(1, Math.max(0, h.accuracy + (rnd() * 0.2 - 0.1)));
          const result: StepResult = { accuracy, timing };
          if (s.kind === 'grill' || s.kind === 'fry') result.doneness = timing > 0.7 ? 'perfect' : 'under';
          finish(o, h.busyWith.stepIndex, result);
          h.busyWith = undefined;
        }
        continue;
      }
      // idle: find oldest order's first pending step of this kind
      for (const o of orders) {
        const idx = o.steps.findIndex((s) => s.status === 'pending' && s.kind === h.station && !s.helperId);
        if (idx < 0) continue;
        const s = o.steps[idx]!;
        if (!startCooking(o, idx)) break; // no slot; wait
        s.helperId = h.id;
        h.busyWith = { orderId: o.id, stepIndex: idx, remaining: helperTime(h, s) };
        break;
      }
    }
  }

  function helperTime(h: Helper, s: OrderStep): number {
    const base = s.kind === 'grill' ? (s.cookTime ?? 8) * 2 : s.kind === 'fry' ? (s.cookTime ?? 8) : HELPER_BASE_TIME;
    return base / Math.max(0.05, h.speed);
  }

  function endShift(): void {
    for (const c of [...customers]) {
      if (c.status !== 'served') summary.lost++;
      removeCustomer(c, c.status === 'served');
    }
    for (const h of save.helpers) h.busyWith = undefined;
    summary.wages = save.helpers.reduce((a, h) => a + h.wagePerShift, 0);
    summary.stars = summary.lost === 0 && summary.served >= 3 ? 3
      : summary.lost <= 1 ? 2 : summary.served >= 1 ? 1 : 0;
    setMoney(summary.earnings - summary.wages);
    save.totalStars += summary.stars;
    save.criticStars += summary.criticStars;
    save.shiftNumber++;
    phase = 'ended';
    persist();
    events.emit('shift:phase', { phase, summary });
  }

  function persist(): void {
    try { storage?.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
  }

  const kitchen: Kitchen & { debugSpawnCritic(): void } = {
    events, save,
    get phase() { return phase; },
    get elapsed() { return elapsed; },
    get remaining() { return Math.max(0, RESTAURANT.shiftLength - elapsed); },
    customers, orders,
    get grillSlots() { return slotCount('grill'); },
    get fryerSlots() { return slotCount('fry'); },

    startShift() {
      elapsed = 0;
      customers.length = 0;
      orders.length = 0;
      slots.grill = []; slots.fry = [];
      idCounter = 0;
      summary = blankSummary();
      nextArrival = 2;
      criticPending = save.shiftNumber > 2 && rnd() < 0.35;
      for (const h of save.helpers) h.busyWith = undefined;
      phase = 'running';
      events.emit('shift:phase', { phase });
    },

    tick(dt) {
      if (phase !== 'running' && phase !== 'closing') return;
      elapsed += dt;

      if (phase === 'running') {
        if (elapsed >= nextArrival && customers.length < RESTAURANT.seats) {
          const critic = criticPending && elapsed >= RESTAURANT.shiftLength * 0.4;
          if (critic) criticPending = false;
          spawnCustomer(critic);
          nextArrival = elapsed + Math.max(8, 20 - 1.5 * (save.shiftNumber - 1));
        }
        if (elapsed >= RESTAURANT.shiftLength) {
          phase = 'closing';
          closingAt = elapsed;
          events.emit('shift:phase', { phase });
        }
      }

      tickCook(dt);
      tickHelpers(dt);

      for (const c of [...customers]) {
        if (c.status === 'served' || c.status === 'left') { removeCustomer(c, c.status === 'served'); continue; }
        if (c.status !== 'waiting') continue;
        c.patience = Math.max(0, c.patience - dt);
        if (c.patience <= 0) {
          c.status = 'left';
          summary.lost++;
          events.emit('sfx', { name: 'bad' });
          removeCustomer(c, false);
        }
      }

      events.emit('shift:tick', { elapsed, remaining: kitchen.remaining });
      if (phase === 'closing' && (customers.length === 0 || elapsed - closingAt >= CLOSING_GRACE)) endShift();
    },

    beginStep(orderId, idx) {
      const [o, s] = step(orderId, idx);
      if (s.status !== 'pending') throw new Error('step not pending');
      if (!startCooking(o, idx)) throw new Error(`no free ${s.kind} slot`);
    },

    flip(orderId, idx) {
      const [, s] = step(orderId, idx);
      if (s.kind !== 'grill' || !s.cook || s.cook.side !== 0) throw new Error('cannot flip');
      const ex = extras.get(s)!;
      ex.side0Ratio = s.cook.elapsed / s.cook.perfectAt;
      ex.warned = 0;
      s.cook.side = 1; s.cook.flipped = true; s.cook.elapsed = 0;
    },

    pull(orderId, idx, accuracy) {
      const [o, s] = step(orderId, idx);
      if (!s.cook) throw new Error('nothing cooking');
      const r = ratioOf(s);
      const result: StepResult = { accuracy, ...donenessFromRatio(r, save.equipmentLevel[s.kind]) };
      finish(o, idx, result);
      events.emit('sfx', { name: s.kind === 'grill' ? 'sizzle_loop_stop' : 'fry_pull' });
      return result;
    },

    finishStep(orderId, idx, result) {
      const [o] = step(orderId, idx);
      finish(o, idx, { ...result, timing: result.timing ?? 1 });
    },

    serve(orderId) {
      const o = findOrder(orderId);
      if (!o.steps.every((s) => s.status === 'done' && s.result)) throw new Error('order incomplete');
      const c = customers.find((x) => x.id === o.customerId);
      if (!c || c.status !== 'waiting') throw new Error('customer gone');
      const recipe = recipeById(o.recipeId);
      const results = o.steps.map((s) => s.result!);
      let score = results.reduce((a, r) => a + 0.6 * r.accuracy + 0.4 * r.timing, 0) / results.length;
      if (results.some((r) => r.overSeasoned)) score *= 0.85;
      if (results.some((r) => r.doneness === 'raw')) score = 0;
      const patienceFrac = c.patience / c.patienceMax;
      const spiceMult = SPICES.filter((sp) => save.ownedSpices.includes(sp.id)).reduce((a, sp) => a * sp.tipBonus, 1);
      const tip = recipe.price * (0.15 + 0.35 * score) * (0.5 + 0.5 * patienceFrac) * spiceMult;
      o.score = score; o.tip = tip; o.servedAt = elapsed;
      summary.earnings += recipe.price + tip;
      summary.tips += tip;
      summary.served++;
      if (!summary.bestDish || score > summary.bestDish.score) summary.bestDish = { recipeId: recipe.id, score };
      if (score > (save.bestScores[recipe.id] ?? 0)) save.bestScores[recipe.id] = score;
      if (c.isCritic && recipe.signature && score >= 0.9) {
        summary.criticStars++;
        events.emit('sfx', { name: 'critic' });
      }
      c.status = 'served';
      events.emit('order:served', { order: o, customer: c, tip, score });
      events.emit('sfx', { name: 'coin' });
      events.emit('money', { money: save.money, delta: 0 });
    },

    scrap(orderId) {
      const o = findOrder(orderId);
      o.steps.forEach((s, idx) => {
        freeStep(s);
        if (s.helperId) {
          const h = save.helpers.find((x) => x.id === s.helperId);
          if (h) h.busyWith = undefined;
          s.helperId = undefined;
        }
        s.result = undefined;
        setStatus(o, idx, 'pending');
      });
    },

    hire(helperId) {
      const def = HIREABLE_HELPERS.find((h) => h.id === helperId);
      if (!def || save.helpers.some((h) => h.id === helperId) || save.money < def.hireCost) return false;
      setMoney(-def.hireCost);
      save.helpers.push({ ...def });
      persist();
      return true;
    },

    assignHelper(helperId, station) {
      const h = save.helpers.find((x) => x.id === helperId);
      if (h) { h.station = station; h.busyWith = undefined; persist(); }
    },

    buyRecipe(recipeId) {
      const r = RECIPES.find((x) => x.id === recipeId);
      if (!r || save.unlockedRecipes.includes(recipeId) || save.money < r.unlockCost) return false;
      setMoney(-r.unlockCost);
      save.unlockedRecipes.push(recipeId);
      persist();
      return true;
    },

    buySpice(spiceId) {
      const sp = SPICES.find((x) => x.id === spiceId);
      if (!sp || save.ownedSpices.includes(spiceId) || save.money < sp.cost) return false;
      setMoney(-sp.cost);
      save.ownedSpices.push(spiceId);
      persist();
      return true;
    },

    upgradeEquipment(kind: MinigameKind, minigameScore) {
      const level = save.equipmentLevel[kind];
      const cost = EQUIPMENT_UPGRADE_COST[level];
      if (level >= 3 || cost === undefined || minigameScore < 0.6 || save.money < cost) return false;
      setMoney(-cost);
      save.equipmentLevel[kind] = level + 1;
      persist();
      return true;
    },

    persist,
    /** Test-only: spawn the critic now (shift must be running). */
    debugSpawnCritic() { if (phase === 'running' && customers.length < RESTAURANT.seats) { criticPending = false; spawnCustomer(true); } },
  };
  return kitchen;
}
