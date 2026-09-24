import type { GameEvents } from './types';

type Handler<T> = (payload: T) => void;

export class Emitter {
  private map = new Map<string, Set<Handler<any>>>();
  on<K extends keyof GameEvents>(name: K, fn: Handler<GameEvents[K]>): () => void {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name)!.add(fn);
    return () => this.map.get(name)?.delete(fn);
  }
  emit<K extends keyof GameEvents>(name: K, payload: GameEvents[K]): void {
    this.map.get(name)?.forEach((fn) => fn(payload));
  }
}
