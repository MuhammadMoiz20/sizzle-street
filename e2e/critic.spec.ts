import { test, expect, type Page } from '@playwright/test';

const SAVE_KEY = 'sizzle-street-save';

async function stroke(page: Page, pts: [number, number][], stepMs = 4) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y, { steps: 2 }); await page.waitForTimeout(stepMs); }
  await page.mouse.up();
}

test('critic: perfect signature dish earns a critic star', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({
    version: 1, money: 500, shiftNumber: 3,
    unlockedRecipes: ['skillet_burger', 'golden_fries', 'garden_toss', 'seared_chicken'],
    ownedSpices: [], helpers: [],
    equipmentLevel: { chop: 1, grill: 1, fry: 1, stir: 1, season: 1 },
    criticStars: 0, totalStars: 0, bestScores: {},
  })), SAVE_KEY);
  await page.reload();
  await page.getByRole('button', { name: /start shift 3/i }).click();

  const { orderId, steps } = await page.evaluate(() => {
    const k = (window as any).__game.kitchen;
    k.debugSpawnCritic();
    const c = k.customers.find((c: any) => c.isCritic);
    const o = k.orders.find((o: any) => o.id === c.orderId);
    return { orderId: o.id as string, steps: o.steps.map((s: any) => s.kind as string) };
  });
  expect(steps).toEqual(['grill', 'stir', 'season']);

  // Grill step through real gestures: wait for perfect, swipe up to flip, wait, pull.
  await page.evaluate((id) => (window as any).__game.openStep(id, 0), orderId);
  await page.waitForTimeout(300);
  const box = (await page.locator('canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const waitReady = () => page.waitForFunction(() => {
    const s = (window as any).__game.activeStep?.(); return s?.cook && s.cook.elapsed >= s.cook.perfectAt;
  }, null, { timeout: 30_000 });
  await waitReady();
  await stroke(page, [[cx, cy + 80], [cx, cy - 120]]);
  await expect.poll(() => page.evaluate(() => (window as any).__game.activeStep()?.cook?.flipped)).toBe(true);
  await waitReady();
  await page.getByRole('button', { name: /pull/i }).click();

  // Non-timed steps: sim hook (real-gesture stir consistency is too flaky for a >= 0.9 gate).
  await page.evaluate((id) => {
    const k = (window as any).__game.kitchen;
    k.finishStep(id, 1, { accuracy: 1, timing: 1 });
    k.finishStep(id, 2, { accuracy: 1, timing: 1 });
  }, orderId);
  const grill = await page.evaluate((id) => (window as any).__game.kitchen.orders.find((o: any) => o.id === id).steps[0].result, orderId);
  expect(grill.doneness).toBe('perfect');

  await page.getByRole('button', { name: 'Serve Seared Chicken Plate' }).click();
  const score = await page.evaluate((id) => (window as any).__game.kitchen.orders.find((o: any) => o.id === id)?.score, orderId);
  expect(score).toBeGreaterThanOrEqual(0.9);

  // Fast-forward the sim clock to close the shift.
  await page.evaluate(() => (window as any).__game.kitchen.tick(1000));
  await expect(page.getByText(/Shift 3 closed/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.kitchen.save.criticStars)).toBe(1);
  await expect(page.locator('#summary .stat', { hasText: 'Marguerite Pell' })).toContainText('★');
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), SAVE_KEY);
  expect(stored.criticStars).toBe(1);
});
