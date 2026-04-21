import { SAVE_KEY, UPGRADE_DEFINITIONS, createInitialGameState } from './content';
import { refreshDerivedState } from './economy';
import type {
  BuyMode,
  GameState,
  LogEntry,
  LogTone,
  SaveDataV2,
  StorageLike,
} from './types';

const LEGACY_SAVE_KEY = 'idle-cat-cafe.save.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function parseLogs(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((entry, index) => {
      const timestamp = parseNumber(entry.timestamp) ?? Date.now() - index;
      const tone: LogTone =
        entry.tone === 'success' || entry.tone === 'milestone' || entry.tone === 'info'
          ? entry.tone
          : 'info';

      return {
        id: typeof entry.id === 'string' ? entry.id : `log-${timestamp}-${index}`,
        tone,
        text: typeof entry.text === 'string' ? entry.text : '恢复了一条旧记录。',
        timestamp,
      };
    })
    .slice(0, 10);
}

function normalizeUpgrades(rawValue: unknown): Record<string, number> {
  const normalized = Object.fromEntries(UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, 0]));

  if (!isRecord(rawValue)) {
    return normalized;
  }

  for (const definition of UPGRADE_DEFINITIONS) {
    const parsedLevel = parseNumber(rawValue[definition.id]);

    if (parsedLevel === null || parsedLevel < 0) {
      continue;
    }

    const cappedLevel =
      definition.maxLevel !== undefined
        ? Math.min(Math.floor(parsedLevel), definition.maxLevel)
        : Math.floor(parsedLevel);

    normalized[definition.id] = cappedLevel;
  }

  return normalized;
}

function parseBuyMode(value: unknown): BuyMode {
  if (value === 10 || value === 'max') {
    return value;
  }

  return 1;
}

function normalizeStats(rawValue: unknown): GameState['stats'] {
  const template = createInitialGameState(Date.now()).stats;

  if (!isRecord(rawValue)) {
    return template;
  }

  const totalClicks = parseNumber(rawValue.totalClicks) ?? template.totalClicks;
  const totalOfflineIncome = parseNumber(rawValue.totalOfflineIncome) ?? template.totalOfflineIncome;
  const lifetimeClickIncome =
    parseNumber(rawValue.lifetimeClickIncome) ?? template.lifetimeClickIncome;
  const lifetimePassiveIncome =
    parseNumber(rawValue.lifetimePassiveIncome) ?? template.lifetimePassiveIncome;
  const upgradeIncome = { ...template.upgradeIncome };

  if (isRecord(rawValue.upgradeIncome)) {
    for (const definition of UPGRADE_DEFINITIONS) {
      const parsed = parseNumber(rawValue.upgradeIncome[definition.id]);

      if (parsed !== null && parsed >= 0) {
        upgradeIncome[definition.id] = parsed;
      }
    }
  }

  return {
    totalClicks,
    totalOfflineIncome,
    lifetimeClickIncome,
    lifetimePassiveIncome,
    upgradeIncome,
  };
}

function normalizeGameState(rawValue: unknown, savedAt: number): GameState | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const template = createInitialGameState(savedAt);
  const fish = parseNumber(rawValue.fish);
  const lifetimeRevenue = parseNumber(rawValue.lifetimeRevenue);
  const popularity = parseNumber(rawValue.popularity);
  const hasWon = parseBoolean(rawValue.hasWon);

  if (fish === null || lifetimeRevenue === null || popularity === null || hasWon === null) {
    return null;
  }

  const state: GameState = {
    ...template,
    fish,
    lifetimeRevenue,
    popularity,
    hasWon,
    upgrades: normalizeUpgrades(rawValue.upgrades),
    claimedMilestones: parseStringArray(rawValue.claimedMilestones),
    logs: parseLogs(rawValue.logs),
    lastSavedAt: savedAt,
    buyMode: parseBuyMode(rawValue.buyMode),
    brandValue: parseNumber(rawValue.brandValue) ?? 0,
    runs: parseNumber(rawValue.runs) ?? 0,
    bestRunRevenue: parseNumber(rawValue.bestRunRevenue) ?? lifetimeRevenue,
    soundEnabled: parseBoolean(rawValue.soundEnabled) ?? true,
    claimedAchievements: parseStringArray(rawValue.claimedAchievements),
    stats: normalizeStats(rawValue.stats),
  };

  refreshDerivedState(state);

  return state;
}

function normalizeLegacyGameState(rawValue: unknown, savedAt: number): GameState | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const template = createInitialGameState(savedAt);
  const fish = parseNumber(rawValue.fish);
  const lifetimeRevenue = parseNumber(rawValue.lifetimeRevenue);
  const popularity = parseNumber(rawValue.popularity);
  const hasWon = parseBoolean(rawValue.hasWon);

  if (fish === null || lifetimeRevenue === null || popularity === null || hasWon === null) {
    return null;
  }

  const state: GameState = {
    ...template,
    fish,
    lifetimeRevenue,
    popularity,
    hasWon,
    upgrades: normalizeUpgrades(rawValue.upgrades),
    claimedMilestones: parseStringArray(rawValue.claimedMilestones),
    logs: parseLogs(rawValue.logs),
    lastSavedAt: savedAt,
    bestRunRevenue: lifetimeRevenue,
  };

  refreshDerivedState(state);

  return state;
}

export function serializeSaveData(state: GameState, savedAt: number): string {
  const preparedState: GameState = {
    ...state,
    lastSavedAt: savedAt,
    logs: state.logs.slice(0, 10),
  };

  return JSON.stringify({
    version: 2,
    savedAt,
    gameState: preparedState,
  } satisfies SaveDataV2);
}

export function deserializeSaveData(raw: string): SaveDataV2 | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const savedAt = parseNumber(parsed.savedAt);

    if (savedAt === null) {
      return null;
    }

    if (parsed.version === 2) {
      const gameState = normalizeGameState(parsed.gameState, savedAt);

      if (!gameState) {
        return null;
      }

      return {
        version: 2,
        savedAt,
        gameState,
      };
    }

    if (parsed.version === 1) {
      const legacyState = normalizeLegacyGameState(parsed.gameState, savedAt);

      if (!legacyState) {
        return null;
      }

      return {
        version: 2,
        savedAt,
        gameState: legacyState,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return null;
  }

  return window.localStorage;
}

export function loadSave(storage: StorageLike | null = getBrowserStorage()): SaveDataV2 | null {
  if (!storage) {
    return null;
  }

  const primaryRaw = storage.getItem(SAVE_KEY);

  if (primaryRaw) {
    const parsed = deserializeSaveData(primaryRaw);

    if (parsed) {
      return parsed;
    }
  }

  const legacyRaw = storage.getItem(LEGACY_SAVE_KEY);

  if (!legacyRaw) {
    return null;
  }

  return deserializeSaveData(legacyRaw);
}

export function persistSave(
  state: GameState,
  savedAt: number,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) {
    return;
  }

  storage.setItem(SAVE_KEY, serializeSaveData(state, savedAt));
}

export function clearPersistedSave(storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) {
    return;
  }

  storage.removeItem(SAVE_KEY);
  storage.removeItem(LEGACY_SAVE_KEY);
}
