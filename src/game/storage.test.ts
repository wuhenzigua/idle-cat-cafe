import { describe, expect, it } from 'vitest';

import { createInitialGameState } from './content';
import { deserializeSaveData, serializeSaveData } from './storage';

describe('save serialization', () => {
  it('serializes and restores a valid save payload', () => {
    const now = Date.now();
    const state = createInitialGameState(now);

    state.fish = 88.5;
    state.lifetimeRevenue = 500;
    state.popularity = 15;
    state.brandValue = 3;
    state.runs = 2;
    state.buyMode = 10;
    state.upgrades['feather-toy'] = 2;
    state.claimedMilestones = ['street-cats'];
    state.claimedAchievements = ['click-200'];
    state.stats.totalClicks = 320;
    state.logs = [
      {
        id: 'log-1',
        tone: 'success',
        text: '保存测试',
        timestamp: now,
      },
    ];

    const raw = serializeSaveData(state, now);
    const restored = deserializeSaveData(raw);

    expect(restored).not.toBeNull();
    expect(restored?.version).toBe(2);
    expect(restored?.gameState.fish).toBe(88.5);
    expect(restored?.gameState.brandValue).toBe(3);
    expect(restored?.gameState.buyMode).toBe(10);
    expect(restored?.gameState.upgrades['feather-toy']).toBe(2);
    expect(restored?.gameState.claimedMilestones).toEqual(['street-cats']);
    expect(restored?.gameState.claimedAchievements).toEqual(['click-200']);
    expect(restored?.gameState.stats.totalClicks).toBe(320);
    expect(restored?.gameState.logs[0]?.text).toBe('保存测试');
  });

  it('migrates a legacy version 1 payload', () => {
    const raw = JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      gameState: {
        fish: 12,
        lifetimeRevenue: 100,
        popularity: 8,
        hasWon: false,
        upgrades: { 'feather-toy': 1 },
        claimedMilestones: ['street-cats'],
        logs: [],
      },
    });
    const restored = deserializeSaveData(raw);

    expect(restored).not.toBeNull();
    expect(restored?.version).toBe(2);
    expect(restored?.gameState.fish).toBe(12);
    expect(restored?.gameState.brandValue).toBe(0);
  });

  it('rejects malformed payloads', () => {
    expect(deserializeSaveData('not-json')).toBeNull();
    expect(
      deserializeSaveData(
        JSON.stringify({
          version: 99,
          savedAt: Date.now(),
          gameState: {},
        }),
      ),
    ).toBeNull();
  });
});
