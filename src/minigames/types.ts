import type * as THREE from 'three';
import type { OrderStep, StepResult, MinigameKind } from '../game/types';
import type { GestureController } from '../input/types';
import type { FoodFactory } from '../render/api';

export interface MinigameContext {
  step: OrderStep;
  kind: MinigameKind;
  /** Group the minigame may fill with meshes; render module clears it on dispose. */
  group: THREE.Group;
  camera: THREE.PerspectiveCamera;
  gestures: GestureController;
  food: FoodFactory;
  /** Equipment level 1..3 widens perfect windows. */
  equipmentLevel: number;
  /** Viewport in CSS px (for layout of any DOM prompts). */
  viewport: { width: number; height: number; portrait: boolean };
  /** DOM overlay element the minigame may render instructions/progress into. Cleared on dispose. */
  overlay: HTMLElement;
  /** Call when the step is finished. */
  complete(result: StepResult): void;
  /** Player backed out (grill/fry only: food keeps cooking in sim). */
  exit(): void;
  /** Sim clock: minigame must call step.cook mutation only via these for grill/fry. */
  cookActions?: { flip(): void; pull(): void };
}

export interface Minigame {
  start(ctx: MinigameContext): void;
  update(dt: number): void;
  dispose(): void;
}

export type MinigameFactory = () => Minigame;
