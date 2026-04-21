import { PRESTIGE_UNLOCK_REVENUE, WIN_TARGET_POPULARITY, WIN_TARGET_REVENUE } from '../game/content';
import { getMostProfitableUpgrade } from '../game/economy';
import { GameEngine } from '../game/engine';
import type { BuyMode, EngineEvent, GameViewModel, LogTone, UpgradeViewModel } from '../game/types';
import { SoundManager } from './sound';

const compactFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
});

const preciseFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

type MobilePanelTab = 'upgrades' | 'milestones' | 'logs' | 'achievements';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value: number): string {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 10_000) {
    return compactFormatter.format(value);
  }

  if (absoluteValue >= 100) {
    return numberFormatter.format(value);
  }

  return preciseFormatter.format(value);
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseBuyMode(value: string | undefined): BuyMode | null {
  if (value === '1') {
    return 1;
  }

  if (value === '10') {
    return 10;
  }

  if (value === 'max') {
    return 'max';
  }

  return null;
}

export class CafeApp {
  private readonly root: HTMLDivElement;
  private readonly engine: GameEngine;
  private readonly soundManager = new SoundManager();
  private readonly fishValue: HTMLDivElement;
  private readonly clickValue: HTMLDivElement;
  private readonly passiveValue: HTMLDivElement;
  private readonly popularityValue: HTMLDivElement;
  private readonly multiplierValue: HTMLDivElement;
  private readonly lifetimeValue: HTMLDivElement;
  private readonly brandValue: HTMLDivElement;
  private readonly serveButton: HTMLButtonElement;
  private readonly serveHint: HTMLParagraphElement;
  private readonly nextMilestoneLabel: HTMLParagraphElement;
  private readonly nextMilestoneTitle: HTMLHeadingElement;
  private readonly nextMilestoneBar: HTMLDivElement;
  private readonly winProgressLabel: HTMLParagraphElement;
  private readonly winProgressBar: HTMLDivElement;
  private readonly unlockHintLabel: HTMLParagraphElement;
  private readonly unlockHintBar: HTMLDivElement;
  private readonly upgradeList: HTMLDivElement;
  private readonly achievementList: HTMLDivElement;
  private readonly sourceList: HTMLDivElement;
  private readonly statsClicks: HTMLDivElement;
  private readonly statsOffline: HTMLDivElement;
  private readonly statsBestUpgrade: HTMLDivElement;
  private readonly statsBestUpgradeHint: HTMLDivElement;
  private readonly statsRuns: HTMLDivElement;
  private readonly floatLayer: HTMLDivElement;
  private readonly barrageLayer: HTMLDivElement;
  private readonly toastStack: HTMLDivElement;
  private readonly winBanner: HTMLDivElement;
  private readonly mobileTabBar: HTMLDivElement;
  private readonly mobilePanelTitle: HTMLHeadingElement;
  private readonly mobilePanelDescription: HTMLParagraphElement;
  private readonly mobilePanelBody: HTMLDivElement;
  private readonly mobileTabs: HTMLButtonElement[];
  private readonly buyModeButtons: HTMLButtonElement[];
  private readonly soundToggleButton: HTMLButtonElement;
  private readonly prestigeButton: HTMLButtonElement;
  private readonly prestigeHint: HTMLParagraphElement;
  private readonly mascotStage: HTMLDivElement;
  private readonly catFace: HTMLDivElement;
  private readonly catCopy: HTMLParagraphElement;
  private readonly storyBanner: HTMLParagraphElement;
  private readonly keydownHandler: (event: KeyboardEvent) => void;
  private mobileTab: MobilePanelTab = 'upgrades';
  private unsubscribe: () => void = () => {};
  private readonly lastPulseAt = new Map<string, number>();

