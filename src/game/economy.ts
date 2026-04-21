import {
  MILESTONES,
  OFFLINE_CAP_MS,
  UPGRADE_DEFINITIONS,
  WIN_TARGET_POPULARITY,
  WIN_TARGET_REVENUE,
} from './content';
import type {
  EconomySnapshot,
  GameState,
  MilestoneDefinition,
  MilestoneViewModel,
  OfflineProgressResult,
  UpgradeDefinition,
  UpgradeViewModel,
} from './types';

const BASE_CLICK_INCOME = 1;
const DECIMAL_FACTOR = 1_000;

function roundEconomy(value: number): number {
  return Math.round(value * DECIMAL_FACTOR) / DECIMAL_FACTOR;
}

export function getUpgradeLevel(state: GameState, upgradeId: string): number {
  return state.upgrades[upgradeId] ?? 0;
}

export function isUpgradeMaxed(definition: UpgradeDefinition, level: number): boolean {
  return definition.maxLevel !== undefined && level >= definition.maxLevel;
}

export function getUpgradePrice(definition: UpgradeDefinition, level: number): number {
  return Math.ceil(definition.basePrice * definition.priceScale ** level);
}

export function calculatePopularityMultiplier(popularity: number): number {
  return roundEconomy(1 + Math.floor(popularity / 10) * 0.05);
}

function calculateUpgradeMultiplier(state: GameState): number {
  return roundEconomy(
    UPGRADE_DEFINITIONS.reduce((multiplier, definition) => {
      const level = getUpgradeLevel(state, definition.id);

      if (definition.effectType === 'multiplier' || definition.effectType === 'combo') {
        return multiplier * definition.effectValue ** level;
      }

      return multiplier;
    }, 1),
  );
}

function calculateBaseClickIncome(state: GameState): number {
  return roundEconomy(
    BASE_CLICK_INCOME +
      UPGRADE_DEFINITIONS.reduce((sum, definition) => {
        if (definition.effectType !== 'click') {
          return sum;
        }

        return sum + definition.effectValue * getUpgradeLevel(state, definition.id);
      }, 0),
  );
}

function calculateBasePassiveIncome(state: GameState): number {
  return roundEconomy(
    UPGRADE_DEFINITIONS.reduce((sum, definition) => {
      if (definition.effectType !== 'passive') {
        return sum;
      }

      return sum + definition.effectValue * getUpgradeLevel(state, definition.id);
    }, 0),
  );
}

export function calculateGlobalMultiplier(state: GameState): number {
  return roundEconomy(
    calculateUpgradeMultiplier(state) * calculatePopularityMultiplier(state.popularity),
  );
}

export function refreshDerivedState(state: GameState): EconomySnapshot {
  state.globalMultiplier = calculateGlobalMultiplier(state);
  return buildEconomySnapshot(state);
}

export function calculateClickIncome(state: GameState): number {
  return roundEconomy(calculateBaseClickIncome(state) * state.globalMultiplier);
}

export function calculatePassiveIncome(state: GameState): number {
  return roundEconomy(calculateBasePassiveIncome(state) * state.globalMultiplier);
}

export function grantIncome(state: GameState, amount: number): number {
  const normalizedAmount = roundEconomy(Math.max(0, amount));

  state.fish = roundEconomy(state.fish + normalizedAmount);
  state.lifetimeRevenue = roundEconomy(state.lifetimeRevenue + normalizedAmount);

  return normalizedAmount;
}

function spendFish(state: GameState, amount: number): void {
  state.fish = roundEconomy(Math.max(0, state.fish - amount));
}

export function purchaseUpgrade(state: GameState, definition: UpgradeDefinition): boolean {
  const level = getUpgradeLevel(state, definition.id);

  if (isUpgradeMaxed(definition, level)) {
    return false;
  }

  const price = getUpgradePrice(definition, level);

  if (state.fish + Number.EPSILON < price) {
    return false;
  }

  spendFish(state, price);
  state.upgrades[definition.id] = level + 1;

  if (definition.effectType === 'combo' && definition.popularityBonus) {
    state.popularity += definition.popularityBonus;
  }

  refreshDerivedState(state);

  return true;
}

export function claimUnlockedMilestones(state: GameState): MilestoneDefinition[] {
  const claimed = new Set(state.claimedMilestones);
  const newlyUnlocked: MilestoneDefinition[] = [];

  for (const milestone of MILESTONES) {
    if (state.lifetimeRevenue < milestone.lifetimeRevenue || claimed.has(milestone.id)) {
      continue;
    }

    claimed.add(milestone.id);
    state.popularity += milestone.popularityReward;
    newlyUnlocked.push(milestone);
  }

  state.claimedMilestones = [...claimed];

  return newlyUnlocked;
}

