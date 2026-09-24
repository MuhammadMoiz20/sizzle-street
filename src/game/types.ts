// Shared contracts. Every module imports from here; nobody edits this without the orchestrator.

export type MinigameKind = 'chop' | 'grill' | 'fry' | 'stir' | 'season';

/** Original ingredients. Visual id drives the 3D mesh in src/render. */
export type IngredientId =
  | 'onion' | 'tomato' | 'potato' | 'lettuce' | 'carrot'
  | 'beef_patty' | 'chicken_breast' | 'onion_ring_batter'
  | 'broth' | 'dressing' | 'pan_sauce' | 'fries_cut';

export interface StepDef {
  kind: MinigameKind;
  ingredient: IngredientId;
  /** For grill/fry: seconds per side / total until "perfect". Chop/stir/season ignore. */
  cookTime?: number;
  /** Season only: target shakes. */
  targetAmount?: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  price: number;          // base price paid by customer
  steps: StepDef[];
  signature?: boolean;    // critic wants these
  unlockCost: number;     // 0 = starts unlocked
}

export interface SpiceDef {
  id: string;
  name: string;
  cost: number;
  /** Multiplier applied to tips of dishes when owned (e.g. 1.1). */
  tipBonus: number;
}

/** 0..1 quality of one completed step. */
export interface StepResult {
  accuracy: number;   // how well the gesture was performed
  timing: number;     // for cook steps: closeness to perfect doneness; 1 for non-timed
  /** For cook steps, where doneness landed. */
  doneness?: 'raw' | 'under' | 'perfect' | 'over' | 'burnt';
  overSeasoned?: boolean;
}

export type StepStatus = 'pending' | 'cooking' | 'ready' | 'done';

export interface OrderStep extends StepDef {
  status: StepStatus;
  result?: StepResult;
  /** Set when a helper is doing this step. */
  helperId?: string;
  /** For grill/fry: live cook state owned by sim, rendered by minigame. */
  cook?: CookState;
}

export interface CookState {
  /** seconds cooked on current side (grill) or total (fry). */
  elapsed: number;
  side: 0 | 1;          // grill only
  flipped: boolean;     // grill only
  perfectAt: number;    // seconds for perfect on this side
  /** 0..1 browning of current side; >1 means burning. Derived: elapsed / perfectAt. */
  slotIndex: number;
}

export interface Order {
  id: string;
  customerId: string;
  recipeId: string;
  steps: OrderStep[];
  createdAt: number;   // shift seconds
  servedAt?: number;
  score?: number;      // 0..1 final
  tip?: number;
}

export type CustomerMood = 'happy' | 'neutral' | 'annoyed' | 'angry';

export interface Customer {
  id: string;
  name: string;
  seat: number;
  patience: number;      // seconds remaining
  patienceMax: number;
  status: 'arriving' | 'seated' | 'waiting' | 'served' | 'left';
  orderId?: string;
  isCritic?: boolean;
  arrivedAt: number;
}

export interface Helper {
  id: string;
  name: string;
  hireCost: number;
  wagePerShift: number;
  speed: number;      // 0..1, multiplies against player's pace (1 = player)
  accuracy: number;   // 0..1 typical StepResult quality
  station?: MinigameKind; // assigned station
  busyWith?: { orderId: string; stepIndex: number; remaining: number };
}

export interface ShiftSummary {
  shiftNumber: number;
  earnings: number;
  tips: number;
  wages: number;
  served: number;
  lost: number;
  stars: number;         // 0..3
  bestDish?: { recipeId: string; score: number };
  criticStars: number;   // earned this shift
}

export interface SaveData {
  version: 1;
  money: number;
  shiftNumber: number;
  unlockedRecipes: string[];
  ownedSpices: string[];
  helpers: Helper[];
  equipmentLevel: Record<MinigameKind, number>; // 1..3; affects perfect windows
  criticStars: number;
  totalStars: number;
  bestScores: Record<string, number>;
}

export type ShiftPhase = 'idle' | 'running' | 'closing' | 'ended';

/** Events emitted by sim, consumed by UI/audio/render. */
export interface GameEvents {
  'customer:arrive': { customer: Customer };
  'customer:order': { customer: Customer; order: Order };
  'customer:leave': { customer: Customer; served: boolean };
  'order:step': { order: Order; stepIndex: number; status: StepStatus };
  'order:served': { order: Order; customer: Customer; tip: number; score: number };
  'cook:warning': { order: Order; stepIndex: number; level: 'ready' | 'overcooking' | 'burnt' };
  'shift:tick': { elapsed: number; remaining: number };
  'shift:phase': { phase: ShiftPhase; summary?: ShiftSummary };
  'money': { money: number; delta: number };
  'sfx': { name: SfxName };
}

export type SfxName =
  | 'chop' | 'sizzle_start' | 'sizzle_loop_stop' | 'fry_drop' | 'fry_pull' | 'shake' | 'stir'
  | 'ding' | 'bell' | 'coin' | 'good' | 'bad' | 'burn' | 'ui_tap' | 'critic';
