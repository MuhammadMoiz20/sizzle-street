import { describe, it, expect } from 'vitest';
import { classifySwipe, accumulateAngle } from '../src/input/gestures';

describe('classifySwipe', () => {
  it('rejects short or slow strokes', () => {
    expect(classifySwipe(10, 0, 50, 40, 600)).toBeNull();
    expect(classifySwipe(100, 0, 1000, 40, 600)).toBeNull();
  });
  it('picks the dominant axis', () => {
    expect(classifySwipe(100, 20, 100, 40, 600)?.dir).toBe('right');
    expect(classifySwipe(-100, 20, 100, 40, 600)?.dir).toBe('left');
    expect(classifySwipe(20, -100, 100, 40, 600)?.dir).toBe('up');
    expect(classifySwipe(20, 100, 100, 40, 600)?.dir).toBe('down');
  });
  it('reports speed in px/s', () => {
    expect(classifySwipe(100, 0, 100, 40, 600)?.speed).toBeCloseTo(1000);
  });
});

describe('accumulateAngle', () => {
  it('sums to 2π over a full clockwise (screen-space) circle', () => {
    let total = 0, px = 1, py = 0;
    for (let i = 1; i <= 36; i++) {
      const a = (i / 36) * 2 * Math.PI;
      const x = Math.cos(a), y = Math.sin(a);
      total += accumulateAngle(0, 0, px, py, x, y);
      px = x; py = y;
    }
    expect(total).toBeCloseTo(2 * Math.PI);
  });
  it('is negative going the other way and handles the ±π wrap', () => {
    expect(accumulateAngle(0, 0, 1, 0, 0, -1)).toBeCloseTo(-Math.PI / 2);
    expect(accumulateAngle(0, 0, -1, 0.01, -1, -0.01)).toBeCloseTo(0, 1);
  });
});

describe('createGestures circle detection', () => {
  it('fires onCircle once per lap regardless of sample density', async () => {
    const { createGestures } = await import('../src/input/gestures');
    // Minimal fake element: no DOM in this test env. First lap settles the centre (~1.2 laps), then 1.0 per lap.
    const listeners: Record<string, (e: unknown) => void> = {};
    const el = {
      style: {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
      addEventListener: (t: string, fn: (e: unknown) => void) => { listeners[t] = fn; },
      removeEventListener: () => {},
      setPointerCapture: () => {}, releasePointerCapture: () => {},
    } as unknown as HTMLElement;
    (globalThis as { window?: unknown }).window ??= globalThis;
    const g = createGestures(el);
    for (const steps of [40, 200]) {
      let laps = 0;
      g.setHandlers({ onCircle: () => laps++ });
      const ev = (type: string, a: number, t: number) => listeners[type]!({
        pointerId: 1, isPrimary: true, timeStamp: t,
        clientX: 200 + 80 * Math.cos(a), clientY: 200 + 80 * Math.sin(a),
      });
      ev('pointerdown', 0, 1);
      for (let i = 1; i <= steps * 3.5; i++) ev('pointermove', (i / steps) * 2 * Math.PI, i * 10 + 1);
      ev('pointerup', 0, steps * 35 + 11);
      expect(laps).toBe(3);
    }
    g.dispose();
  });
});
