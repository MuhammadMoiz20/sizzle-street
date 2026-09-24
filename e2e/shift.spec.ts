import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

fs.mkdirSync('e2e/screens', { recursive: true });
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.png` });

/** Drive a gesture through real pointer events on the canvas (works for mouse and touch emulation). */
async function stroke(page: Page, pts: [number, number][], stepMs = 16) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y, { steps: 2 }); await page.waitForTimeout(stepMs); }
  await page.mouse.up();
}

async function centerOfCanvas(page: Page) {
  const box = (await page.locator('canvas').first().boundingBox())!;
  return { cx: box.x + box.width / 2, cy: box.y + box.height * 0.5, w: box.width, h: box.height };
}

async function playStep(page: Page, kind: string) {
  const { cx, cy, w, h } = await centerOfCanvas(page);
  if (kind === 'chop') {
    for (let i = 0; i < 9; i++) {
      await stroke(page, [[cx - 0.2 * w, cy - 60], [cx + 0.2 * w, cy + 60]], 8);
      await page.waitForTimeout(220);
    }
  } else if (kind === 'stir') {
    const pts: [number, number][] = [];
    const r = Math.min(w, h) * 0.18;
    for (let k = 0; k < 7 * 16; k++) { const a = (k / 16) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    await stroke(page, pts, 12);
  } else if (kind === 'season') {
    const pts: [number, number][] = [[cx, cy]];
    for (let k = 0; k < 8; k++) pts.push([cx + (k % 2 ? 60 : -60), cy]);
    await stroke(page, pts, 40);
    await page.getByRole('button', { name: /done/i }).click();
  } else if (kind === 'grill' || kind === 'fry') {
    // wait until sim says perfect, then flip/pull via buttons or swipes
    const waitReady = () => page.waitForFunction(() => {
      const s = (window as any).__game.activeStep?.(); return s?.cook && s.cook.elapsed >= s.cook.perfectAt;
    }, null, { timeout: 30000 });
    if (kind === 'grill') {
      await waitReady();
      await stroke(page, [[cx, cy + 80], [cx, cy - 120]], 4); // swipe up = flip
      await page.waitForTimeout(300);
      await waitReady();
    } else {
      const drop = page.getByRole('button', { name: /drop/i });
      if (await drop.count()) await drop.first().click();
      await waitReady();
    }
    await page.getByRole('button', { name: /pull/i }).click();
  }
}

for (const [name, viewport] of [['desktop', null], ['mobile', null]] as const) void name, viewport;

test('full shift start to finish', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: /start shift/i })).toBeVisible();
  const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(hasHScroll).toBe(false);
  await shot(page, 'title');
  await page.getByRole('button', { name: /start shift/i }).click();

  const fps: number[] = [];
  const served = new Set<string>();
  const deadline = Date.now() + 200_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const g = (window as any).__game;
      return {
        phase: g.kitchen.phase,
        fps: (window as any).__fps ?? 0,
        orders: g.kitchen.orders.map((o: any) => ({ id: o.id, servedAt: o.servedAt, steps: o.steps.map((s: any) => ({ kind: s.kind, status: s.status, helper: !!s.helperId })) })),
      };
    });
    if (state.fps) fps.push(state.fps);
    if (state.phase === 'ended') break;
    const order = state.orders.find((o: any) => !o.servedAt);
    if (!order) { await page.waitForTimeout(500); continue; }
    const idx = order.steps.findIndex((s: any) => s.status !== 'done' && !s.helper);
    if (idx === -1) {
      await page.getByRole('button', { name: /serve/i }).first().click();
      served.add(order.id);
      continue;
    }
    const step = order.steps[idx];
    console.log(`t=${((Date.now() - (deadline - 200_000)) / 1000).toFixed(0)}s order=${order.id} step=${idx} ${step.kind} ${step.status}`);
    await page.evaluate(([id, i]) => (window as any).__game.openStep(id, i), [order.id, idx] as const);
    await page.waitForTimeout(400);
    if (served.size === 0) await shot(page, `mg-${step.kind}`);
    await playStep(page, step.kind).catch((e) => console.log('step failed', step.kind, String(e).split('\n')[0]));
    await page.waitForTimeout(300);
  }
  await shot(page, 'end');
  const avg = fps.reduce((a, b) => a + b, 0) / Math.max(1, fps.length);
  const min = Math.min(...fps);
  console.log(`[${test.info().project.name}] served=${served.size} avgFps=${avg.toFixed(1)} minFps=${min}`);
  fs.appendFileSync('e2e/screens/fps.log', `${test.info().project.name} served=${served.size} avg=${avg.toFixed(1)} min=${min}\n`);
  expect(served.size).toBeGreaterThan(0);
  await expect(page.getByText(/earnings/i)).toBeVisible({ timeout: 60_000 });
  await shot(page, 'summary');
  // save/reload
  const shiftBefore = await page.evaluate(() => (window as any).__game.kitchen.save.shiftNumber);
  await page.reload();
  const shiftAfter = await page.evaluate(() => (window as any).__game.kitchen.save.shiftNumber);
  expect(shiftAfter).toBe(shiftBefore);
});

test('tap targets >= 44px and no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((b) => b.textContent?.trim()));
  expect(bad).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});
