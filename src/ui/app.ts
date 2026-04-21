import { WIN_TARGET_POPULARITY, WIN_TARGET_REVENUE } from '../game/content';
import { GameEngine } from '../game/engine';
import type { EngineEvent, GameViewModel, LogTone, UpgradeViewModel } from '../game/types';

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

type MobilePanelTab = 'upgrades' | 'milestones' | 'logs';

export class CafeApp {
  private readonly root: HTMLDivElement;
  private readonly engine: GameEngine;
  private readonly fishValue: HTMLDivElement;
  private readonly clickValue: HTMLDivElement;
  private readonly passiveValue: HTMLDivElement;
  private readonly popularityValue: HTMLDivElement;
  private readonly multiplierValue: HTMLDivElement;
  private readonly lifetimeValue: HTMLDivElement;
  private readonly serveButton: HTMLButtonElement;
  private readonly serveHint: HTMLParagraphElement;
  private readonly nextMilestoneLabel: HTMLParagraphElement;
  private readonly nextMilestoneTitle: HTMLHeadingElement;
  private readonly nextMilestoneBar: HTMLDivElement;
  private readonly winProgressLabel: HTMLParagraphElement;
  private readonly winProgressBar: HTMLDivElement;
  private readonly upgradeList: HTMLDivElement;
  private readonly milestoneList: HTMLDivElement;
  private readonly logList: HTMLDivElement;
  private readonly floatLayer: HTMLDivElement;
  private readonly toastStack: HTMLDivElement;
  private readonly winBanner: HTMLDivElement;
  private readonly mobileTabBar: HTMLDivElement;
  private readonly mobilePanelTitle: HTMLHeadingElement;
  private readonly mobilePanelDescription: HTMLParagraphElement;
  private readonly mobilePanelBody: HTMLDivElement;
  private readonly mobileTabs: HTMLButtonElement[];
  private mobileTab: MobilePanelTab = 'upgrades';
  private unsubscribe: () => void = () => {};

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
    this.serveButton = this.requireElement<HTMLButtonElement>('serve-button');
    this.serveHint = this.requireElement<HTMLParagraphElement>('serve-hint');
    this.nextMilestoneLabel = this.requireElement<HTMLParagraphElement>('next-milestone-label');
    this.nextMilestoneTitle = this.requireElement<HTMLHeadingElement>('next-milestone-title');
    this.nextMilestoneBar = this.requireElement<HTMLDivElement>('next-milestone-bar');
    this.winProgressLabel = this.requireElement<HTMLParagraphElement>('win-progress-label');
    this.winProgressBar = this.requireElement<HTMLDivElement>('win-progress-bar');
    this.upgradeList = this.requireElement<HTMLDivElement>('upgrade-list');
    this.milestoneList = this.requireElement<HTMLDivElement>('milestone-list');
    this.logList = this.requireElement<HTMLDivElement>('log-list');
    this.floatLayer = this.requireElement<HTMLDivElement>('float-layer');
    this.toastStack = this.requireElement<HTMLDivElement>('toast-stack');
    this.winBanner = this.requireElement<HTMLDivElement>('win-banner');
    this.mobileTabBar = this.requireElement<HTMLDivElement>('mobile-tab-bar');
    this.mobilePanelTitle = this.requireElement<HTMLHeadingElement>('mobile-panel-title');
    this.mobilePanelDescription = this.requireElement<HTMLParagraphElement>(
      'mobile-panel-description',
    );
    this.mobilePanelBody = this.requireElement<HTMLDivElement>('mobile-panel-body');
    this.mobileTabs = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('[data-mobile-tab]'),
    );

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
  }

  private bindEvents(): void {
    this.serveButton.addEventListener('click', () => {
      const gained = this.engine.clickGuest();
      this.bumpServeButton();
      this.spawnFloatingGain(`+${formatNumber(gained)}`);
    });

    this.requireElement<HTMLButtonElement>('save-button').addEventListener('click', () => {
      this.engine.save(true);
    });

    this.requireElement<HTMLButtonElement>('reset-button').addEventListener('click', () => {
      const shouldReset = window.confirm(
        '确定要清空当前猫咪咖啡馆存档吗？这会从头开始重新营业。',
      );

      if (shouldReset) {
        this.engine.reset();
      }
    });

    this.upgradeList.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-upgrade-id]');
      const upgradeId = button?.dataset.upgradeId;

      if (!upgradeId) {
        return;
      }

      this.engine.buyUpgrade(upgradeId);
    });

    this.mobilePanelBody.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-upgrade-id]');
      const upgradeId = button?.dataset.upgradeId;

      if (!upgradeId) {
        return;
      }

      this.engine.buyUpgrade(upgradeId);
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
  }

  private render(): void {
    const viewModel = this.engine.getViewModel();
    const { snapshot, state } = viewModel;

    this.fishValue.textContent = `${formatNumber(snapshot.fish)} 小鱼干`;
    this.clickValue.textContent = `${formatNumber(snapshot.clickIncome)} / 次`;
    this.passiveValue.textContent = `${formatNumber(snapshot.passiveIncome)} / 秒`;
    this.popularityValue.textContent = `${formatNumber(state.popularity)} 人气`;
    this.multiplierValue.textContent = `x${snapshot.globalMultiplier.toFixed(2)}`;
    this.lifetimeValue.textContent = `${formatNumber(snapshot.lifetimeRevenue)} 总营收`;
    this.serveHint.textContent = `每次点击招待一桌客人可获得 ${formatNumber(
      snapshot.clickIncome,
    )} 小鱼干，离线结算按 50% 效率补发。`;

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
      this.nextMilestoneTitle.textContent = '全部里程碑已拿下';
      this.nextMilestoneLabel.textContent = '所有猫咪圈层都认识你了，接下来只要冲刺明星猫咖。';
      this.nextMilestoneBar.style.width = '100%';
    }

    this.winProgressLabel.textContent = `目标：总营收 ${formatNumber(
      WIN_TARGET_REVENUE,
    )} / 人气 ${WIN_TARGET_POPULARITY}，当前完成 ${snapshot.winProgress.toFixed(1)}%。`;
    this.winProgressBar.style.width = `${snapshot.winProgress}%`;

    const upgradesMarkup = this.renderUpgradesMarkup(viewModel.upgrades);
    const milestonesMarkup = this.renderMilestonesMarkup(viewModel);
    const logsMarkup = this.renderLogsMarkup(viewModel);

    this.upgradeList.innerHTML = upgradesMarkup;
    this.milestoneList.innerHTML = milestonesMarkup;
    this.logList.innerHTML = logsMarkup;
    this.renderMobilePanel(upgradesMarkup, milestonesMarkup, logsMarkup);
    this.winBanner.classList.toggle('visible', state.hasWon);
  }

  private renderUpgradesMarkup(upgrades: UpgradeViewModel[]): string {
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
              <span class="upgrade-meta">${upgrade.isMaxed ? '已达到本项上限' : '立即购买生效'}</span>
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

  private renderMobilePanel(
    upgradesMarkup: string,
    milestonesMarkup: string,
    logsMarkup: string,
  ): void {
    const panels: Record<
      MobilePanelTab,
      { title: string; description: string; listClass: string; content: string }
    > = {
      upgrades: {
        title: '店面扩张',
        description: '常用升级收在这里，手机上不用滑过整页内容再回头购买。',
        listClass: 'upgrade-list',
        content: upgradesMarkup,
      },
      milestones: {
        title: '猫圈热度',
        description: '随时查看下一阶段奖励，不用拉到页面底部确认进度。',
        listClass: 'milestone-list',
        content: milestonesMarkup,
      },
      logs: {
        title: '营业日志',
        description: '保存、里程碑和购买记录集中查看，减少来回滚动。',
        listClass: 'log-list',
        content: logsMarkup,
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

  private presentEvent(event: EngineEvent): void {
    switch (event.type) {
      case 'save':
        if (event.manual) {
          this.showToast('保存已完成，猫咪咖啡馆进度已经写入本地。', 'success');
        }
        break;
      case 'offline':
        this.showToast(
          `离线营业 ${Math.floor(event.seconds / 60)} 分钟，补发 ${formatNumber(
            event.amount,
          )} 小鱼干。`,
          'success',
        );
        this.spawnFloatingGain(`+${formatNumber(event.amount)}`, 46, 28);
        break;
      case 'milestone':
        this.showToast(`达成「${event.headline}」，人气 +${event.popularityReward}。`, 'milestone');
        break;
      case 'win':
        this.showToast('猫咪咖啡馆晋级为明星猫咖，继续营业也会继续积累收益。', 'milestone');
        break;
      case 'reset':
        this.showToast('存档已重置，新店重新开张。');
        break;
      case 'purchase':
        this.showToast(`已购入 ${event.upgradeName}。`);
        break;
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
            <p class="subtitle">从一张折叠桌和一台小咖啡机开始，把街角小店慢慢经营成城市里最会吸猫的明星猫咖。</p>
          </div>
          <div class="toolbar">
            <button id="save-button" class="ghost-button" type="button">手动保存</button>
            <button id="reset-button" class="ghost-button" type="button">重置存档</button>
          </div>
        </header>

        <section class="summary-grid" aria-label="经营摘要">
          <article class="summary-card">
            <div class="summary-label">库存小鱼干</div>
            <div class="summary-value" id="fish-value">0 小鱼干</div>
            <div class="summary-subvalue">猫咪最在意的硬通货</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">单次招待</div>
            <div class="summary-value" id="click-value">0 / 次</div>
            <div class="summary-subvalue">手动点击的即时收益</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">自动收益</div>
            <div class="summary-value" id="passive-value">0 / 秒</div>
            <div class="summary-subvalue">店员与设备持续营业</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">咖啡馆倍率</div>
            <div class="summary-value" id="multiplier-value">x1.00</div>
            <div class="summary-subvalue">人气与设施叠加后的效率</div>
          </article>
          <article class="summary-card">
            <div class="summary-label">人气与营收</div>
            <div class="summary-value" id="popularity-value">0 人气</div>
            <div class="summary-subvalue" id="lifetime-value">0 总营收</div>
          </article>
        </section>

        <main class="main-grid">
          <section class="card action-panel">
            <div class="panel-header">
              <div>
                <div class="kicker">主营业区</div>
                <h2>招待今天的客人</h2>
              </div>
              <p>点击带来第一波现金流，升级则把生意从手忙脚乱变成稳定经营。</p>
            </div>

            <div class="mascot-stage">
              <div class="mascot-copy">
                <div class="cat-halo">
                  <div class="cat-face">ฅ^•ﻌ•^ฅ</div>
                </div>
                <p class="cat-copy">今天的值班猫已经趴上吧台了，客人越多，咖啡馆越容易变成大家的固定打卡点。</p>
              </div>
              <div class="float-layer" id="float-layer" aria-hidden="true"></div>
            </div>

            <button id="serve-button" class="serve-button" type="button">招待一桌客人</button>
            <p class="serve-hint" id="serve-hint">每次点击招待一桌客人可获得 1 小鱼干，离线结算按 50% 效率补发。</p>

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
                  <div class="kicker">终局目标</div>
                  <h3>冲刺明星猫咖</h3>
                </div>
                <span class="status-pill">持续营业</span>
              </div>
              <p class="progress-copy" id="win-progress-label"></p>
              <div class="progress-bar"><div id="win-progress-bar" class="progress-fill win"></div></div>
            </div>
          </section>

          <aside class="card desktop-secondary">
            <div class="panel-header">
              <div>
                <div class="kicker">升级清单</div>
                <h2>店面扩张</h2>
              </div>
              <p>先把点击做顺，再把自动收益和倍率系统堆起来，节奏会明显加快。</p>
            </div>
            <div id="upgrade-list" class="upgrade-list" aria-live="polite"></div>
          </aside>
        </main>

        <section class="card mobile-secondary">
          <div class="panel-header mobile-panel-header">
            <div>
              <div class="kicker">快速切换</div>
              <h2 id="mobile-panel-title">店面扩张</h2>
            </div>
            <p id="mobile-panel-description">常用升级收在这里，手机上不用滑过整页内容再回头购买。</p>
          </div>
          <div id="mobile-tab-bar" class="mobile-tabs" role="tablist" aria-label="手机分区切换">
            <button class="mobile-tab active" type="button" data-mobile-tab="upgrades" aria-pressed="true">升级</button>
            <button class="mobile-tab" type="button" data-mobile-tab="milestones" aria-pressed="false">里程碑</button>
            <button class="mobile-tab" type="button" data-mobile-tab="logs" aria-pressed="false">日志</button>
          </div>
          <div id="mobile-panel-body" class="mobile-panel-body upgrade-list" aria-live="polite"></div>
        </section>

        <section class="bottom-grid desktop-secondary">
          <section class="card">
            <div class="panel-header">
              <div>
                <div class="kicker">里程碑</div>
                <h2>猫圈热度</h2>
              </div>
              <p>累计营收越高，越能吸引新的客群和更高的人气加成。</p>
            </div>
            <div id="milestone-list" class="milestone-list"></div>
          </section>

          <section class="card">
            <div class="panel-header">
              <div>
                <div class="kicker">营业日志</div>
                <h2>今天店里发生了什么</h2>
              </div>
              <p>保存、里程碑和关键购买都会留下记录，方便你判断下一步怎么扩张。</p>
            </div>
            <div id="log-list" class="log-list"></div>
          </section>
        </section>
      </div>

      <div id="toast-stack" class="toast-stack" aria-live="polite"></div>

      <div id="win-banner" class="win-banner" aria-live="polite">
        <div class="win-copy">
          <strong>明星猫咖达成</strong>
          <span>你已经把街角小店做成了城里的热门猫咖，继续营业也会继续积累收益。</span>
        </div>
        <div class="win-badge">继续营业</div>
      </div>
    `;
  }
}
