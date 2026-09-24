import type {
  Customer, MinigameKind, Order, SaveData, ShiftPhase, ShiftSummary, StepResult,
} from '../game/types';
import type { Emitter } from '../game/events';

/** Pure-TS game simulation. No DOM, no Three. Deterministic given a seed + dt calls. */
export interface Kitchen {
  readonly events: Emitter;
  readonly save: SaveData;
  readonly phase: ShiftPhase;
  readonly elapsed: number;      // shift seconds
  readonly remaining: number;
  readonly customers: Customer[];
  readonly orders: Order[];
  readonly grillSlots: number;   // capacity
  readonly fryerSlots: number;

  startShift(): void;
  /** Advance sim. Also drives helpers, cook timers, patience, arrivals. */
  tick(dt: number): void;

  /** Player starts a step. For grill/fry this places food in a free slot (throws if none). */
  beginStep(orderId: string, stepIndex: number): void;
  /** Grill: flip current food. */
  flip(orderId: string, stepIndex: number): void;
  /** Grill/fry: remove food, computing timing from cook state. accuracy from gesture. */
  pull(orderId: string, stepIndex: number, accuracy: number): StepResult;
  /** Chop/stir/season: finish with result from minigame. */
  finishStep(orderId: string, stepIndex: number, result: StepResult): void;
  /** Plate: all steps done -> serve to customer, compute tip. */
  serve(orderId: string): void;
  /** Throw away an order (customer stays, re-cook). */
  scrap(orderId: string): void;

  // Between shifts
  hire(helperId: string): boolean;
  assignHelper(helperId: string, station: MinigameKind | undefined): void;
  buyRecipe(recipeId: string): boolean;
  buySpice(spiceId: string): boolean;
  upgradeEquipment(kind: MinigameKind, minigameScore: number): boolean;

  persist(): void;
}

export interface KitchenOptions {
  seed?: number;
  /** Override save (for tests). */
  save?: SaveData;
  /** Skip localStorage (tests). */
  storage?: Storage | null;
}

export type ShiftEndCallback = (summary: ShiftSummary) => void;
