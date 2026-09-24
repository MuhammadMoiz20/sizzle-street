import { test, expect } from '@playwright/test';

// Real touch events via CDP (page.mouse sends mouse events even under mobile emulation).
test('chop works with genuine touch events', async ({ page, browserName }) => {
  test.skip(!test.info().project.name.startsWith('mobile') || browserName !== 'chromium');
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /start shift/i }).click();
  await page.waitForFunction(() => (window as any).__game.kitchen.orders.length > 0);
  await page.evaluate(() => { const g = (window as any).__game; const o = g.kitchen.orders[0]; g.openStep(o.id, o.steps.findIndex((s: any) => s.kind === 'chop')); });
  await page.waitForTimeout(300);
  const cdp = await page.context().newCDPSession(page);
  const box = (await page.locator('canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.5;
  const kinds: Record<string, string[]> = {};
  await page.evaluate(() => { (window as any).__pt = new Set(); document.querySelector('canvas')!.addEventListener('pointerdown', (e) => (window as any).__pt.add((e as PointerEvent).pointerType)); });
  for (let i = 0; i < 9; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 120, y: cy - 40 }] });
    for (let k = 1; k <= 6; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 120 + k * 40, y: cy - 40 + k * 14 }] });
      await page.waitForTimeout(6);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
  }
  void kinds;
  expect(await page.evaluate(() => [...(window as any).__pt])).toContain('touch');
  await expect.poll(() => page.evaluate(() => (window as any).__game.kitchen.orders[0].steps.find((s: any) => s.kind === 'chop').status)).toBe('done');
});
