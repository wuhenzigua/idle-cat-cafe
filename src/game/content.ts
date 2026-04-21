import type { GameState, MilestoneDefinition, UpgradeDefinition } from './types';

export const SAVE_KEY = 'idle-cat-cafe.save.v1';
export const AUTO_SAVE_MS = 15_000;
export const OFFLINE_CAP_MS = 2 * 60 * 60 * 1000;
export const WIN_TARGET_REVENUE = 50_000;
export const WIN_TARGET_POPULARITY = 80;
export const MAX_LOGS = 7;

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  {
    id: 'feather-toy',
    name: '逗猫羽毛棒',
    description: '训练招待节奏，单次招待收益 +1。',
    basePrice: 15,
    priceScale: 1.55,
    effectType: 'click',
    effectValue: 1,
  },
  {
    id: 'paw-sign',
    name: '猫爪招牌',
    description: '门口招牌更吸睛，单次招待收益 +4。',
    basePrice: 80,
    priceScale: 1.7,
    effectType: 'click',
    effectValue: 4,
  },
  {
    id: 'junior-clerk',
    name: '见习猫店员',
    description: '帮你接待散客，自动收益 +0.4 / 秒。',
    basePrice: 30,
    priceScale: 1.6,
    effectType: 'passive',
    effectValue: 0.4,
  },
  {
    id: 'senior-clerk',
    name: '资深猫店员',
    description: '会主动推荐甜点，自动收益 +2 / 秒。',
    basePrice: 140,
    priceScale: 1.75,
    effectType: 'passive',
    effectValue: 2,
  },
  {
    id: 'double-coffee',
    name: '双头咖啡机',
    description: '让高峰期不断杯，自动收益 +8 / 秒。',
    basePrice: 500,
    priceScale: 1.85,
    effectType: 'passive',
    effectValue: 8,
  },
  {
    id: 'sofa-zone',
    name: '舒适沙发区',
    description: '客人更愿意久坐晒猫，全局收益 x1.15。',
    basePrice: 120,
    priceScale: 2.3,
    effectType: 'multiplier',
    effectValue: 1.15,
    maxLevel: 5,
  },
  {
    id: 'photo-wall',
    name: '橱窗打卡墙',
    description: '路过的人都会停下拍照，全局收益 x1.30。',
    basePrice: 700,
    priceScale: 2.6,
    effectType: 'multiplier',
    effectValue: 1.3,
    maxLevel: 4,
  },
  {
    id: 'theme-event',
    name: '猫咪主题活动',
    description: '一场限定活动带来人气 +10，并让全局收益 x1.50。',
    basePrice: 2_200,
    priceScale: 3.2,
    effectType: 'combo',
    effectValue: 1.5,
    popularityBonus: 10,
    maxLevel: 3,
  },
];

export const MILESTONES: MilestoneDefinition[] = [
  {
    id: 'street-cats',
    lifetimeRevenue: 50,
    popularityReward: 5,
    headline: '巷口熟客',
    message: '第一批常客开始专门绕路来摸猫，你的小店终于有了固定回头客。',
  },
  {
    id: 'study-corner',
    lifetimeRevenue: 250,
    popularityReward: 10,
    headline: '作业圣地',
    message: '附近学生把这里当成复习据点，窗边开始出现“今天哪只猫值班”的讨论。',
  },
  {
    id: 'community-star',
    lifetimeRevenue: 1_000,
    popularityReward: 15,
    headline: '社区明星店',
    message: '社区群里不断有人推荐你的奶咖和猫咪合影，晚饭后也开始排队。',
  },
  {
    id: 'social-hotspot',
    lifetimeRevenue: 5_000,
    popularityReward: 20,
    headline: '打卡热店',
    message: '社交平台上的照片越来越多，周末特地来拍猫片的客人开始占满门口。',
  },
  {
    id: 'city-list',
    lifetimeRevenue: 20_000,
    popularityReward: 30,
    headline: '城市榜单入围',
    message: '本地探店榜把你列进热门候选，猫咖已经不只是街角小店。',
  },
];

export function createInitialGameState(now: number): GameState {
  const upgrades = Object.fromEntries(UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, 0]));

  return {
    fish: 0,
    lifetimeRevenue: 0,
    popularity: 0,
    globalMultiplier: 1,
    upgrades,
    lastSavedAt: now,
    hasWon: false,
    claimedMilestones: [],
    logs: [],
  };
}