export function evaluateWinCondition(state: GameState): boolean {
  if (
    !state.hasWon &&
    state.lifetimeRevenue >= WIN_TARGET_REVENUE &&
    state.popularity >= WIN_TARGET_POPULARITY
  ) {
    state.hasWon = true;
    return true;
  }

  return false;
}

export function applyOfflineProgress(
  state: GameState,
  now: number,
): OfflineProgressResult | null {
  const elapsedMs = Math.max(0, now - state.lastSavedAt);
  const cappedMs = Math.min(elapsedMs, OFFLINE_CAP_MS);

  if (cappedMs <= 0) {
    return null;
  }

  const passiveIncome = calculatePassiveIncome(state);
  const offlineAmount = roundEconomy(passiveIncome * (cappedMs / 1000) * 0.5);

  if (offlineAmount <= 0) {
    return null;
  }

  grantIncome(state, offlineAmount);

  return {
    amount: offlineAmount,
    seconds: Math.floor(cappedMs / 1000),
  };
}

export function buildEconomySnapshot(state: GameState): EconomySnapshot {
  const nextMilestone = MILESTONES.find(
    (milestone) => !state.claimedMilestones.includes(milestone.id),
  );
  const revenueProgress = Math.min(state.lifetimeRevenue / WIN_TARGET_REVENUE, 1);
  const popularityProgress = Math.min(state.popularity / WIN_TARGET_POPULARITY, 1);

  return {
    fish: state.fish,
    lifetimeRevenue: state.lifetimeRevenue,
    clickIncome: calculateClickIncome(state),
    passiveIncome: calculatePassiveIncome(state),
    globalMultiplier: state.globalMultiplier,
    popularityMultiplier: calculatePopularityMultiplier(state.popularity),
    nextMilestone: nextMilestone
      ? {
          id: nextMilestone.id,
          headline: nextMilestone.headline,
          targetRevenue: nextMilestone.lifetimeRevenue,
          rewardPopularity: nextMilestone.popularityReward,
          message: nextMilestone.message,
          progress: Math.min(state.lifetimeRevenue / nextMilestone.lifetimeRevenue, 1),
        }
      : null,
    winProgress: roundEconomy(((revenueProgress + popularityProgress) / 2) * 100),
  };
}

function buildTotalEffectLabel(definition: UpgradeDefinition, level: number): string {
  if (level <= 0) {
    switch (definition.effectType) {
      case 'click':
        return `每级点击 +${definition.effectValue}`;
      case 'passive':
        return `每级自动 +${definition.effectValue.toFixed(1)} / 秒`;
      case 'multiplier':
        return `每级全局 x${definition.effectValue.toFixed(2)}`;
      case 'combo':
        return `每级全局 x${definition.effectValue.toFixed(2)}，人气 +${
          definition.popularityBonus ?? 0
        }`;
    }
  }

  switch (definition.effectType) {
    case 'click':
      return `当前总加成：点击 +${roundEconomy(definition.effectValue * level)}`;
    case 'passive':
      return `当前总加成：自动 +${roundEconomy(definition.effectValue * level)} / 秒`;
    case 'multiplier':
      return `当前总倍率：x${roundEconomy(definition.effectValue ** level).toFixed(2)}`;
    case 'combo':
      return `当前总倍率：x${roundEconomy(definition.effectValue ** level).toFixed(
        2,
      )}，人气 +${(definition.popularityBonus ?? 0) * level}`;
  }
}

export function buildUpgradeViewModels(state: GameState): UpgradeViewModel[] {
  return UPGRADE_DEFINITIONS.map((definition) => {
    const level = getUpgradeLevel(state, definition.id);
    const isMaxed = isUpgradeMaxed(definition, level);
    const currentPrice = isMaxed ? 0 : getUpgradePrice(definition, level);

    return {
      ...definition,
      level,
      currentPrice,
      canAfford: !isMaxed && state.fish + Number.EPSILON >= currentPrice,
      isMaxed,
      totalEffectLabel: buildTotalEffectLabel(definition, level),
    };
  });
}

export function buildMilestoneViewModels(state: GameState): MilestoneViewModel[] {
  return MILESTONES.map((milestone) => ({
    ...milestone,
    claimed: state.claimedMilestones.includes(milestone.id),
  }));
}
