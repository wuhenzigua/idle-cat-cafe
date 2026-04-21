export type UpgradeEffectType = 'click' | 'passive' | 'multiplier' | 'combo';
export type LogTone = 'info' | 'success' | 'milestone';

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
}

export interface MilestoneDefinition {
  id: string;
  lifetimeRevenue: number;
  popularityReward: number;
  headline: string;
  message: string;
}

export interface LogEntry {
  id: string;
  tone: LogTone;
  text: string;
  timestamp: number;
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
}

export interface NextMilestone {
  id: string;
  headline: string;
  targetRevenue: number;
  rewardPopularity: number;
  message: string;
  progress: number;
}

export interface EconomySnapshot {
  fish: number;
  lifetimeRevenue: number;
  clickIncome: number;
  passiveIncome: number;
  globalMultiplier: number;
  popularityMultiplier: number;
  nextMilestone: NextMilestone | null;
  winProgress: number;
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
}

export interface SaveDataV1 {
  version: 1;
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

export type EngineEvent =
  | { type: 'tick' }
  | { type: 'click'; amount: number }
  | { type: 'purchase'; upgradeName: string }
  | { type: 'save'; manual: boolean }
  | { type: 'offline'; amount: number; seconds: number }
  | { type: 'milestone'; headline: string; popularityReward: number }
  | { type: 'win' }
  | { type: 'reset' };
