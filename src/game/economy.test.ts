import { describe, expect, it } from 'vitest';

import { UPGRADE_DEFINITIONS, createInitialGameState } from './content';
import {
  applyOfflineProgress,
  calculateClickIncome,
  calculatePassiveIncome,
  calculatePopularityMultiplier,
  claimUnlockedMilestones,
  getUpgradePrice,
  grantIncome,
  purchaseUpgrade,
  refreshDerivedState,
} from './economy';

describe('economy system', () => {
  it('calculates upgrade price with scaling and ceiling', () => {
    const featherToy = UPGRADE_DEFINITIONS[0];

    expect(getUpgradePrice(featherToy, 0)).toBe(15);
    expect(getUpgradePrice(featherToy, 1)).toBe(24);
    expect(getUpgradePrice(featherToy, 2)).toBe(37);
  });

  it('changes click and passive income after upgrade purchases', () => {
    const now = Date.now();
    const state = createInitialGameState(now);
    const featherToy = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === 'feather-toy');
    const juniorClerk = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === 'junior-clerk');

    if (!featherToy || !juniorClerk) {
      throw new Error('测试升级配置缺失');
    }

    state.fish = 500;
    refreshDerivedState(state);

    expect(purchaseUpgrade(state, featherToy)).toBe(true);
    expect(calculateClickIncome(state)).toBe(2);

    expect(purchaseUpgrade(state, juniorClerk)).toBe(true);
    expect(calculatePassiveIncome(state)).toBe(0.4);
  });

  it('grants popularity when milestones are unlocked', () => {
    const state = createInitialGameState(Date.now());

    grantIncome(state, 1_000);
    const milestones = claimUnlockedMilestones(state);
    refreshDerivedState(state);

    expect(milestones).toHaveLength(3);
    expect(state.popularity).toBe(30);
    expect(calculatePopularityMultiplier(state.popularity)).toBe(1.15);
  });

  it('applies offline earnings with a two-hour cap at half efficiency', () => {
    const now = Date.now();
    const state = createInitialGameState(now - 3 * 60 * 60 * 1000);
    const juniorClerk = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === 'junior-clerk');

    if (!juniorClerk) {
      throw new Error('测试升级配置缺失');
    }

    state.fish = 1_000;
    refreshDerivedState(state);
    purchaseUpgrade(state, juniorClerk);
    state.lastSavedAt = now - 3 * 60 * 60 * 1000;

    const result = applyOfflineProgress(state, now);

    expect(result).not.toBeNull();
    expect(result?.seconds).toBe(7_200);
    expect(result?.amount).toBe(1_440);
  });
});
