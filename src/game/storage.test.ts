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
    state.upgrades['feather-toy'] = 2;
    state.claimedMilestones = ['street-cats'];
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
    expect(restored?.version).toBe(1);
    expect(restored?.gameState.fish).toBe(88.5);
    expect(restored?.gameState.upgrades['feather-toy']).toBe(2);
    expect(restored?.gameState.claimedMilestones).toEqual(['street-cats']);
    expect(restored?.gameState.logs[0]?.text).toBe('保存测试');
  });

  it('rejects malformed payloads', () => {
    expect(deserializeSaveData('not-json')).toBeNull();
    expect(
      deserializeSaveData(
        JSON.stringify({
          version: 2,
          savedAt: Date.now(),
          gameState: {},
        }),
      ),
    ).toBeNull();
  });
});
