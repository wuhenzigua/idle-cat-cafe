import { describe, expect, it } from 'vitest';

import { UPGRADE_DEFINITIONS, createInitialGameState } from './content';
import {
  applyOfflineProgress,
  calculateClickIncome,
  calculatePassiveIncome,
  estimatePrestigeGain,
  getUpgradePrice,
  isUpgradeUnlocked,
  purchaseUpgrade,
  refreshDerivedState,
} from './economy';

describe('economy system', () => {
  it('calculates upgrade price with scaling and ceiling', () => {
    const featherToy = UPGRADE_DEFINITIONS[0];

    expect(getUpgradePrice(featherToy, 0)).toBe(12);
    expect(getUpgradePrice(featherToy, 1)).toBe(18);
    expect(getUpgradePrice(featherToy, 2)).toBe(27);
  });

  it('supports buy-10 and buy-max purchase mode', () => {
    const now = Date.now();
    const state = createInitialGameState(now);
    const juniorClerk = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === 'junior-clerk');

    if (!juniorClerk) {
      throw new Error('测试升级配置缺失');
    }

    state.fish = 100_000;
    refreshDerivedState(state);

    const buyTen = purchaseUpgrade(state, juniorClerk, 10);
    expect(buyTen.purchased).toBe(10);
    expect(state.upgrades['junior-clerk']).toBe(10);

    const buyMax = purchaseUpgrade(state, juniorClerk, 'max');
    expect(buyMax.purchased).toBeGreaterThan(0);
    expect(state.upgrades['junior-clerk']).toBeGreaterThan(10);
  });

  it('checks unlock requirements for late-game upgrades', () => {
    const state = createInitialGameState(Date.now());
    const cityPopup = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === 'city-popup-tour');

    if (!cityPopup) {
      throw new Error('测试升级配置缺失');
    }

    expect(isUpgradeUnlocked(state, cityPopup)).toBe(false);

    state.lifetimeRevenue = 90_000;
    state.popularity = 120;
    state.brandValue = 3;

    expect(isUpgradeUnlocked(state, cityPopup)).toBe(true);
  });

  it('changes click and passive income after upgrade purchases', () => {
    const now = Date.now();
    const state = createInitialGameState(now);
    const featherToy = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === 'feather-toy');
    const juniorClerk = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === 'junior-clerk');

    if (!featherToy || !juniorClerk) {
      throw new Error('测试升级配置缺失');
    }

    state.fish = 1_000;
    refreshDerivedState(state);

    expect(purchaseUpgrade(state, featherToy, 1).purchased).toBe(1);
    expect(calculateClickIncome(state)).toBe(2);

    expect(purchaseUpgrade(state, juniorClerk, 1).purchased).toBe(1);
    expect(calculatePassiveIncome(state)).toBe(0.5);
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
    purchaseUpgrade(state, juniorClerk, 1);
    state.lastSavedAt = now - 3 * 60 * 60 * 1000;

    const result = applyOfflineProgress(state, now);

    expect(result).not.toBeNull();
    expect(result?.seconds).toBe(7_200);
    expect(result?.amount).toBe(1_800);
  });

  it('estimates prestige gain after unlock threshold', () => {
    const state = createInitialGameState(Date.now());

    expect(estimatePrestigeGain(state)).toBe(0);

    state.lifetimeRevenue = 80_000;
    state.popularity = 100;

    expect(estimatePrestigeGain(state)).toBeGreaterThan(0);
  });
});