  constructor(root: HTMLDivElement, engine: GameEngine) {
    this.root = root;
    this.engine = engine;
    this.root.innerHTML = this.renderTemplate();

    this.fishValue = this.requireElement<HTMLDivElement>('fish-value');
    this.clickValue = this.requireElement<HTMLDivElement>('click-value');
    this.passiveValue = this.requireElement<HTMLDivElement>('passive-value');
    this.popularityValue = this.requireElement<HTMLDivElement>('popularity-value');
    this.multiplierValue = this.requireElement<HTMLDivElement>('multiplier-value');
    this.lifetimeValue = this.requireElement<HTMLDivElement>('lifetime-value');
    this.brandValue = this.requireElement<HTMLDivElement>('brand-value');
    this.serveButton = this.requireElement<HTMLButtonElement>('serve-button');
    this.serveHint = this.requireElement<HTMLParagraphElement>('serve-hint');
    this.nextMilestoneLabel = this.requireElement<HTMLParagraphElement>('next-milestone-label');
    this.nextMilestoneTitle = this.requireElement<HTMLHeadingElement>('next-milestone-title');
    this.nextMilestoneBar = this.requireElement<HTMLDivElement>('next-milestone-bar');
    this.winProgressLabel = this.requireElement<HTMLParagraphElement>('win-progress-label');
    this.winProgressBar = this.requireElement<HTMLDivElement>('win-progress-bar');
    this.unlockHintLabel = this.requireElement<HTMLParagraphElement>('unlock-hint-label');
    this.unlockHintBar = this.requireElement<HTMLDivElement>('unlock-hint-bar');
    this.upgradeList = this.requireElement<HTMLDivElement>('upgrade-list');
    this.achievementList = this.requireElement<HTMLDivElement>('achievement-list');
    this.sourceList = this.requireElement<HTMLDivElement>('source-list');
    this.statsClicks = this.requireElement<HTMLDivElement>('stats-clicks');
    this.statsOffline = this.requireElement<HTMLDivElement>('stats-offline');
    this.statsBestUpgrade = this.requireElement<HTMLDivElement>('stats-best-upgrade');
    this.statsBestUpgradeHint = this.requireElement<HTMLDivElement>('stats-best-upgrade-hint');
    this.statsRuns = this.requireElement<HTMLDivElement>('stats-runs');
    this.floatLayer = this.requireElement<HTMLDivElement>('float-layer');
    this.barrageLayer = this.requireElement<HTMLDivElement>('barrage-layer');
    this.toastStack = this.requireElement<HTMLDivElement>('toast-stack');
    this.winBanner = this.requireElement<HTMLDivElement>('win-banner');
    this.mobileTabBar = this.requireElement<HTMLDivElement>('mobile-tab-bar');
    this.mobilePanelTitle = this.requireElement<HTMLHeadingElement>('mobile-panel-title');
    this.mobilePanelDescription = this.requireElement<HTMLParagraphElement>(
      'mobile-panel-description',
    );
    this.mobilePanelBody = this.requireElement<HTMLDivElement>('mobile-panel-body');
    this.soundToggleButton = this.requireElement<HTMLButtonElement>('sound-toggle-button');
    this.prestigeButton = this.requireElement<HTMLButtonElement>('prestige-button');
    this.prestigeHint = this.requireElement<HTMLParagraphElement>('prestige-hint');
    this.mascotStage = this.requireElement<HTMLDivElement>('mascot-stage');
    this.catFace = this.requireElement<HTMLDivElement>('cat-face');
    this.catCopy = this.requireElement<HTMLParagraphElement>('cat-copy');
    this.storyBanner = this.requireElement<HTMLParagraphElement>('story-banner');
    this.mobileTabs = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('[data-mobile-tab]'),
    );
    this.buyModeButtons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('[data-buy-mode]'),
    );
    this.keydownHandler = (event) => this.onKeydown(event);

    this.bindEvents();
    this.render();

    this.unsubscribe = this.engine.subscribe((event) => {
      this.render();
      this.presentEvent(event);
    });

    for (const event of this.engine.consumeStartupEvents()) {
      this.presentEvent(event);
    }
  }

  destroy(): void {
    this.unsubscribe();
    window.removeEventListener('keydown', this.keydownHandler);
  }

  private bindEvents(): void {
    this.serveButton.addEventListener('click', () => {
      const gained = this.engine.clickGuest();
      this.bumpServeButton();
      this.spawnFloatingGain(`+${formatNumber(gained)}`);
      this.soundManager.play('click');

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(8);
      }
    });

    this.requireElement<HTMLButtonElement>('save-button').addEventListener('click', () => {
      this.engine.save(true);
    });

    this.soundToggleButton.addEventListener('click', () => {
      const enabled = this.engine.toggleSoundEnabled();
      this.showToast(enabled ? '音效已开启。' : '音效已关闭。');
    });

    this.prestigeButton.addEventListener('click', () => {
      const shouldPrestige = window.confirm(
        '是否执行品牌重整？当前本局收益会重置，但会获得永久连锁品牌值加成。',
      );

      if (!shouldPrestige) {
        return;
      }

      const result = this.engine.prestige();

      if (!result) {
        this.showToast('当前还无法进行品牌重整。');
      }
    });

    this.requireElement<HTMLButtonElement>('reset-button').addEventListener('click', () => {
      const shouldReset = window.confirm(
        '确定要清空当前猫咪咖啡馆存档吗？品牌值和成就也会一起重置。',
      );

      if (shouldReset) {
        this.engine.reset();
      }
    });

    this.upgradeList.addEventListener('click', (event) => {
      this.handleUpgradePurchase(event);
    });

    this.mobilePanelBody.addEventListener('click', (event) => {
      this.handleUpgradePurchase(event);
    });

    this.mobileTabBar.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-mobile-tab]');
      const nextTab = button?.dataset.mobileTab as MobilePanelTab | undefined;

      if (!nextTab || nextTab === this.mobileTab) {
        return;
      }

      this.mobileTab = nextTab;
      this.render();
    });

    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-buy-mode]');
      const mode = parseBuyMode(button?.dataset.buyMode);

      if (!button || mode === null) {
        return;
      }

      this.engine.setBuyMode(mode);
      this.render();
    });

    window.addEventListener('keydown', this.keydownHandler);
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;

    if (isTyping) {
      return;
    }

    switch (event.code) {
      case 'Space':
      case 'Enter':
        event.preventDefault();
        this.serveButton.click();
        return;
      case 'KeyS':
        event.preventDefault();
        this.engine.save(true);
        return;
      case 'KeyM':
        event.preventDefault();
        this.soundToggleButton.click();
        return;
      case 'KeyQ':
      case 'Digit1':
        this.engine.setBuyMode(1);
        this.render();
        return;
      case 'KeyW':
      case 'Digit2':
        this.engine.setBuyMode(10);
        this.render();
        return;
      case 'KeyE':
      case 'Digit3':
        this.engine.setBuyMode('max');
        this.render();
        return;
      case 'KeyP':
        this.prestigeButton.click();
        return;
      default:
        return;
    }
  }

  private handleUpgradePurchase(event: Event): void {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-upgrade-id]');
    const upgradeId = button?.dataset.upgradeId;

    if (!upgradeId) {
      return;
    }

    this.engine.buyUpgrade(upgradeId);
  }

  private render(): void {
    const viewModel = this.engine.getViewModel();
    const { snapshot, state } = viewModel;

    this.soundManager.setEnabled(state.soundEnabled);
    this.soundToggleButton.textContent = state.soundEnabled ? '音效开' : '音效关';

    this.updateMetric(this.fishValue, `${formatNumber(snapshot.fish)} 小鱼干`, 'fish');
    this.updateMetric(this.clickValue, `${formatNumber(snapshot.clickIncome)} / 次`, 'click');
    this.updateMetric(this.passiveValue, `${formatNumber(snapshot.passiveIncome)} / 秒`, 'passive');
    this.updateMetric(this.popularityValue, `${formatNumber(state.popularity)} 人气`, 'popularity');
    this.updateMetric(this.multiplierValue, `x${snapshot.globalMultiplier.toFixed(2)}`, 'multiplier');
    this.updateMetric(this.lifetimeValue, `${formatNumber(snapshot.lifetimeRevenue)} 总营收`, 'lifetime');
    this.updateMetric(this.brandValue, `${state.brandValue} 品牌值`, 'brand');
    this.updateMetric(this.statsClicks, `${formatNumber(state.stats.totalClicks)} 次`, 'stats-clicks');
    this.updateMetric(
      this.statsOffline,
      `${formatNumber(state.stats.totalOfflineIncome)} 小鱼干`,
      'stats-offline',
    );
    this.updateMetric(this.statsRuns, `${state.runs} 次`, 'stats-runs');

    const bestUpgrade = getMostProfitableUpgrade(state);
    this.statsBestUpgrade.textContent = bestUpgrade ? bestUpgrade.name : '暂无';
    this.statsBestUpgradeHint.textContent = bestUpgrade
      ? `${formatNumber(bestUpgrade.amount)} 小鱼干`
      : '先购入升级后会显示';

    this.serveHint.textContent = `每次点击招待一桌客人可获得 ${formatNumber(
      snapshot.clickIncome,
    )} 小鱼干。快捷键：空格点击，Q/W/E 切换买 1/10/最大。`;

    if (snapshot.nextMilestone) {
      const remainingRevenue = Math.max(
        0,
        snapshot.nextMilestone.targetRevenue - snapshot.lifetimeRevenue,
      );

      this.nextMilestoneTitle.textContent = snapshot.nextMilestone.headline;
      this.nextMilestoneLabel.textContent = `再赚 ${formatNumber(
        remainingRevenue,
      )} 小鱼干可获得 +${snapshot.nextMilestone.rewardPopularity} 人气。`;
      this.nextMilestoneBar.style.width = `${snapshot.nextMilestone.progress * 100}%`;
    } else {
      this.nextMilestoneTitle.textContent = '里程碑已清空';
      this.nextMilestoneLabel.textContent = '所有阶段奖励已领取，继续冲刺品牌值与终局。';
      this.nextMilestoneBar.style.width = '100%';
    }

    if (snapshot.nextUpgradeUnlock) {
      this.unlockHintLabel.textContent = `${snapshot.nextUpgradeUnlock.name}：${snapshot.nextUpgradeUnlock.requirementText}`;
      this.unlockHintBar.style.width = `${snapshot.nextUpgradeUnlock.progress * 100}%`;
    } else {
      this.unlockHintLabel.textContent = '全部升级线路已开放。';
      this.unlockHintBar.style.width = '100%';
    }

    this.winProgressLabel.textContent = `目标：总营收 ${formatNumber(
      WIN_TARGET_REVENUE,
    )} / 人气 ${WIN_TARGET_POPULARITY}，当前完成 ${snapshot.winProgress.toFixed(
      1,
    )}%。品牌倍率 x${snapshot.brandMultiplier.toFixed(2)}。`;
    this.winProgressBar.style.width = `${snapshot.winProgress}%`;
    this.winBanner.classList.toggle('visible', state.hasWon);

    const canPrestige = snapshot.prestigeGainEstimate > 0;
    this.prestigeButton.disabled = !canPrestige;
    this.prestigeHint.textContent = canPrestige
      ? `当前可获得 +${snapshot.prestigeGainEstimate} 品牌值，永久提升全局倍率。`
      : `累计营收达到 ${formatNumber(PRESTIGE_UNLOCK_REVENUE)} 后可进行首次品牌重整。`;

    const upgradesMarkup = this.renderUpgradesMarkup(viewModel.upgrades, state.buyMode);
    const milestonesMarkup = this.renderMilestonesMarkup(viewModel);
    const logsMarkup = this.renderLogsMarkup(viewModel);
    const achievementsMarkup = this.renderAchievementsMarkup(viewModel);

    this.upgradeList.innerHTML = upgradesMarkup;
    this.achievementList.innerHTML = achievementsMarkup;
    this.sourceList.innerHTML = this.renderPassiveSourcesMarkup(snapshot.passiveSources);
    this.renderMobilePanel(upgradesMarkup, milestonesMarkup, logsMarkup, achievementsMarkup);
    this.applyBuyModeButtons(state.buyMode);
    this.updateMascotScene(viewModel);
  }

  private renderUpgradesMarkup(upgrades: UpgradeViewModel[], buyMode: BuyMode): string {
    if (upgrades.length <= 0) {
      return '<article class="log-item"><p class="log-text">升级尚未开放，请继续营业。</p></article>';
    }

    const quantityLabel = buyMode === 'max' ? '买最大' : `买 ${buyMode}`;

    return upgrades
      .map((upgrade) => {
        const buttonClassNames = ['upgrade-card'];

        if (upgrade.canAfford) {
          buttonClassNames.push('can-buy');
        }

        return `
          <button
            type="button"
            class="${buttonClassNames.join(' ')}"
            data-upgrade-id="${upgrade.id}"
            ${upgrade.isMaxed ? 'disabled' : ''}
          >
            <div class="upgrade-top">
              <div>
                <div class="upgrade-name">${escapeHtml(upgrade.name)}</div>
                <div class="upgrade-meta">${escapeHtml(upgrade.description)}</div>
              </div>
              <div class="upgrade-level">Lv. ${upgrade.level}</div>
            </div>
            <div class="upgrade-desc">${escapeHtml(upgrade.totalEffectLabel)}</div>
            <div class="upgrade-footer">
              <span class="upgrade-meta">${upgrade.isMaxed ? '已达到上限' : `${quantityLabel}后立即生效`}</span>
              ${
                upgrade.isMaxed
                  ? '<span class="max-tag">已满级</span>'
                  : `<span class="price-tag">${formatNumber(upgrade.currentPrice)} 小鱼干</span>`
              }
            </div>
          </button>
        `;
      })
      .join('');
  }

  private renderMilestonesMarkup(viewModel: GameViewModel): string {
    return viewModel.milestones
      .map(
        (milestone) => `
          <article class="milestone-item ${milestone.claimed ? 'claimed' : ''}">
            <div class="milestone-top">
              <div>
                <div class="milestone-name">${escapeHtml(milestone.headline)}</div>
                <div class="milestone-meta">累计营收 ${formatNumber(
                  milestone.lifetimeRevenue,
                )} 解锁</div>
              </div>
              ${
                milestone.claimed
                  ? '<span class="claim-tag">已领取</span>'
                  : `<span class="price-tag">+${milestone.popularityReward} 人气</span>`
              }
            </div>
            <p class="milestone-desc">${escapeHtml(milestone.message)}</p>
          </article>
        `,
      )
      .join('');
  }

  private renderLogsMarkup(viewModel: GameViewModel): string {
    return viewModel.state.logs
      .map(
        (log) => `
          <article class="log-item ${log.tone}">
            <div class="log-row">
              <strong>${this.getLogTitle(log.tone)}</strong>
              <span class="log-time">${formatClock(log.timestamp)}</span>
            </div>
            <p class="log-text">${escapeHtml(log.text)}</p>
          </article>
        `,
      )
      .join('');
  }

  private renderAchievementsMarkup(viewModel: GameViewModel): string {
    return viewModel.achievements
      .map((achievement) => {
        const progressPercent = Math.round(achievement.progress * 100);

        return `
          <article class="achievement-item ${achievement.unlocked ? 'unlocked' : ''}">
            <div class="log-row">
              <strong>${escapeHtml(achievement.name)}</strong>
              <span class="log-time">${achievement.unlocked ? '已达成' : `${progressPercent}%`}</span>
            </div>
            <p class="log-text">${escapeHtml(achievement.description)}</p>
            <div class="progress-bar small">
              <div class="progress-fill ${achievement.unlocked ? 'win' : ''}" style="width:${progressPercent}%"></div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  private renderPassiveSourcesMarkup(
    sources: Array<{ id: string; name: string; perSecond: number }>,
  ): string {
    if (sources.length <= 0) {
      return '<article class="log-item"><p class="log-text">当前没有自动收益来源，先购买店员或设备。</p></article>';
    }

    return sources
      .slice(0, 5)
      .map(
        (source) => `
          <article class="source-item">
            <span>${escapeHtml(source.name)}</span>
            <strong>${formatNumber(source.perSecond)} / 秒</strong>
          </article>
        `,
      )
      .join('');
  }

  private renderMobilePanel(
    upgradesMarkup: string,
    milestonesMarkup: string,
    logsMarkup: string,
    achievementsMarkup: string,
  ): void {
    const panels: Record<
      MobilePanelTab,
      { title: string; description: string; listClass: string; content: string }
    > = {
      upgrades: {
        title: '店面扩张',
        description: '买 1 / 买 10 / 买最大都可用，优先把自动收益线堆起来。',
        listClass: 'upgrade-list',
        content: upgradesMarkup,
      },
      milestones: {
        title: '猫圈热度',
        description: '阶段奖励和进度都集中在这里，减少来回滚动。',
        listClass: 'milestone-list',
        content: milestonesMarkup,
      },
      logs: {
        title: '营业日志',
        description: '动态事件、保存和关键升级记录都在这里。',
        listClass: 'log-list',
        content: logsMarkup,
      },
      achievements: {
        title: '成就目标',
        description: '本局目标与长期目标分离，二周目也有追求。',
        listClass: 'achievement-list',
        content: achievementsMarkup,
      },
    };
    const panel = panels[this.mobileTab];

    this.mobilePanelTitle.textContent = panel.title;
    this.mobilePanelDescription.textContent = panel.description;
    this.mobilePanelBody.className = `mobile-panel-body ${panel.listClass}`;
    this.mobilePanelBody.innerHTML = panel.content;

    for (const button of this.mobileTabs) {
      const isActive = button.dataset.mobileTab === this.mobileTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
  }

  private applyBuyModeButtons(mode: BuyMode): void {
    for (const button of this.buyModeButtons) {
      const buttonMode = parseBuyMode(button.dataset.buyMode);
      const active = buttonMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  private updateMascotScene(viewModel: GameViewModel): void {
    const revenue = viewModel.state.lifetimeRevenue;
    const popularity = viewModel.state.popularity;
    let face = 'ฅ^•ﻌ•^ฅ';
    let copy = '今天的值班猫已经趴上吧台了，客人越多，店里节奏越稳。';
    let stageClass = 'stage-early';

    if (viewModel.state.hasWon) {
      face = 'ฅ^•ﻌ•^ฅ✦';
      copy = '明星猫咖达成，猫咪们开始挑选下一站扩张城市。';
      stageClass = 'stage-fame';
    } else if (revenue >= 40_000 || popularity >= 90) {
      face = '(=^･ω･^=)';
      copy = '品牌进入高光阶段，探店客和回头客同时拉升节奏。';
      stageClass = 'stage-late';
    } else if (revenue >= 10_000 || popularity >= 45) {
      face = 'ฅ(•ㅅ•)ฅ';
      copy = '店里开始形成固定客流，升级决策比疯狂点击更重要。';
      stageClass = 'stage-mid';
    }

    this.mascotStage.classList.remove('stage-early', 'stage-mid', 'stage-late', 'stage-fame');
    this.mascotStage.classList.add(stageClass);
    this.catFace.textContent = face;
    this.catCopy.textContent = copy;
  }

  private presentEvent(event: EngineEvent): void {
    switch (event.type) {
      case 'save':
        if (event.manual) {
          this.showToast('保存已完成，猫咪咖啡馆进度已写入本地。', 'success');
          this.soundManager.play('purchase');
        }
        break;
      case 'offline':
        this.showToast(
          `离线营业 ${Math.floor(event.seconds / 60)} 分钟，补发 ${formatNumber(
            event.amount,
          )} 小鱼干。`,
          'success',
        );
        this.spawnFloatingGain(`+${formatNumber(event.amount)}`, 48, 30);
        this.spawnBarrage(`离线收益 +${formatNumber(event.amount)} 小鱼干`, 'success');
        this.soundManager.play('milestone');
        break;
      case 'milestone':
        this.showToast(`达成「${event.headline}」，人气 +${event.popularityReward}。`, 'milestone');
        this.spawnBarrage(`里程碑：${event.headline}（+${event.popularityReward} 人气）`, 'milestone');
        this.soundManager.play('milestone');
        break;
      case 'unlock':
        this.showToast(`解锁新升级：${event.upgradeName}。`);
        this.spawnBarrage(`解锁：${event.upgradeName}`, 'info');
        break;
      case 'achievement':
        this.showToast(`成就达成：${event.achievementName}。`, 'milestone');
        this.spawnBarrage(`成就达成：${event.achievementName}`, 'milestone');
        this.soundManager.play('achievement');
        break;
      case 'purchase':
        this.showToast(
          event.amount > 1
            ? `已购入 ${event.upgradeName} x${event.amount}。`
            : `已购入 ${event.upgradeName}。`,
        );
        this.soundManager.play('purchase');
        break;
      case 'buy-mode':
        this.showToast(`购买模式已切换为 ${event.mode === 'max' ? '买最大' : `买 ${event.mode}`}。`);
        break;
      case 'story':
        this.storyBanner.textContent = `「${event.headline}」${event.message}`;
        this.showToast(`${event.headline}：${event.message}`);
        this.spawnBarrage(`${event.headline}：${event.message}`, 'info');
        break;
      case 'sound':
        this.soundManager.setEnabled(event.enabled);
        break;
      case 'prestige':
        this.showToast(`品牌重整完成，获得 +${event.gained} 品牌值。`, 'milestone');
        this.spawnBarrage(`品牌重整完成：+${event.gained} 品牌值`, 'milestone');
        this.soundManager.play('prestige');
        break;
      case 'win':
        this.showToast('猫咪咖啡馆晋级明星门店，继续营业可冲更高品牌值。', 'milestone');
        this.spawnBarrage('明星猫咖达成，进入高热度运营阶段。', 'milestone');
        this.soundManager.play('achievement');
        break;
      case 'reset':
        this.showToast('存档已重置，新店重新开张。');
        break;
      case 'click':
      case 'tick':
      default:
        break;
    }
  }

  private bumpServeButton(): void {
    this.serveButton.classList.remove('bump');
    void this.serveButton.offsetWidth;
    this.serveButton.classList.add('bump');
  }

  private spawnFloatingGain(label: string, left = 50, top = 62): void {
    const element = document.createElement('span');
    element.className = 'floating-gain';
    element.textContent = label;
    element.style.left = `${left + (Math.random() * 12 - 6)}%`;
    element.style.top = `${top + (Math.random() * 10 - 5)}%`;
    this.floatLayer.append(element);
    window.setTimeout(() => element.remove(), 900);
  }

  private spawnBarrage(message: string, tone: LogTone = 'info'): void {
    const element = document.createElement('span');
    const lane = Math.floor(Math.random() * 3);
    const duration = 6200 + Math.floor(Math.random() * 2200);
    const activeItems = this.barrageLayer.querySelectorAll('.barrage-item');

    if (activeItems.length >= 6) {
      activeItems[0]?.remove();
    }

    element.className = `barrage-item ${tone}`;
    element.textContent = message;
    element.style.setProperty('--barrage-top', `${10 + lane * 26}%`);
    element.style.animationDuration = `${duration}ms`;
    this.barrageLayer.append(element);
    window.setTimeout(() => element.remove(), duration + 200);
  }

  private showToast(message: string, tone: LogTone = 'info'): void {
    const toast = document.createElement('div');
    toast.className = `toast ${tone}`;
    toast.textContent = message;
    this.toastStack.append(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  private getLogTitle(tone: LogTone): string {
    switch (tone) {
      case 'success':
        return '店铺动态';
      case 'milestone':
        return '里程碑';
      default:
        return '营业记录';
    }
  }

  private updateMetric(element: HTMLElement, text: string, key: string): void {
    if (element.textContent !== text) {
      element.textContent = text;
      const now = Date.now();
      const lastAt = this.lastPulseAt.get(key) ?? 0;

      if (now - lastAt > 260) {
        this.lastPulseAt.set(key, now);
        element.classList.remove('number-jump');
        void element.offsetWidth;
        element.classList.add('number-jump');
      }
    }
  }

  private requireElement<T extends HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);

    if (!element) {
      throw new Error(`缺少 UI 节点 #${id}`);
    }

    return element;
  }

  private renderTemplate(): string {
    return `
      <div class="page-shell">
        <header class="topbar">
          <div>
            <p class="eyebrow">Incremental Cat Cafe</p>
            <h1>猫咪咖啡馆</h1>
            <p class="subtitle">V1.3 版本：批量购买、分层升级、品牌重整、成就目标与动态事件都已接入。</p>
          </div>
          <div class="toolbar">
            <button id="save-button" class="ghost-button" type="button">手动保存</button>
            <button id="sound-toggle-button" class="ghost-button" type="button">音效开</button>
            <button id="reset-button" class="ghost-button" type="button">重置存档</button>
          </div>
        </header>

        <section class="story-strip card">
          <p id="story-banner">「营业提示」先稳定自动收益，再用倍率和活动冲刺中后期。</p>
        </section>

        <section class="summary-grid" aria-label="经营摘要">
          <article class="summary-card">
            <div class="summary-label">库存小鱼干</div>
            <div class="summary-value" id="fish-value">0 小鱼干</div>
            <div class="summary-subvalue">当前可支配货币</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">单次招待</div>
            <div class="summary-value" id="click-value">0 / 次</div>
            <div class="summary-subvalue">手动点击收益</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">自动收益</div>
            <div class="summary-value" id="passive-value">0 / 秒</div>
            <div class="summary-subvalue">设备与店员贡献</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">全局倍率</div>
            <div class="summary-value" id="multiplier-value">x1.00</div>
            <div class="summary-subvalue">人气 + 品牌 + 设施</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">人气与营收</div>
            <div class="summary-value" id="popularity-value">0 人气</div>
            <div class="summary-subvalue" id="lifetime-value">0 总营收</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">连锁品牌值</div>
            <div class="summary-value" id="brand-value">0 品牌值</div>
            <div class="summary-subvalue">prestige 永久加成</div>
          </article>
        </section>

        <main class="main-grid">
          <section class="card action-panel">
            <div class="panel-header">
              <div>
                <div class="kicker">主营业区</div>
                <h2>招待今天的客人</h2>
              </div>
              <p>先点出基础现金流，再靠买 10 和买最大推进中后期节奏。</p>
            </div>

            <div id="mascot-stage" class="mascot-stage stage-early">
              <div class="mascot-copy">
                <div class="cat-halo">
                  <div id="cat-face" class="cat-face">ฅ^•ﻌ•^ฅ</div>
                </div>
                <p id="cat-copy" class="cat-copy">今天的值班猫已经趴上吧台了，客人越多，店里节奏越稳。</p>
              </div>
              <div class="barrage-layer" id="barrage-layer" aria-hidden="true"></div>
              <div class="float-layer" id="float-layer" aria-hidden="true"></div>
            </div>

            <button id="serve-button" class="serve-button" type="button">招待一桌客人</button>
            <p class="serve-hint" id="serve-hint">每次点击招待一桌客人可获得 1 小鱼干。</p>

            <div class="milestone-status">
              <div class="status-head">
                <div>
                  <div class="kicker">下一站</div>
                  <h3 id="next-milestone-title">巷口熟客</h3>
                </div>
                <span class="status-pill">里程碑</span>
              </div>
              <p class="progress-copy" id="next-milestone-label"></p>
              <div class="progress-bar"><div id="next-milestone-bar" class="progress-fill"></div></div>
            </div>

            <div class="milestone-status">
              <div class="status-head">
                <div>
                  <div class="kicker">下一条升级线</div>
                  <h3>分层解锁</h3>
                </div>
                <span class="status-pill">新内容</span>
              </div>
              <p class="progress-copy" id="unlock-hint-label"></p>
              <div class="progress-bar"><div id="unlock-hint-bar" class="progress-fill"></div></div>
            </div>

            <div class="milestone-status">
              <div class="status-head">
                <div>
                  <div class="kicker">终局目标</div>
                  <h3>冲刺明星猫咖</h3>
                </div>
                <span class="status-pill">长期运营</span>
              </div>
              <p class="progress-copy" id="win-progress-label"></p>
              <div class="progress-bar"><div id="win-progress-bar" class="progress-fill win"></div></div>
            </div>

            <div class="stats-grid">
              <article class="stats-item">
                <span>总点击次数</span>
                <strong id="stats-clicks">0 次</strong>
              </article>
              <article class="stats-item">
                <span>总离线收益</span>
                <strong id="stats-offline">0 小鱼干</strong>
              </article>
              <article class="stats-item">
                <span>最赚钱升级</span>
                <strong id="stats-best-upgrade">暂无</strong>
                <small id="stats-best-upgrade-hint">先购入升级后会显示</small>
              </article>
              <article class="stats-item">
                <span>品牌重整次数</span>
                <strong id="stats-runs">0 次</strong>
              </article>
            </div>

            <div class="panel-header compact">
              <div>
                <div class="kicker">当前每秒收益来源</div>
                <h3>自动收益拆分</h3>
              </div>
            </div>
            <div id="source-list" class="source-list"></div>

            <div class="prestige-panel">
              <div>
                <div class="kicker">V1.2 品牌重整</div>
                <h3>连锁品牌值（Prestige）</h3>
                <p id="prestige-hint" class="progress-copy">累计营收达到解锁条件后可进行品牌重整。</p>
              </div>
              <button id="prestige-button" class="ghost-button prestige-button" type="button">执行品牌重整</button>
            </div>
          </section>

          <aside class="card desktop-secondary">
            <div class="panel-header">
              <div>
                <div class="kicker">升级清单</div>
                <h2>店面扩张</h2>
              </div>
              <p>分层解锁 + 买 1/10/最大，避免开局信息过载。</p>
            </div>
            <div class="buy-mode-bar">
              <button class="buy-mode-button active" type="button" data-buy-mode="1" aria-pressed="true">买 1</button>
              <button class="buy-mode-button" type="button" data-buy-mode="10" aria-pressed="false">买 10</button>
              <button class="buy-mode-button" type="button" data-buy-mode="max" aria-pressed="false">买最大</button>
            </div>
            <div id="upgrade-list" class="upgrade-list" aria-live="polite"></div>
          </aside>
        </main>

        <section class="card mobile-secondary">
          <div class="panel-header mobile-panel-header">
            <div>
              <div class="kicker">手机快捷区</div>
              <h2 id="mobile-panel-title">店面扩张</h2>
            </div>
            <p id="mobile-panel-description">关键动态在主区弹幕显示，这里保留可回查面板。</p>
          </div>
          <div id="mobile-tab-bar" class="mobile-tabs" role="tablist" aria-label="手机分区切换">
            <button class="mobile-tab active" type="button" data-mobile-tab="upgrades" aria-pressed="true">升级</button>
            <button class="mobile-tab" type="button" data-mobile-tab="milestones" aria-pressed="false">里程碑</button>
            <button class="mobile-tab" type="button" data-mobile-tab="logs" aria-pressed="false">日志</button>
            <button class="mobile-tab" type="button" data-mobile-tab="achievements" aria-pressed="false">成就</button>
          </div>
          <div class="buy-mode-bar compact">
            <button class="buy-mode-button active" type="button" data-buy-mode="1" aria-pressed="true">买 1</button>
            <button class="buy-mode-button" type="button" data-buy-mode="10" aria-pressed="false">买 10</button>
            <button class="buy-mode-button" type="button" data-buy-mode="max" aria-pressed="false">买最大</button>
          </div>
          <div id="mobile-panel-body" class="mobile-panel-body upgrade-list" aria-live="polite"></div>
        </section>

        <section class="card desktop-secondary">
          <div class="panel-header">
            <div>
              <div class="kicker">成就系统</div>
              <h2>明确目标而非纯刷数值</h2>
            </div>
            <p>首轮和二周目目标并行，避免通关后失去动力。</p>
          </div>
          <div id="achievement-list" class="achievement-list"></div>
        </section>
      </div>

      <div id="toast-stack" class="toast-stack" aria-live="polite"></div>

      <div id="win-banner" class="win-banner" aria-live="polite">
        <div class="win-copy">
          <strong>明星猫咖达成</strong>
          <span>继续运营可以积累更多品牌值并冲更高周目效率。</span>
        </div>
        <div class="win-badge">继续营业</div>
      </div>
    `;
  }
}
