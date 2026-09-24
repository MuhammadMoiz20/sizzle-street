import type * as THREE from 'three';
import type { IngredientId } from '../game/types';

/** A food item the render module builds. Minigames drive its visual state. */
export interface FoodItem {
  object: THREE.Object3D;
  /** 0 raw .. 1 perfect .. 2 burnt. Grill/fry items respond; others ignore. */
  setDoneness(d: number, side?: 0 | 1): void;
  /** Chop progress 0..1: item visibly separates into slices. */
  setChopProgress(p: number): void;
  /** For stir items: sauce/soup swirl intensity 0..1. */
  setStir(intensity: number): void;
  /** Seasoning coverage 0..1 (>1 = over). */
  setSeasoning(amount: number): void;
  /** Flip animation (grill). */
  flip(): void;
  dispose(): void;
}

export interface Effects {
  /** Steam column at world position; intensity 0..1. Returns handle to update/stop. */
  steam(pos: THREE.Vector3, intensity?: number): { set(intensity: number): void; stop(): void };
  /** Brief sizzle spray at position. */
  sizzle(pos: THREE.Vector3, strength?: number): void;
  /** Sprinkle of particles (seasoning) from pos with spread. */
  sprinkle(pos: THREE.Vector3, count?: number): void;
}

export interface FoodFactory {
  make(id: IngredientId): FoodItem;
  /** Station props: returns a group with a board/pan/fryer/bowl/plate already placed at origin. */
  station(kind: 'board' | 'pan' | 'fryer' | 'bowl' | 'plate'): THREE.Group;
  effects: Effects;
}

export interface RenderStats { fps: number; frameMs: number; drawCalls: number }

export interface Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  food: FoodFactory;
  /** Group minigames use; cleared by clearStage(). */
  stage: THREE.Group;
  clearStage(): void;
  /** Kitchen ambience view when no minigame is active. */
  showKitchen(): void;
  /** Frame the stage for a minigame kind; handles portrait vs landscape. */
  frameStation(kind: 'board' | 'pan' | 'fryer' | 'bowl'): void;
  update(dt: number): void;
  stats(): RenderStats;
  resize(): void;
  dispose(): void;
}
