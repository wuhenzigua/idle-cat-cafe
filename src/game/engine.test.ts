import { describe, expect, it } from 'vitest';

import { SAVE_KEY, createInitialGameState } from './content';
import { GameEngine } from './engine';
import { serializeSaveData } from './storage';
import type { StorageLike } from './types';

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('game engine', () => {
  it('applies buy mode to upgrade purchases', () => {
    const storage = new MemoryStorage();
    const now = Date.now();
    const seeded = createInitialGameState(now);

    seeded.fish = 8_000;
    storage.setItem(SAVE_KEY, serializeSaveData(seeded, now));

    const engine = new GameEngine(() => now, storage);

    engine.setBuyMode(10);
    expect(engine.buyUpgrade('junior-clerk')).toBe(true);

    const viewModel = engine.getViewModel();
    expect(viewModel.state.upgrades['junior-clerk']).toBe(10);
  });

  it('performs prestige and keeps persistent progression', () => {
    const storage = new MemoryStorage();
    const now = Date.now();
    const seeded = createInitialGameState(now);

    seeded.lifetimeRevenue = 90_000;
    seeded.popularity = 120;
    seeded.brandValue = 2;
    seeded.runs = 1;
    seeded.stats.totalClicks = 300;
    seeded.bestRunRevenue = 90_000;
    storage.setItem(SAVE_KEY, serializeSaveData(seeded, now));

    const engine = new GameEngine(() => now, storage);
    const result = engine.prestige(now + 1_000);

    expect(result).not.toBeNull();
    expect(result?.gained).toBeGreaterThan(0);

    const viewModel = engine.getViewModel();
    expect(viewModel.state.fish).toBe(0);
    expect(viewModel.state.runs).toBe(2);
    expect(viewModel.state.brandValue).toBeGreaterThan(2);
    expect(viewModel.state.stats.totalClicks).toBe(300);
  });
});
