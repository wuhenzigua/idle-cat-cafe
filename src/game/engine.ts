import {
  AUTO_SAVE_MS,
  MAX_LOGS,
  STORY_EVENT_INTERVAL_MS,
  STORY_EVENTS,
  UPGRADE_DEFINITIONS,
  createInitialGameState,
} from './content';
import {
  applyOfflineProgress,
  buildAchievementViewModels,
  buildMilestoneViewModels,
  buildUpgradeViewModels,
  calculateClickIncome,
  calculateClickUpgradeContributions,
  calculatePassiveUpgradeContributions,
  claimUnlockedMilestones,
  collectUnlockedAchievements,
  estimatePrestigeGain,
  evaluateWinCondition,
  getNewlyUnlockedUpgrades,
  grantIncome,
  isUpgradeUnlocked,
  purchaseUpgrade,
  refreshDerivedState,
} from './economy';
import { clearPersistedSave, loadSave, persistSave } from './storage';
import type {
  BuyMode,
  EngineEvent,
  GameState,
  GameViewModel,
  LogTone,
  PrestigeResult,
  StorageLike,
} from './types';

type Subscriber = (event: EngineEvent) => void;

export class GameEngine {
  private state: GameState;
  private lastTickAt: number;
  private lastAutoSaveAt: number;
  private readonly subscribers = new Set<Subscriber>();
  private readonly startupEvents: EngineEvent[] = [];
  private readonly unlockedUpgradeIds = new Set<string>();
  private readonly nowProvider: () => number;
  private readonly storage: StorageLike | null | undefined;
  private nextStoryAt: number;
  private lastStoryId: string | null = null;

  constructor(
    nowProvider: () => number = () => Date.now(),
    storage: StorageLike | null | undefined = undefined,
  ) {
    this.nowProvider = nowProvider;
    this.storage = storage;
    const now = this.nowProvider();
    const saveData = loadSave(this.storage);

    this.state = saveData?.gameState ?? createInitialGameState(now);
    this.lastTickAt = now;
    this.lastAutoSaveAt = saveData?.savedAt ?? now;
    this.nextStoryAt = now + STORY_EVENT_INTERVAL_MS;
    this.rebuildUnlockedSet();

    if (saveData) {
      this.state.lastSavedAt = saveData.savedAt;
      this.refreshState();
      this.appendLog('欢迎回来，猫咪们已经替你把店门口守好了。', 'info', now);

      const offlineProgress = applyOfflineProgress(this.state, now);

      if (offlineProgress) {
        this.state.stats.totalOfflineIncome = this.round(
          this.state.stats.totalOfflineIncome + offlineProgress.amount,
        );
        this.state.stats.lifetimePassiveIncome = this.round(
          this.state.stats.lifetimePassiveIncome + offlineProgress.amount,
        );
        this.distributePassiveIncome(offlineProgress.seconds, 0.5);
        this.appendLog(
          `离线结算完成，补发 ${offlineProgress.amount.toFixed(1)} 小鱼干。`,
          'success',
          now,
        );
        this.startupEvents.push({
          type: 'offline',
          amount: offlineProgress.amount,
          seconds: offlineProgress.seconds,
        });
      }

      this.resolveProgression(now, true);
    } else {
      this.appendLog('咖啡机已经预热，第一桌客人正朝你走来。', 'info', now);
      this.refreshState();
    }
  }

  subscribe(listener: Subscriber): () => void {
    this.subscribers.add(listener);

    return () => {
      this.subscribers.delete(listener);
    };
  }

  consumeStartupEvents(): EngineEvent[] {
    return this.startupEvents.splice(0, this.startupEvents.length);
  }

  getViewModel(): GameViewModel {
    const snapshot = refreshDerivedState(this.state);

    return {
      state: this.state,
      snapshot,
      upgrades: buildUpgradeViewModels(this.state),
      milestones: buildMilestoneViewModels(this.state),
      achievements: buildAchievementViewModels(this.state),
    };
  }

  getBuyMode(): BuyMode {
    return this.state.buyMode;
  }

  setBuyMode(mode: BuyMode): void {
    if (this.state.buyMode === mode) {
      return;
    }

    this.state.buyMode = mode;
    this.emit({ type: 'buy-mode', mode });
  }

  clickGuest(): number {
    const now = this.nowProvider();
    const amount = grantIncome(this.state, calculateClickIncome(this.state));

    this.state.stats.totalClicks += 1;
    this.state.stats.lifetimeClickIncome = this.round(this.state.stats.lifetimeClickIncome + amount);
    this.distributeClickIncome();
    this.resolveProgression(now);
    this.emit({ type: 'click', amount });

    return amount;
  }

  buyUpgrade(upgradeId: string): boolean {
    const definition = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === upgradeId);

