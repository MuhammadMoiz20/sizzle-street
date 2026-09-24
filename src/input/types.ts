/**
 * Unified pointer/gesture layer. Mouse and touch share one code path via Pointer Events.
 * Coordinates are in CSS pixels relative to the target element; also normalized -1..1 (nx, ny).
 */
export interface PointerPoint { x: number; y: number; nx: number; ny: number; t: number }

export type SwipeDir = 'left' | 'right' | 'up' | 'down';

export interface GestureHandlers {
  onDown?(p: PointerPoint): void;
  onMove?(p: PointerPoint, prev: PointerPoint): void;
  onUp?(p: PointerPoint, downAt: PointerPoint): void;
  /** Fast straight stroke. Fires on up. speed in px/s. */
  onSwipe?(dir: SwipeDir, speed: number, from: PointerPoint, to: PointerPoint): void;
  /** Fires each time the pointer completes a full revolution while down. */
  onCircle?(clockwise: boolean, center: PointerPoint): void;
  /** Fires once when pointer held still for `holdMs` without lifting. */
  onHold?(p: PointerPoint): void;
  /** Continuous drag with velocity (px/s). */
  onDrag?(p: PointerPoint, vx: number, vy: number): void;
  /** Fires on quick down/up with little movement. */
  onTap?(p: PointerPoint): void;
}

export interface GestureOptions {
  holdMs?: number;        // default 350
  swipeMinPx?: number;    // default 40
  swipeMinSpeed?: number; // default 600 px/s
  tapMaxPx?: number;      // default 12
}

export interface GestureController {
  /** Replace handlers (minigames swap these as they take over the canvas). */
  setHandlers(h: GestureHandlers): void;
  isDown(): boolean;
  current(): PointerPoint | null;
  dispose(): void;
}
