import type {
  ConversationItem,
  SituationPack,
  AppSettings,
  LookupHistoryItem,
} from '../types/index';

const KEYS = {
  PHRASES:    'phrase_collection',
  SITUATIONS: 'situation_collection',
  SETTINGS:   'settings',
  HISTORY:    'lookup_history',
} as const;

const MAX_HISTORY = 20;

// ── Phrases ───────────────────────────────────────────────
export function loadPhrases(): ConversationItem[] {
  try {
    const raw = localStorage.getItem(KEYS.PHRASES);
    return raw ? (JSON.parse(raw) as ConversationItem[]) : [];
  } catch {
    return [];
  }
}

export function savePhrases(items: ConversationItem[]): void {
  localStorage.setItem(KEYS.PHRASES, JSON.stringify(items));
}

export function addPhraseItem(item: ConversationItem): void {
  const list = loadPhrases();
  const existing = list.findIndex((v) => v.id === item.id);
  if (existing !== -1) {
    list[existing] = item;
  } else {
    list.unshift(item);
  }
  savePhrases(list);
}

export function updatePhraseItem(id: string, patch: Partial<ConversationItem>): void {
  const list = loadPhrases();
  const idx = list.findIndex((v) => v.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...patch };
    savePhrases(list);
  }
}

export function deletePhraseItem(id: string): void {
  savePhrases(loadPhrases().filter((v) => v.id !== id));
}

export function phraseExists(phrase: string): boolean {
  return loadPhrases().some(
    (v) => v.phrase.toLowerCase() === phrase.toLowerCase()
  );
}

// ── Situation Packs ───────────────────────────────────────
export function loadSituations(): SituationPack[] {
  try {
    const raw = localStorage.getItem(KEYS.SITUATIONS);
    return raw ? (JSON.parse(raw) as SituationPack[]) : [];
  } catch {
    return [];
  }
}

export function saveSituations(items: SituationPack[]): void {
  localStorage.setItem(KEYS.SITUATIONS, JSON.stringify(items));
}

export function addSituationPack(item: SituationPack): void {
  const list = loadSituations();
  const existing = list.findIndex((s) => s.id === item.id);
  if (existing !== -1) {
    list[existing] = item;
  } else {
    list.unshift(item);
  }
  saveSituations(list);
}

export function deleteSituationPack(id: string): void {
  saveSituations(loadSituations().filter((s) => s.id !== id));
}

// ── Settings ──────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  theme: 'auto',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

// ── Lookup History ────────────────────────────────────────
export function loadHistory(): LookupHistoryItem[] {
  try {
    const raw = localStorage.getItem(KEYS.HISTORY);
    return raw ? (JSON.parse(raw) as LookupHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function pushHistory(item: LookupHistoryItem): void {
  const history = loadHistory().filter(
    (h) => h.phrase.toLowerCase() !== item.phrase.toLowerCase()
  );
  history.unshift(item);
  localStorage.setItem(
    KEYS.HISTORY,
    JSON.stringify(history.slice(0, MAX_HISTORY))
  );
}

export function clearHistory(): void {
  localStorage.removeItem(KEYS.HISTORY);
}

// ── Export / Import ───────────────────────────────────────
export function exportDataJson(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: Date.now(),
      phrases: loadPhrases(),
      situations: loadSituations(),
    },
    null,
    2
  );
}

export function importDataJson(
  json: string,
  mode: 'merge' | 'replace'
): { phrases: number; situations: number } {
  const parsed = JSON.parse(json) as {
    phrases?: ConversationItem[];
    situations?: SituationPack[];
  };
  const incomingPhrases: ConversationItem[] = Array.isArray(parsed.phrases) ? parsed.phrases : [];
  const incomingSituations: SituationPack[] = Array.isArray(parsed.situations) ? parsed.situations : [];

  if (mode === 'replace') {
    savePhrases(incomingPhrases);
    saveSituations(incomingSituations);
    return { phrases: incomingPhrases.length, situations: incomingSituations.length };
  }

  const existingPhrases = loadPhrases();
  const existingIds = new Set(existingPhrases.map((v) => v.id));
  const newPhrases = incomingPhrases.filter((v) => !existingIds.has(v.id));
  savePhrases([...newPhrases, ...existingPhrases]);

  const existingSituations = loadSituations();
  const existingSitIds = new Set(existingSituations.map((s) => s.id));
  const newSituations = incomingSituations.filter((s) => !existingSitIds.has(s.id));
  saveSituations([...newSituations, ...existingSituations]);

  return { phrases: newPhrases.length, situations: newSituations.length };
}

// ── Clear All ─────────────────────────────────────────────
export function clearAllData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}

// ── Storage Usage ─────────────────────────────────────────
export interface StorageBreakdown {
  key: string;
  label: string;
  bytes: number;
}

export interface StorageUsage {
  totalBytes: number;
  usedBytes: number;
  breakdown: StorageBreakdown[];
}

const STORAGE_TOTAL_BYTES = 5 * 1024 * 1024;

export function getStorageUsage(): StorageUsage {
  const breakdown: StorageBreakdown[] = [
    { key: KEYS.PHRASES,    label: '會話收藏' },
    { key: KEYS.SITUATIONS, label: '情境包' },
    { key: KEYS.SETTINGS,   label: '設定' },
    { key: KEYS.HISTORY,    label: '查詢歷史' },
  ].map(({ key, label }) => {
    const val = localStorage.getItem(key) ?? '';
    return { key, label, bytes: val.length * 2 };
  });

  const usedBytes = breakdown.reduce((sum, b) => sum + b.bytes, 0);
  return { totalBytes: STORAGE_TOTAL_BYTES, usedBytes, breakdown };
}