    if (!definition) {
      return false;
    }

    const result = purchaseUpgrade(this.state, definition, this.state.buyMode);

    if (result.purchased <= 0) {
      return false;
    }

    const now = this.nowProvider();
    const amountText = result.purchased > 1 ? ` x${result.purchased}` : '';
    this.appendLog(`购买了 ${definition.name}${amountText}。`, 'success', now);
    this.resolveProgression(now);
    this.emit({ type: 'purchase', upgradeName: definition.name, amount: result.purchased });

    return true;
  }

  tick(now = this.nowProvider()): void {
    const elapsedMs = now - this.lastTickAt;

    if (elapsedMs <= 0) {
      return;
    }

    this.lastTickAt = now;
    const elapsedSeconds = elapsedMs / 1000;
    const passiveContributions = calculatePassiveUpgradeContributions(this.state);
    let passiveAmount = 0;

    for (const [upgradeId, perSecond] of Object.entries(passiveContributions)) {
      const amount = this.round(perSecond * elapsedSeconds);

      if (amount <= 0) {
        continue;
      }

      this.state.stats.upgradeIncome[upgradeId] = this.round(
        (this.state.stats.upgradeIncome[upgradeId] ?? 0) + amount,
      );
      passiveAmount += amount;
    }

    passiveAmount = grantIncome(this.state, passiveAmount);

    if (passiveAmount > 0) {
      this.state.stats.lifetimePassiveIncome = this.round(
        this.state.stats.lifetimePassiveIncome + passiveAmount,
      );
      this.resolveProgression(now);
      this.emit({ type: 'tick' });
    } else {
      this.maybeTriggerStory(now);
    }

    if (now - this.lastAutoSaveAt >= AUTO_SAVE_MS) {
      this.save(false, now);
    }
  }

  save(manual = false, now = this.nowProvider()): void {
    this.state.lastSavedAt = now;
    persistSave(this.state, now, this.storage);
    this.lastAutoSaveAt = now;

    if (manual) {
      this.appendLog('保存已完成。', 'success', now);
      this.emit({ type: 'save', manual: true });
    }
  }

  toggleSoundEnabled(): boolean {
    this.state.soundEnabled = !this.state.soundEnabled;
    this.emit({ type: 'sound', enabled: this.state.soundEnabled });
    return this.state.soundEnabled;
  }

  canPrestige(): boolean {
    return estimatePrestigeGain(this.state) > 0;
  }

  prestige(now = this.nowProvider()): PrestigeResult | null {
    const gained = estimatePrestigeGain(this.state);

    if (gained <= 0) {
      return null;
    }

    const total = this.state.brandValue + gained;
    const runs = this.state.runs + 1;
    const bestRunRevenue = Math.max(this.state.bestRunRevenue, this.state.lifetimeRevenue);
    const claimedAchievements = [...this.state.claimedAchievements];
    const buyMode = this.state.buyMode;
    const soundEnabled = this.state.soundEnabled;
    const stats = { ...this.state.stats, upgradeIncome: { ...this.state.stats.upgradeIncome } };

    this.state = createInitialGameState(now);
    this.state.brandValue = total;
    this.state.runs = runs;
    this.state.bestRunRevenue = bestRunRevenue;
    this.state.claimedAchievements = claimedAchievements;
    this.state.buyMode = buyMode;
    this.state.soundEnabled = soundEnabled;
    this.state.stats = stats;
    this.lastTickAt = now;
    this.lastAutoSaveAt = now;
    this.nextStoryAt = now + STORY_EVENT_INTERVAL_MS;
    this.rebuildUnlockedSet();

    this.appendLog(`完成品牌重整，连锁品牌值 +${gained}。`, 'milestone', now);
    this.resolveProgression(now);
    persistSave(this.state, now, this.storage);
    this.emit({ type: 'prestige', gained, total });

    return { gained, total };
  }

  reset(now = this.nowProvider()): void {
    this.state = createInitialGameState(now);
    this.lastTickAt = now;
    this.lastAutoSaveAt = now;
    this.nextStoryAt = now + STORY_EVENT_INTERVAL_MS;
    this.rebuildUnlockedSet();
    clearPersistedSave(this.storage);
    this.appendLog('存档已重置，新的猫咖从今天重新开张。', 'info', now);
    this.refreshState();
    persistSave(this.state, now, this.storage);
    this.emit({ type: 'reset' });
  }

  private refreshState(): void {
    refreshDerivedState(this.state);
  }

  private resolveProgression(now: number, deferEventsToStartup = false): void {
    const unlockedMilestones = claimUnlockedMilestones(this.state);

    if (unlockedMilestones.length > 0) {
      this.refreshState();
    }

    for (const milestone of unlockedMilestones) {
      this.appendLog(
        `达成「${milestone.headline}」，人气 +${milestone.popularityReward}。`,
        'milestone',
        now,
      );

      const event: EngineEvent = {
        type: 'milestone',
        headline: milestone.headline,
        popularityReward: milestone.popularityReward,
      };

      if (deferEventsToStartup) {
        this.startupEvents.push(event);
      } else {
        this.emit(event);
      }
    }

    const newlyUnlockedUpgrades = getNewlyUnlockedUpgrades(this.state, this.unlockedUpgradeIds);

    for (const unlockedUpgrade of newlyUnlockedUpgrades) {
      this.appendLog(`解锁了新项目：${unlockedUpgrade.name}。`, 'info', now);
      const event: EngineEvent = { type: 'unlock', upgradeName: unlockedUpgrade.name };

      if (deferEventsToStartup) {
        this.startupEvents.push(event);
      } else {
        this.emit(event);
      }
    }

    const unlockedAchievements = collectUnlockedAchievements(this.state);

    for (const achievement of unlockedAchievements) {
      this.appendLog(`成就达成：${achievement.name}。`, 'milestone', now);
      const event: EngineEvent = { type: 'achievement', achievementName: achievement.name };

      if (deferEventsToStartup) {
        this.startupEvents.push(event);
      } else {
        this.emit(event);
      }
    }

    const didWin = evaluateWinCondition(this.state);

    if (didWin) {
      this.appendLog('你把猫咪咖啡馆经营成了明星猫咖。', 'milestone', now);

      if (deferEventsToStartup) {
        this.startupEvents.push({ type: 'win' });
      } else {
        this.emit({ type: 'win' });
      }
    }

    this.state.bestRunRevenue = Math.max(this.state.bestRunRevenue, this.state.lifetimeRevenue);
    this.refreshState();
    this.maybeTriggerStory(now);
  }

  private maybeTriggerStory(now: number): void {
    if (now < this.nextStoryAt) {
      return;
    }

    const candidates = STORY_EVENTS.filter((candidate) => {
      const revenueReady =
        candidate.minRevenue === undefined || this.state.lifetimeRevenue >= candidate.minRevenue;
      const popularityReady =
        candidate.minPopularity === undefined || this.state.popularity >= candidate.minPopularity;
      const brandReady =
        candidate.minBrand === undefined || this.state.brandValue >= candidate.minBrand;

      return revenueReady && popularityReady && brandReady;
    });

    if (candidates.length <= 0) {
      this.nextStoryAt = now + STORY_EVENT_INTERVAL_MS / 2;
      return;
    }

    const pool = candidates.filter((candidate) => candidate.id !== this.lastStoryId);
    const selectedPool = pool.length > 0 ? pool : candidates;
    const story = selectedPool[Math.floor(Math.random() * selectedPool.length)];

    this.lastStoryId = story.id;
    this.nextStoryAt = now + STORY_EVENT_INTERVAL_MS;
    this.appendLog(`${story.headline}：${story.message}`, 'info', now);
    this.emit({ type: 'story', headline: story.headline, message: story.message });
  }

  private distributeClickIncome(): void {
    const clickContributions = calculateClickUpgradeContributions(this.state);

    for (const [upgradeId, amount] of Object.entries(clickContributions)) {
      if (amount <= 0) {
        continue;
      }

      this.state.stats.upgradeIncome[upgradeId] = this.round(
        (this.state.stats.upgradeIncome[upgradeId] ?? 0) + amount,
      );
    }
  }

  private distributePassiveIncome(seconds: number, ratio = 1): void {
    const passiveContributions = calculatePassiveUpgradeContributions(this.state);

    for (const [upgradeId, perSecond] of Object.entries(passiveContributions)) {
      const amount = this.round(perSecond * seconds * ratio);

      if (amount <= 0) {
        continue;
      }

      this.state.stats.upgradeIncome[upgradeId] = this.round(
        (this.state.stats.upgradeIncome[upgradeId] ?? 0) + amount,
      );
    }
  }

  private rebuildUnlockedSet(): void {
    this.unlockedUpgradeIds.clear();

    for (const definition of UPGRADE_DEFINITIONS) {
      if (isUpgradeUnlocked(this.state, definition) || this.state.upgrades[definition.id] > 0) {
        this.unlockedUpgradeIds.add(definition.id);
      }
    }
  }

  private appendLog(text: string, tone: LogTone, timestamp: number): void {
    const nextEntry = {
      id: `log-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      tone,
      text,
      timestamp,
    };

    this.state.logs = [nextEntry, ...this.state.logs].slice(0, MAX_LOGS);
  }

  private round(value: number): number {
    return Math.round(value * 1_000) / 1_000;
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.subscribers) {
      listener(event);
    }
  }
}
