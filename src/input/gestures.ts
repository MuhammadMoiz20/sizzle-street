import type {
  GestureController, GestureHandlers, GestureOptions, PointerPoint, SwipeDir,
} from './types';

const CIRCLE_WINDOW = 12;
const HOLD_MOVE_PX = 8;

/** Pure: classify a stroke as a swipe direction, or null if too short/slow. */
export function classifySwipe(
  dx: number, dy: number, dtMs: number, minPx: number, minSpeed: number,
): { dir: SwipeDir; speed: number } | null {
  const dist = Math.hypot(dx, dy);
  if (dist < minPx) return null;
  const speed = dist / Math.max(dtMs, 1) * 1000;
  if (speed < minSpeed) return null;
  const dir: SwipeDir = Math.abs(dx) >= Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
  return { dir, speed };
}

/**
 * Pure: signed angle (radians) swept from prev to cur around center.
 * Positive = clockwise in screen space (y down).
 */
export function accumulateAngle(
  cx: number, cy: number, px: number, py: number, x: number, y: number,
): number {
  const a0 = Math.atan2(py - cy, px - cx);
  const a1 = Math.atan2(y - cy, x - cx);
  let d = a1 - a0;
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function createGestures(el: HTMLElement, opts: GestureOptions = {}): GestureController {
  const holdMs = opts.holdMs ?? 350;
  const swipeMinPx = opts.swipeMinPx ?? 40;
  const swipeMinSpeed = opts.swipeMinSpeed ?? 600;
  const tapMaxPx = opts.tapMaxPx ?? 12;

  let handlers: GestureHandlers = {};
  let pointerId: number | null = null;
  let down: PointerPoint | null = null;
  let cur: PointerPoint | null = null;
  let holdTimer = 0;
  let holdFired = false;
  let maxMove = 0;
  // Ring of recent samples for velocity + circle centroid (no per-frame allocation).
  const ring: PointerPoint[] = [];
  for (let i = 0; i < CIRCLE_WINDOW; i++) ring.push({ x: 0, y: 0, nx: 0, ny: 0, t: 0 });
  let ringLen = 0;
  let ringHead = 0;
  let angle = 0;
  // Running mean of every sample since pointerdown: a stable circle centre that does not chase the pointer.
  let n = 0, sx = 0, sy = 0, snx = 0, sny = 0;
  const center: PointerPoint = { x: 0, y: 0, nx: 0, ny: 0, t: 0 };

  el.style.touchAction = 'none';
  const stopTouch = (e: TouchEvent) => e.preventDefault();

  const point = (e: PointerEvent, out: PointerPoint): PointerPoint => {
    const r = el.getBoundingClientRect();
    out.x = e.clientX - r.left;
    out.y = e.clientY - r.top;
    out.nx = r.width ? (out.x / r.width) * 2 - 1 : 0;
    out.ny = r.height ? (out.y / r.height) * 2 - 1 : 0;
    out.t = e.timeStamp || performance.now();
    return out;
  };
  const pushSample = (p: PointerPoint) => {
    const slot = ring[ringHead]!;
    slot.x = p.x; slot.y = p.y; slot.nx = p.nx; slot.ny = p.ny; slot.t = p.t;
    ringHead = (ringHead + 1) % CIRCLE_WINDOW;
    if (ringLen < CIRCLE_WINDOW) ringLen++;
  };
  const sample = (back: number) => ring[(ringHead - 1 - back + 2 * CIRCLE_WINDOW) % CIRCLE_WINDOW]!;

  const clearHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; } };
  const reset = () => {
    if (pointerId !== null) { try { el.releasePointerCapture(pointerId); } catch { /* gone */ } }
    pointerId = null; down = null; cur = null; clearHold();
  };

  const prevScratch: PointerPoint = { x: 0, y: 0, nx: 0, ny: 0, t: 0 };
  const curScratch: PointerPoint = { x: 0, y: 0, nx: 0, ny: 0, t: 0 };
  const downScratch: PointerPoint = { x: 0, y: 0, nx: 0, ny: 0, t: 0 };

  const onDown = (e: PointerEvent) => {
    if (pointerId !== null || !e.isPrimary) return;
    pointerId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    down = point(e, downScratch);
    cur = point(e, curScratch);
    ringLen = 0; ringHead = 0; angle = 0; maxMove = 0; holdFired = false;
    n = 1; sx = cur.x; sy = cur.y; snx = cur.nx; sny = cur.ny;
    pushSample(cur);
    handlers.onDown?.(cur);
    clearHold();
    holdTimer = window.setTimeout(() => {
      holdFired = true;
      if (cur && maxMove < HOLD_MOVE_PX) handlers.onHold?.(cur);
    }, holdMs);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId || !cur || !down) return;
    prevScratch.x = cur.x; prevScratch.y = cur.y; prevScratch.nx = cur.nx; prevScratch.ny = cur.ny; prevScratch.t = cur.t;
    point(e, curScratch);
    maxMove = Math.max(maxMove, Math.hypot(cur.x - down.x, cur.y - down.y));
    if (maxMove >= HOLD_MOVE_PX && !holdFired) clearHold();
    handlers.onMove?.(cur, prevScratch);

    // Velocity from the last 3 samples.
    pushSample(cur);
    if (handlers.onDrag) {
      const old = sample(Math.min(2, ringLen - 1));
      const dt = Math.max(cur.t - old.t, 1) / 1000;
      handlers.onDrag(cur, (cur.x - old.x) / dt, (cur.y - old.y) / dt);
    }

    // Circle: signed angle around the mean of all samples since down.
    n++; sx += cur.x; sy += cur.y; snx += cur.nx; sny += cur.ny;
    if (handlers.onCircle && n >= 4) {
      center.x = sx / n; center.y = sy / n; center.nx = snx / n; center.ny = sny / n; center.t = cur.t;
      angle += accumulateAngle(center.x, center.y, prevScratch.x, prevScratch.y, cur.x, cur.y);
      if (angle >= 2 * Math.PI) { angle -= 2 * Math.PI; handlers.onCircle(true, center); }
      else if (angle <= -2 * Math.PI) { angle += 2 * Math.PI; handlers.onCircle(false, center); }
    }
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId || !cur || !down) return;
    point(e, curScratch);
    const d = down;
    handlers.onUp?.(cur, d);
    const dx = cur.x - d.x, dy = cur.y - d.y;
    const sw = classifySwipe(dx, dy, cur.t - d.t, swipeMinPx, swipeMinSpeed);
    if (sw) handlers.onSwipe?.(sw.dir, sw.speed, d, cur);
    else if (maxMove <= tapMaxPx && !holdFired) handlers.onTap?.(cur);
    reset();
  };

  const onCancel = (e: PointerEvent) => { if (e.pointerId === pointerId) reset(); };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('touchstart', stopTouch, { passive: false });

  return {
    setHandlers(h) { handlers = h; },
    isDown: () => pointerId !== null,
    current: () => cur,
    dispose() {
      reset();
      handlers = {};
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('touchstart', stopTouch);
    },
  };
}
