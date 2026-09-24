import { test, expect, type Page } from '@playwright/test';

const SAVE_KEY = 'sizzle-street-save';

/** Seed a save (shape mirrors defaultSave in src/sim/kitchen.ts) and reload so the sim loads it. */
async function seed(page: Page, patch: Record<string, unknown> = {}) {
  await page.goto('/');
  await page.evaluate(([key, patch]) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1, money: 500, shiftNumber: 1,
      unlockedRecipes: ['skillet_burger', 'golden_fries', 'garden_toss'],
      ownedSpices: [], helpers: [],
      equipmentLevel: { chop: 1, grill: 1, fry: 1, stir: 1, season: 1 },
      criticStars: 0, totalStars: 0, bestScores: {},
      ...patch,
    }));
  }, [SAVE_KEY, patch] as const);
  await page.reload();
  await expect(page.getByRole('button', { name: /start shift/i })).toBeVisible();
}

const money = (page: Page) => page.evaluate(() => (window as any).__game.kitchen.save.money as number);
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY);

async function stroke(page: Page, pts: [number, number][], stepMs = 8) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y, { steps: 2 }); await page.waitForTimeout(stepMs); }
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`unexpected ${d.type()} dialog: ${d.message()}`); });
});

test('market: buy a locked recipe and a spice', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Market' }).click();
  await page.getByRole('button', { name: /Buy Crispy Onion Rings/ }).click();
  expect(await money(page)).toBe(460);
  await expect(page.locator('li.item', { hasText: 'Crispy Onion Rings' }).getByText('Owned')).toBeVisible();
  await page.getByRole('button', { name: /Buy Smoked Salt/ }).click();
  expect(await money(page)).toBe(430);
  await expect(page.locator('li.item', { hasText: 'Smoked Salt' }).getByText('Owned')).toBeVisible();
  await expect(page.locator('.money-bar strong')).toHaveText('$430');
  // purchases survive a reload
  await page.reload();
  const s = await stored(page);
  expect(s.money).toBe(430);
  expect(s.unlockedRecipes).toContain('crispy_rings');
  expect(s.ownedSpices).toContain('smoked_salt');
});

test('equipment: sharpen knife via chop minigame', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Market' }).click();
  await page.getByRole('button', { name: /Upgrade Knife/ }).click();
  await expect(page.getByText(/Swipe across the (guide|red) line/)).toBeVisible();
  await page.waitForTimeout(300);
  // Guide slides along world x at y=0.2; stroke horizontally through its projected screen y.
  const box = (await page.locator('canvas').first().boundingBox())!;
  const gy = await page.evaluate(() => {
    const cam = (window as any).__game.renderer.camera;
    const v = new (cam.position.constructor)(0, 0.2, 0);
    v.project(cam);
    return (1 - v.y) / 2;
  });
  const y = box.y + gy * box.height;
  for (let i = 0; i < 9; i++) {
    await stroke(page, [[box.x + box.width * 0.15, y], [box.x + box.width * 0.85, y]]);
    await page.waitForTimeout(250);
  }
  await expect(page.getByText(/Knife upgraded to level 2/)).toBeVisible({ timeout: 5000 });
  const s = await stored(page);
  expect(s.equipmentLevel.chop).toBe(2);
  expect(s.money).toBe(450);
});

test('staff: hired helper works a chop step without the player', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Staff' }).click();
  await page.getByRole('button', { name: /Hire Pip Rowan/ }).click();
  expect(await money(page)).toBe(450);
  await page.getByRole('button', { name: 'Assign Pip Rowan to chop' }).click();
  await expect(page.getByRole('button', { name: 'Assign Pip Rowan to chop' })).toHaveClass(/\bon\b/);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /start shift/i }).click();

  const claimed = await page.waitForFunction(() => {
    const k = (window as any).__game.kitchen;
    for (const o of k.orders) { const i = o.steps.findIndex((s: any) => s.helperId === 'pip'); if (i >= 0) return { orderId: o.id, i }; }
    return null;
  }, null, { timeout: 30_000 });
  const { orderId, i } = (await claimed.jsonValue()) as { orderId: string; i: number };
  await expect(page.locator('.chip-status', { hasText: 'helper' }).first()).toBeVisible();
  await page.waitForFunction(([id, i]) => {
    const o = (window as any).__game.kitchen.orders.find((o: any) => o.id === id);
    return o?.steps[i].status === 'done' && !!o.steps[i].result;
  }, [orderId, i] as const, { timeout: 40_000 });
  expect(await page.evaluate(() => (window as any).__game.activeStep())).toBeNull();
});

test('critic: shows CRITIC badge in ticket rail', async ({ page }) => {
  await seed(page, { shiftNumber: 3 });
  await page.getByRole('button', { name: /start shift 3/i }).click();
  await page.evaluate(() => (window as any).__game.kitchen.debugSpawnCritic());
  const critic = await page.evaluate(() => (window as any).__game.kitchen.customers.find((c: any) => c.isCritic));
  expect(critic?.name).toBe('Marguerite Pell');
  await expect(page.locator('article.ticket.critic .badge')).toHaveText('CRITIC');
  await expect(page.locator('article.ticket.critic')).toContainText('Marguerite Pell');
});

test('reset save with inline confirm', async ({ page }) => {
  await seed(page);
  const reset = page.getByRole('button', { name: 'Reset save' });
  await reset.click();
  await expect(reset).toHaveText('Tap again to erase');
  expect(await stored(page)).not.toBeNull();
  await Promise.all([page.waitForEvent('load'), reset.click()]);
  await expect(page.getByRole('button', { name: /start shift 1/i })).toBeVisible();
  expect(await stored(page)).toBeNull();
  expect(await money(page)).toBe(60);
});
