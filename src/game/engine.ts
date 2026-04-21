import { AUTO_SAVE_MS, MAX_LOGS, UPGRADE_DEFINITIONS, createInitialGameState } from './content';
import {
  applyOfflineProgress,
  buildMilestoneViewModels,
  buildUpgradeViewModels,
  calculateClickIncome,
  claimUnlockedMilestones,
  evaluateWinCondition,
  grantIncome,
  purchaseUpgrade,
  refreshDerivedState,
} from './economy';
import { clearPersistedSave, loadSave, persistSave } from './storage';
import type {
  EngineEvent,
  GameState,
  GameViewModel,
  LogTone,
  StorageLike,
} from './types';

type Subscriber = (event: EngineEvent) => void;

export class GameEngine {
  private state: GameState;
  private lastTickAt: number;
  private lastAutoSaveAt: number;
  private readonly subscribers = new Set<Subscriber>();
  private readonly startupEvents: EngineEvent[] = [];
  private readonly nowProvider: () => number;
  private readonly storage: StorageLike | null | undefined;

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

    if (saveData) {
      this.state.lastSavedAt = saveData.savedAt;
      this.refreshState();
      this.appendLog('欢迎回来，猫咪们已经替你把店门口守好了。', 'info', now);

      const offlineProgress = applyOfflineProgress(this.state, now);

      if (offlineProgress) {
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
    };
  }

  clickGuest(): number {
    const now = this.nowProvider();
    const amount = grantIncome(this.state, calculateClickIncome(this.state));

    this.resolveProgression(now);
    this.emit({ type: 'click', amount });

    return amount;
  }

  buyUpgrade(upgradeId: string): boolean {
    const definition = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === upgradeId);

    if (!definition) {
      return false;
    }

    const didPurchase = purchaseUpgrade(this.state, definition);

    if (!didPurchase) {
      return false;
    }

    const now = this.nowProvider();
    this.appendLog(`购买了 ${definition.name}。`, 'success', now);
    this.resolveProgression(now);
    this.emit({ type: 'purchase', upgradeName: definition.name });

    return true;
  }

  tick(now = this.nowProvider()): void {
    const elapsedMs = now - this.lastTickAt;

    if (elapsedMs <= 0) {
      return;
    }

    this.lastTickAt = now;
    const passiveIncome = this.getViewModel().snapshot.passiveIncome;
    const passiveAmount = grantIncome(this.state, passiveIncome * (elapsedMs / 1000));

    if (passiveAmount > 0) {
      this.resolveProgression(now);
      this.emit({ type: 'tick' });
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

  reset(now = this.nowProvider()): void {
    this.state = createInitialGameState(now);
    this.lastTickAt = now;
    this.lastAutoSaveAt = now;
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

    const didWin = evaluateWinCondition(this.state);

    if (didWin) {
      this.appendLog('你把猫咪咖啡馆经营成了明星猫咖。', 'milestone', now);

      if (deferEventsToStartup) {
        this.startupEvents.push({ type: 'win' });
      } else {
        this.emit({ type: 'win' });
      }
    }

    this.refreshState();
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

  private emit(event: EngineEvent): void {
    for (const listener of this.subscribers) {
      listener(event);
    }
  }
}
