import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

fs.mkdirSync('e2e/screens', { recursive: true });
type G = { kitchen: { orders: any[]; phase: string }; openStep(id: string, i: number): void; activeStep(): any; renderer: { camera: any } };
const game = (page: Page) => page.evaluate(() => (window as any).__game as G);

async function stroke(page: Page, pts: [number, number][], stepMs = 8) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y, { steps: 2 }); await page.waitForTimeout(stepMs); }
  await page.mouse.up();
}

async function startShift(page: Page) {
  await page.goto('/');
  // Only the burger unlocked: every order is chop -> grill -> season (deterministic step mix).
  await page.evaluate(() => localStorage.setItem('sizzle-street-save', JSON.stringify({
    version: 1, money: 60, shiftNumber: 1, unlockedRecipes: ['skillet_burger'], ownedSpices: [], helpers: [],
    equipmentLevel: { chop: 1, grill: 1, fry: 1, stir: 1, season: 1 }, criticStars: 0, totalStars: 0, bestScores: {},
  })));
  await page.reload();
  await page.getByRole('button', { name: /start shift/i }).click();
}

/** Wait for an open (not done, not helper) step of `kind`; returns [orderId, index]. */
async function findStep(page: Page, kind: string, minOrders = 1) {
  const h = await page.waitForFunction(([kind, min]) => {
    const g = (window as any).__game;
    if (g.kitchen.orders.length < min) return null;
    for (const o of g.kitchen.orders) {
      if (o.servedAt) continue;
      const i = o.steps.findIndex((s: any) => s.kind === kind && s.status !== 'done' && !s.helperId);
      if (i >= 0) return [o.id, i];
    }
    return null;
  }, [kind, minOrders] as const, { timeout: 90_000 });
  return (await h.jsonValue()) as [string, number];
}

async function layoutChecks(page: Page, label: string) {
  await page.screenshot({ path: `e2e/screens/landscape-${label}.png` });
  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas')!.getBoundingClientRect();
    const cam = (window as any).__game.renderer.camera;
    const v = new (cam.position.constructor)(0, 0, 0);
    v.project(cam);
    const x = ((v.x + 1) / 2) * c.width + c.left, y = ((1 - v.y) / 2) * c.height + c.top;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return {
      hscroll: document.documentElement.scrollWidth > innerWidth + 1,
      canvas: { w: c.width, h: c.height, l: c.left, t: c.top, iw: innerWidth, ih: innerHeight },
      smallButtons: [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44);
      }).map((b) => b.textContent?.trim()),
      origin: { x, y, tag: el?.tagName, coveredBy: el?.closest('.ui')?.id ?? null },
    };
  });
  console.log(`[${label}]`, JSON.stringify(r));
  expect(r.hscroll).toBe(false);
  expect(r.smallButtons).toEqual([]);
  expect(r.canvas.l).toBe(0); expect(r.canvas.t).toBe(0);
  expect(r.canvas.w).toBeGreaterThanOrEqual(r.canvas.iw - 1);
  expect(r.canvas.h).toBeGreaterThanOrEqual(r.canvas.ih - 1);
  expect(r.origin.coveredBy, `world origin covered by #${r.origin.coveredBy}`).toBeNull();
  expect(r.origin.tag).toBe('CANVAS');
}

test('landscape phone: rail, chop, grill layouts', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-landscape', 'landscape only');
  await startShift(page);
  await page.waitForFunction(() => (window as any).__game.kitchen.orders.length >= 1, null, { timeout: 60_000 });
  await page.waitForTimeout(300);
  await layoutChecks(page, 'kitchen');

  const [cid, ci] = await findStep(page, 'chop');
  await page.evaluate(([id, i]) => (window as any).__game.openStep(id, i), [cid, ci] as const);
  await page.waitForTimeout(400);
  await layoutChecks(page, 'chop');
  const box = (await page.locator('canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (let i = 0; i < 9; i++) {
    await stroke(page, [[cx - 0.2 * box.width, cy - 60], [cx + 0.2 * box.width, cy + 60]]);
    await page.waitForTimeout(220);
    if (!(await page.evaluate(() => !!(window as any).__game.activeStep()))) break;
  }
  await page.waitForTimeout(300);
  const chopDone = await page.evaluate(([id, i]) => (window as any).__game.kitchen.orders.find((o: any) => o.id === id)?.steps[i].status, [cid, ci] as const);
  expect(chopDone).toBe('done');

  const [gid, gi] = await findStep(page, 'grill');
  await page.evaluate(([id, i]) => (window as any).__game.openStep(id, i), [gid, gi] as const);
  await page.waitForTimeout(400);
  await layoutChecks(page, 'grill');
  await expect(page.getByRole('button', { name: /pull/i })).toBeVisible();
});

test('throttled 4x cpu fps during grill with 3 orders', async ({ page }, info) => {
  test.skip(!/^mobile/.test(info.project.name), 'mobile projects only');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await startShift(page);
  const [gid, gi] = await findStep(page, 'grill', 3);
  await page.evaluate(([id, i]) => (window as any).__game.openStep(id, i), [gid, gi] as const);
  await page.waitForTimeout(1500);
  const fps: number[] = [];
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    fps.push(await page.evaluate(() => (window as any).__fps as number));
  }
  const avg = fps.reduce((a, b) => a + b, 0) / fps.length, min = Math.min(...fps);
  const line = `${info.project.name} throttled4x avg=${avg.toFixed(1)} min=${min.toFixed(1)}`;
  console.log(line);
  fs.appendFileSync('e2e/screens/fps.log', line + '\n');
  expect(min).toBeGreaterThanOrEqual(30);
});
