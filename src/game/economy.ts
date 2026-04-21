import {
  ACHIEVEMENTS,
  MILESTONES,
  OFFLINE_CAP_MS,
  PRESTIGE_UNLOCK_REVENUE,
  UPGRADE_DEFINITIONS,
  WIN_TARGET_POPULARITY,
  WIN_TARGET_REVENUE,
} from './content';
import type {
  AchievementDefinition,
  AchievementViewModel,
  BuyMode,
  EconomySnapshot,
  GameState,
  MilestoneDefinition,
  MilestoneViewModel,
  OfflineProgressResult,
  PassiveSource,
  PurchaseResult,
  UnlockHint,
  UnlockResult,
  UpgradeDefinition,
  UpgradeViewModel,
} from './types';

const BASE_CLICK_INCOME = 1;
const DECIMAL_FACTOR = 1_000;

function roundEconomy(value: number): number {
  return Math.round(value * DECIMAL_FACTOR) / DECIMAL_FACTOR;
}

function safeProgress(current: number, target: number): number {
  if (target <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, current / target));
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

export function calculateBrandMultiplier(brandValue: number): number {
  return roundEconomy(1 + brandValue * 0.06);
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

function calculateBasePassiveSources(state: GameState): PassiveSource[] {
  return UPGRADE_DEFINITIONS.filter((definition) => definition.effectType === 'passive')
    .map((definition) => ({
      id: definition.id,
      name: definition.name,
      perSecond: roundEconomy(definition.effectValue * getUpgradeLevel(state, definition.id)),
    }))
    .filter((source) => source.perSecond > 0);
}

function calculateBasePassiveIncome(state: GameState): number {
  return roundEconomy(
    calculateBasePassiveSources(state).reduce((sum, source) => sum + source.perSecond, 0),
  );
}

export function calculateGlobalMultiplier(state: GameState): number {
  return roundEconomy(
    calculateUpgradeMultiplier(state) *
      calculatePopularityMultiplier(state.popularity) *
      calculateBrandMultiplier(state.brandValue),
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

export function calculatePassiveSources(state: GameState): PassiveSource[] {
  return calculateBasePassiveSources(state)
    .map((source) => ({
      ...source,
      perSecond: roundEconomy(source.perSecond * state.globalMultiplier),
    }))
    .sort((left, right) => right.perSecond - left.perSecond);
}

export function calculateClickUpgradeContributions(state: GameState): Record<string, number> {
  return UPGRADE_DEFINITIONS.filter((definition) => definition.effectType === 'click').reduce<
    Record<string, number>
  >((record, definition) => {
    const level = getUpgradeLevel(state, definition.id);
    const contribution = roundEconomy(level * definition.effectValue * state.globalMultiplier);
    record[definition.id] = contribution;
    return record;
  }, {});
}

export function calculatePassiveUpgradeContributions(state: GameState): Record<string, number> {
  return calculatePassiveSources(state).reduce<Record<string, number>>((record, source) => {
    record[source.id] = source.perSecond;
    return record;
  }, {});
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

export function isUpgradeUnlocked(state: GameState, definition: UpgradeDefinition): boolean {
  const revenueReady =
    definition.unlockRevenue === undefined || state.lifetimeRevenue >= definition.unlockRevenue;
  const popularityReady =
    definition.unlockPopularity === undefined || state.popularity >= definition.unlockPopularity;
  const brandReady =
    definition.unlockBrand === undefined || state.brandValue >= definition.unlockBrand;

  return revenueReady && popularityReady && brandReady;
}

function getUnlockProgress(state: GameState, definition: UpgradeDefinition): number {
  const progresses: number[] = [];

  if (definition.unlockRevenue !== undefined) {
    progresses.push(safeProgress(state.lifetimeRevenue, definition.unlockRevenue));
  }

  if (definition.unlockPopularity !== undefined) {
    progresses.push(safeProgress(state.popularity, definition.unlockPopularity));
  }

  if (definition.unlockBrand !== undefined) {
    progresses.push(safeProgress(state.brandValue, definition.unlockBrand));
  }

  if (progresses.length === 0) {
    return 1;
  }

  return Math.min(...progresses);
}

function getUnlockRequirementText(state: GameState, definition: UpgradeDefinition): string {
  const requirements: string[] = [];

  if (definition.unlockRevenue !== undefined && state.lifetimeRevenue < definition.unlockRevenue) {
    requirements.push(`累计营收 ${definition.unlockRevenue.toLocaleString('zh-CN')}`);
  }

  if (definition.unlockPopularity !== undefined && state.popularity < definition.unlockPopularity) {
    requirements.push(`人气 ${definition.unlockPopularity}`);
  }

  if (definition.unlockBrand !== undefined && state.brandValue < definition.unlockBrand) {
    requirements.push(`品牌值 ${definition.unlockBrand}`);
  }

  if (requirements.length === 0) {
    return '已满足解锁条件';
  }

  return `解锁条件：${requirements.join(' / ')}`;
}

export function getNewlyUnlockedUpgrades(
  state: GameState,
  knownUnlocked: Set<string>,
): UnlockResult[] {
  const unlocked: UnlockResult[] = [];

  for (const definition of UPGRADE_DEFINITIONS) {
    if (knownUnlocked.has(definition.id)) {
      continue;
    }

    if (!isUpgradeUnlocked(state, definition)) {
      continue;
    }

    unlocked.push({
      id: definition.id,
      name: definition.name,
    });
    knownUnlocked.add(definition.id);
  }

  return unlocked;
}

export function purchaseUpgrade(
  state: GameState,
  definition: UpgradeDefinition,
  buyMode: BuyMode,
): PurchaseResult {
  const level = getUpgradeLevel(state, definition.id);

  if (!isUpgradeUnlocked(state, definition) || isUpgradeMaxed(definition, level)) {
    return { purchased: 0, spent: 0 };
  }

  let remaining =
    buyMode === 'max'
      ? Number.MAX_SAFE_INTEGER
      : definition.maxLevel !== undefined
        ? Math.min(buyMode, definition.maxLevel - level)
        : buyMode;
  let spent = 0;
  let purchased = 0;
  let cursorLevel = level;

  while (remaining > 0 && !isUpgradeMaxed(definition, cursorLevel)) {
    const price = getUpgradePrice(definition, cursorLevel);

    if (state.fish + Number.EPSILON < price) {
      break;
    }

    spendFish(state, price);
    cursorLevel += 1;
    purchased += 1;
    spent += price;
    remaining -= 1;
  }

  if (purchased <= 0) {
    return { purchased: 0, spent: 0 };
  }

  state.upgrades[definition.id] = cursorLevel;

  if (definition.effectType === 'combo' && definition.popularityBonus) {
    state.popularity += definition.popularityBonus * purchased;
  }

  refreshDerivedState(state);

  return {
    purchased,
    spent: roundEconomy(spent),
  };
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

export function estimatePrestigeGain(state: GameState): number {
  if (state.lifetimeRevenue < PRESTIGE_UNLOCK_REVENUE) {
    return 0;
  }

  const core = (Math.sqrt(state.lifetimeRevenue) - 180) / 18;
  const popularityBonus = state.popularity / 55;

  return Math.max(0, Math.floor(core + popularityBonus));
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

function getNextUpgradeUnlock(state: GameState): UnlockHint | null {
  const locked = UPGRADE_DEFINITIONS.filter((definition) => !isUpgradeUnlocked(state, definition));

  if (locked.length <= 0) {
    return null;
  }

  locked.sort((left, right) => getUnlockProgress(state, right) - getUnlockProgress(state, left));

  const next = locked[0];

  return {
    id: next.id,
    name: next.name,
    requirementText: getUnlockRequirementText(state, next),
    progress: getUnlockProgress(state, next),
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
    brandMultiplier: calculateBrandMultiplier(state.brandValue),
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
    nextUpgradeUnlock: getNextUpgradeUnlock(state),
    passiveSources: calculatePassiveSources(state),
    winProgress: roundEconomy(((revenueProgress + popularityProgress) / 2) * 100),
    prestigeGainEstimate: estimatePrestigeGain(state),
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
  return UPGRADE_DEFINITIONS.filter((definition) => {
    const level = getUpgradeLevel(state, definition.id);
    return level > 0 || isUpgradeUnlocked(state, definition);
  }).map((definition) => {
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

function getAchievementProgress(
  state: GameState,
  achievement: AchievementDefinition,
): number {
  switch (achievement.conditionType) {
    case 'clicks':
      return safeProgress(state.stats.totalClicks, achievement.target);
    case 'revenue':
      return safeProgress(state.lifetimeRevenue, achievement.target);
    case 'popularity':
      return safeProgress(state.popularity, achievement.target);
    case 'brand':
      return safeProgress(state.brandValue, achievement.target);
    case 'runs':
      return safeProgress(state.runs, achievement.target);
    case 'upgrade-level':
      if (!achievement.upgradeId) {
        return 0;
      }
      return safeProgress(getUpgradeLevel(state, achievement.upgradeId), achievement.target);
    default:
      return 0;
  }
}

export function collectUnlockedAchievements(state: GameState): AchievementDefinition[] {
  const claimed = new Set(state.claimedAchievements);
  const unlocked: AchievementDefinition[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (claimed.has(achievement.id)) {
      continue;
    }

    if (getAchievementProgress(state, achievement) < 1) {
      continue;
    }

    claimed.add(achievement.id);
    unlocked.push(achievement);
  }

  state.claimedAchievements = [...claimed];

  return unlocked;
}

export function buildAchievementViewModels(state: GameState): AchievementViewModel[] {
  const claimed = new Set(state.claimedAchievements);

  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    unlocked: claimed.has(achievement.id),
    progress: getAchievementProgress(state, achievement),
  }));
}

export function getMostProfitableUpgrade(state: GameState): {
  id: string;
  name: string;
  amount: number;
} | null {
  let bestId: string | null = null;
  let bestAmount = 0;

  for (const definition of UPGRADE_DEFINITIONS) {
    const amount = state.stats.upgradeIncome[definition.id] ?? 0;

    if (amount > bestAmount) {
      bestAmount = amount;
      bestId = definition.id;
    }
  }

  if (!bestId) {
    return null;
  }

  const definition = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === bestId);

  if (!definition) {
    return null;
  }

  return {
    id: bestId,
    name: definition.name,
    amount: roundEconomy(bestAmount),
  };
}
