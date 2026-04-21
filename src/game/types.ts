export type UpgradeEffectType = 'click' | 'passive' | 'multiplier' | 'combo';
export type UpgradeBranch = 'core' | 'drink' | 'photo' | 'event';
export type LogTone = 'info' | 'success' | 'milestone';
export type BuyMode = 1 | 10 | 'max';

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  priceScale: number;
  effectType: UpgradeEffectType;
  effectValue: number;
  maxLevel?: number;
  popularityBonus?: number;
  unlockRevenue?: number;
  unlockPopularity?: number;
  unlockBrand?: number;
  branch: UpgradeBranch;
}

export interface MilestoneDefinition {
  id: string;
  lifetimeRevenue: number;
  popularityReward: number;
  headline: string;
  message: string;
}

export interface StoryEventDefinition {
  id: string;
  headline: string;
  message: string;
  minRevenue?: number;
  minPopularity?: number;
  minBrand?: number;
}

export type AchievementConditionType =
  | 'clicks'
  | 'revenue'
  | 'popularity'
  | 'brand'
  | 'runs'
  | 'upgrade-level';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  conditionType: AchievementConditionType;
  target: number;
  upgradeId?: string;
}

export interface AchievementViewModel extends AchievementDefinition {
  unlocked: boolean;
  progress: number;
}

export interface LogEntry {
  id: string;
  tone: LogTone;
  text: string;
  timestamp: number;
}

export interface GameStats {
  totalClicks: number;
  totalOfflineIncome: number;
  lifetimeClickIncome: number;
  lifetimePassiveIncome: number;
  upgradeIncome: Record<string, number>;
}

export interface GameState {
  fish: number;
  lifetimeRevenue: number;
  popularity: number;
  globalMultiplier: number;
  upgrades: Record<string, number>;
  lastSavedAt: number;
  hasWon: boolean;
  claimedMilestones: string[];
  logs: LogEntry[];
  buyMode: BuyMode;
  brandValue: number;
  runs: number;
  bestRunRevenue: number;
  soundEnabled: boolean;
  claimedAchievements: string[];
  stats: GameStats;
}

export interface NextMilestone {
  id: string;
  headline: string;
  targetRevenue: number;
  rewardPopularity: number;
  message: string;
  progress: number;
}

export interface UnlockHint {
  id: string;
  name: string;
  requirementText: string;
  progress: number;
}

export interface PassiveSource {
  id: string;
  name: string;
  perSecond: number;
}

export interface EconomySnapshot {
  fish: number;
  lifetimeRevenue: number;
  clickIncome: number;
  passiveIncome: number;
  globalMultiplier: number;
  popularityMultiplier: number;
  brandMultiplier: number;
  nextMilestone: NextMilestone | null;
  nextUpgradeUnlock: UnlockHint | null;
  passiveSources: PassiveSource[];
  winProgress: number;
  prestigeGainEstimate: number;
}

export interface UpgradeViewModel extends UpgradeDefinition {
  level: number;
  currentPrice: number;
  canAfford: boolean;
  isMaxed: boolean;
  totalEffectLabel: string;
}

export interface MilestoneViewModel extends MilestoneDefinition {
  claimed: boolean;
}

export interface GameViewModel {
  state: GameState;
  snapshot: EconomySnapshot;
  upgrades: UpgradeViewModel[];
  milestones: MilestoneViewModel[];
  achievements: AchievementViewModel[];
}

export interface SaveDataV2 {
  version: 2;
  savedAt: number;
  gameState: GameState;
}

export interface OfflineProgressResult {
  amount: number;
  seconds: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PurchaseResult {
  purchased: number;
  spent: number;
}

export interface UnlockResult {
  id: string;
  name: string;
}

export interface PrestigeResult {
  gained: number;
  total: number;
}

export type EngineEvent =
  | { type: 'tick' }
  | { type: 'click'; amount: number }
  | { type: 'purchase'; upgradeName: string; amount: number }
  | { type: 'save'; manual: boolean }
  | { type: 'offline'; amount: number; seconds: number }
  | { type: 'milestone'; headline: string; popularityReward: number }
  | { type: 'win' }
  | { type: 'reset' }
  | { type: 'buy-mode'; mode: BuyMode }
  | { type: 'unlock'; upgradeName: string }
  | { type: 'achievement'; achievementName: string }
  | { type: 'prestige'; gained: number; total: number }
  | { type: 'story'; headline: string; message: string }
  | { type: 'sound'; enabled: boolean };
