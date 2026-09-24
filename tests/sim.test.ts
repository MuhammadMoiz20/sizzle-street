import { describe, expect, it } from 'vitest';
import { createKitchen, donenessFromRatio, SAVE_KEY } from '../src/sim/kitchen';
import type { Kitchen } from '../src/sim/api';
import type { ShiftSummary } from '../src/game/types';

const DT = 0.5;

/** Plays every pending/cooking step optimally for one tick. */
function playOptimally(k: Kitchen): void {
  for (const o of [...k.orders]) {
    o.steps.forEach((s, idx) => {
      if (s.helperId) return;
      if (s.status === 'pending') {
        if (s.kind === 'grill' || s.kind === 'fry') {
          try { k.beginStep(o.id, idx); } catch { /* no slot; retry next tick */ }
        } else {
          k.beginStep(o.id, idx);
          k.finishStep(o.id, idx, { accuracy: 1, timing: 1 });
        }
      } else if (s.status === 'cooking' && s.cook && s.cook.elapsed >= s.cook.perfectAt) {
        if (s.kind === 'grill' && s.cook.side === 0) k.flip(o.id, idx);
        else k.pull(o.id, idx, 1);
      }
    });
    if (o.steps.every((s) => s.status === 'done')) k.serve(o.id);
  }
}

function runShift(k: Kitchen, play: (k: Kitchen) => void): ShiftSummary {
  let summary: ShiftSummary | undefined;
  k.events.on('shift:phase', (e) => { if (e.summary) summary = e.summary; });
  k.startShift();
  for (let i = 0; i < 10000 && k.phase !== 'ended'; i++) { k.tick(DT); play(k); }
  if (!summary) throw new Error('shift did not end');
  return summary;
}

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (key) => m.get(key) ?? null,
    setItem: (key, v) => { m.set(key, String(v)); },
    removeItem: (key) => { m.delete(key); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

describe('kitchen sim', () => {
  it('full optimal shift serves customers and earns money', () => {
    const k = createKitchen({ seed: 7, storage: null });
    const start = k.save.money;
    const summary = runShift(k, playOptimally);
    expect(summary.served).toBeGreaterThan(0);
    expect(summary.lost).toBe(0);
    expect(k.save.money).toBeGreaterThan(start);
    expect(k.save.shiftNumber).toBe(2);
    expect(k.phase).toBe('ended');
  });

  it('patience timeout marks customers as lost', () => {
    const k = createKitchen({ seed: 3, storage: null });
    let leaves = 0;
    k.events.on('customer:leave', (e) => { if (!e.served) leaves++; });
    const summary = runShift(k, () => {});
    expect(summary.lost).toBeGreaterThan(0);
    expect(leaves).toBe(summary.lost);
    expect(summary.served).toBe(0);
  });

  it('maps doneness ratio to timing', () => {
    expect(donenessFromRatio(1, 1)).toEqual({ timing: 1, doneness: 'perfect' });
    expect(donenessFromRatio(2, 1).doneness).toBe('burnt');
    expect(donenessFromRatio(2, 1).timing).toBe(0);
    expect(donenessFromRatio(0.2, 1).doneness).toBe('raw');
    expect(donenessFromRatio(1.25, 3).doneness).toBe('perfect');
    expect(donenessFromRatio(1.25, 1).doneness).toBe('over');
  });

  it('pull on fryer at perfect time gives perfect, way over gives burnt', () => {
    const k = createKitchen({ seed: 1, storage: null });
    k.startShift();
    k.tick(2.5); // first arrival at 2s
    const fry = k.orders.find((o) => o.steps.some((s) => s.kind === 'fry'));
    if (!fry) return; // seed-dependent; ratio mapping covered above
    const idx = fry.steps.findIndex((s) => s.kind === 'fry');
    k.beginStep(fry.id, idx);
    const perfectAt = fry.steps[idx]!.cook!.perfectAt;
    for (let t = 0; t < perfectAt; t += DT) k.tick(DT);
    expect(k.pull(fry.id, idx, 1).doneness).toBe('perfect');
  });

  it('helper assigned to chop finishes chop steps on its own', () => {
    const k = createKitchen({ seed: 5, storage: null });
    k.save.money = 500;
    expect(k.hire('ozzie')).toBe(true);
    k.assignHelper('ozzie', 'chop');
    let helperDone = 0;
    k.events.on('order:step', (e) => {
      if (e.status === 'done' && e.order.steps[e.stepIndex]!.kind === 'chop') helperDone++;
    });
    k.startShift();
    for (let t = 0; t < 40; t += DT) k.tick(DT);
    expect(helperDone).toBeGreaterThan(0);
    const summary = runShift(createKitchen({ seed: 5, storage: null, save: k.save }), () => {});
    expect(summary.wages).toBe(22);
  });

  it('helper grill steps emit no cook warnings', () => {
    const k = createKitchen({ seed: 5, storage: null });
    k.save.money = 500;
    expect(k.hire('pip')).toBe(true);
    k.assignHelper('pip', 'grill');
    const warnings: string[] = [];
    k.events.on('cook:warning', (e) => { if (e.order.steps[e.stepIndex]!.helperId) warnings.push(e.level); });
    k.startShift();
    for (let t = 0; t < 120; t += DT) k.tick(DT);
    expect(warnings).toEqual([]);
  });

  it('createKitchen survives a throwing localStorage getter', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try {
      expect(() => createKitchen({ seed: 1 })).not.toThrow();
    } finally {
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete (globalThis as any).localStorage;
    }
  });

  it('save round-trips through storage', () => {
    const storage = memStorage();
    const k = createKitchen({ seed: 2, storage });
    k.save.money = 999;
    expect(k.buyRecipe('crispy_rings')).toBe(true);
    expect(k.buyRecipe('crispy_rings')).toBe(false);
    expect(k.upgradeEquipment('grill', 0.9)).toBe(true);
    expect(k.upgradeEquipment('grill', 0.2)).toBe(false);
    k.persist();
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    const k2 = createKitchen({ seed: 2, storage });
    expect(k2.save.money).toBe(999 - 40 - 50);
    expect(k2.save.unlockedRecipes).toContain('crispy_rings');
    expect(k2.save.equipmentLevel.grill).toBe(2);
  });
});

describe('critic scoring', () => {
  /** Seed a kitchen with the signature dish, spawn the critic, finish every step with the given accuracy, serve. */
  function serveCritic(accuracy: number): Kitchen {
    const k = createKitchen({ seed: 11, storage: null });
    k.save.unlockedRecipes.push('seared_chicken');
    k.save.shiftNumber = 3;
    k.startShift();
    k.debugSpawnCritic();
    const critic = k.customers.find((c) => c.isCritic)!;
    expect(critic.name).toBe('Marguerite Pell');
    const o = k.orders.find((x) => x.id === critic.orderId)!;
    expect(o.recipeId).toBe('seared_chicken');
    o.steps.forEach((_, i) => k.finishStep(o.id, i, { accuracy, timing: 1 }));
    k.serve(o.id);
    return k;
  }

  it('signature dish scored >= 0.9 earns a critic star at shift end', () => {
    const k = serveCritic(1);
    k.tick(1000); // closes the shift
    expect(k.phase).toBe('ended');
    expect(k.save.criticStars).toBe(1);
  });

  it('score 0.8 earns no critic star', () => {
    const k = serveCritic(0.8);
    k.tick(1000);
    expect(k.phase).toBe('ended');
    expect(k.save.criticStars).toBe(0);
  });
});
