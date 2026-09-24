import { test, expect, type Page } from '@playwright/test';

const SAVE_KEY = 'sizzle-street-save';

async function startShift(page: Page, recipes: string[]) {
  await page.goto('/');
  await page.evaluate(([key, recipes]) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({
      version: 1, money: 60, shiftNumber: 1, unlockedRecipes: recipes, ownedSpices: [], helpers: [],
      equipmentLevel: { chop: 1, grill: 1, fry: 1, stir: 1, season: 1 }, criticStars: 0, totalStars: 0, bestScores: {},
    }));
  }, [SAVE_KEY, recipes] as const);
  await page.reload();
  await page.getByRole('button', { name: /start shift/i }).click();
}

async function stroke(page: Page, pts: [number, number][], stepMs = 8) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y, { steps: 2 }); await page.waitForTimeout(stepMs); }
  await page.mouse.up();
}

test('ticket rail sorts most-urgent customer first and marks the next step', async ({ page }) => {
  await startShift(page, ['golden_fries']);
  await page.evaluate(() => {
    const k = (window as any).__game.kitchen;
    k.tick(3); k.tick(20); k.tick(20); // three customers seated
    const cs = k.customers;
    cs[0].patience = cs[0].patienceMax * 0.6; cs[1].patience = cs[1].patienceMax * 0.15; cs[2].patience = cs[2].patienceMax * 0.9;
    k.tick(0.01); // customer:order rebuild already ran; force one more via a fresh spawn-free event
    k.events.emit('order:step', { order: k.orders[0], stepIndex: 0, status: 'pending' });
  });
  const names = await page.locator('.ticket .ticket-name').allTextContents();
  const expected = await page.evaluate(() =>
    [...(window as any).__game.kitchen.customers].sort((a: any, b: any) => a.patience - b.patience).map((c: any) => c.name));
  expect(names).toEqual(expected);
  await expect(page.locator('.ticket').first()).toHaveClass(/\blow\b/);
  await expect(page.locator('.ticket').first().locator('.patience-text')).toContainText('HURRY');
  // exactly one "TAP TO START" chip per order, on the first pending step
  for (const t of await page.locator('.ticket').all()) {
    await expect(t.locator('.chip-status', { hasText: 'TAP TO START' })).toHaveCount(1);
    await expect(t.locator('.chip').first()).toContainText('TAP TO START');
  }
});

test('chop swipe shows an instant hit/miss flash', async ({ page }) => {
  await startShift(page, ['golden_fries']);
  await page.evaluate(() => { const k = (window as any).__game.kitchen; k.tick(3); (window as any).__game.openStep(k.orders[0].id, 0); });
  await page.waitForTimeout(400);
  const box = (await page.locator('canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await expect(page.locator('.mg-flash')).toHaveCount(0);
  await stroke(page, [[cx - 0.2 * box.width, cy - 60], [cx + 0.2 * box.width, cy + 60]]);
  const flash = page.locator('.mg-flash');
  await expect(flash).toBeVisible();
  await expect(flash).toHaveText(/PERFECT|GOOD|MISS/);
  await expect(page.locator('#mg-overlay')).toContainText('1 / 8');
  await expect(flash).toHaveCount(0, { timeout: 2000 }); // auto-removes
});

test('grill meter label reads PERFECT inside the pull window and BURNT past it', async ({ page }) => {
  await startShift(page, ['skillet_burger']);
  await page.evaluate(() => { const k = (window as any).__game.kitchen; k.tick(3); (window as any).__game.openStep(k.orders[0].id, 1); });
  await page.waitForTimeout(300);
  await expect(page.locator('#mg-overlay')).toContainText(/RAW/);
  await page.evaluate(() => { const s = (window as any).__game.activeStep(); s.cook.elapsed = s.cook.perfectAt; });
  await expect(page.locator('#mg-overlay')).toContainText(/PERFECT - PULL!/);
  await page.evaluate(() => { const s = (window as any).__game.activeStep(); s.cook.elapsed = s.cook.perfectAt * 1.9; });
  await expect(page.locator('#mg-overlay')).toContainText(/BURNT/);
  // overview chip mirrors it
  await page.getByRole('button', { name: 'Back to tickets' }).click();
  await expect(page.locator('.chip.s-cooking .chip-status')).toHaveText('BURNT');
});
