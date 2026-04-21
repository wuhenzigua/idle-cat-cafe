import { MAX_LOGS, SAVE_KEY, UPGRADE_DEFINITIONS, createInitialGameState } from './content';
import { refreshDerivedState } from './economy';
import type { GameState, LogEntry, LogTone, SaveDataV1, StorageLike } from './types';

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
    .slice(0, MAX_LOGS);
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
  };

  refreshDerivedState(state);

  return state;
}

export function serializeSaveData(state: GameState, savedAt: number): string {
  const preparedState: GameState = {
    ...state,
    lastSavedAt: savedAt,
    logs: state.logs.slice(0, MAX_LOGS),
  };

  return JSON.stringify({
    version: 1,
    savedAt,
    gameState: preparedState,
  } satisfies SaveDataV1);
}

export function deserializeSaveData(raw: string): SaveDataV1 | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed) || parsed.version !== 1) {
      return null;
    }

    const savedAt = parseNumber(parsed.savedAt);

    if (savedAt === null) {
      return null;
    }

    const gameState = normalizeGameState(parsed.gameState, savedAt);

    if (!gameState) {
      return null;
    }

    return {
      version: 1,
      savedAt,
      gameState,
    };
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

export function loadSave(storage: StorageLike | null = getBrowserStorage()): SaveDataV1 | null {
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(SAVE_KEY);

  if (!raw) {
    return null;
  }

  return deserializeSaveData(raw);
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
}
