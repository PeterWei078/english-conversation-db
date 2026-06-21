export type MasteryLevel = 'unfamiliar' | 'okay' | 'familiar';
export type FormalityLevel = 'formal' | 'informal' | 'neutral';
export type ConversationItemType = 'phrase' | 'idiom' | 'expression' | 'sentence_pattern';
export type Theme = 'light' | 'dark' | 'auto';

// ── Dialogue ───────────────────────────────────────────────
export interface DialogueLine {
  speaker: string;
  text: string;
  translation: string;
}

export interface DialogueExample {
  contextDescription: string;
  lines: DialogueLine[];
}

// ── Alternative Expression ─────────────────────────────────
export interface AlternativeExpression {
  expression: string;
  nuanceDifference: string;
  formalityLevel: FormalityLevel;
}

// ── Main conversation item ─────────────────────────────────
export interface ConversationItem {
  id: string;
  phrase: string;
  translation: string;
  type: ConversationItemType;
  formalityLevel: FormalityLevel;
  usageNotes: string;
  dialogueExample: DialogueExample;
  alternativeExpressions: AlternativeExpression[];
  situationTags: string[];
  tags: string[];
  isPinned: boolean;
  masteryLevel: MasteryLevel;
  createdAt: number;
}

// ── Situation Pack ─────────────────────────────────────────
export interface SituationPhrase {
  phrase: string;
  translation: string;
  usage: string;
  alternatives: AlternativeExpression[];
}

export interface SituationPack {
  id: string;
  situationName: string;
  situationDescription: string;
  category: string;
  sampleDialogue: DialogueExample;
  keyPhrases: SituationPhrase[];
  savedAt: number;
  tags: string[];
}

// ── AI Result Types ────────────────────────────────────────
export interface GeminiConversationResult {
  phrase: string;
  translation: string;
  type: ConversationItemType;
  formalityLevel: FormalityLevel;
  usageNotes: string;
  dialogueExample: DialogueExample;
  alternativeExpressions: AlternativeExpression[];
  situationTags?: string[];
  tags: string[];
}

export interface GeminiSituationResult {
  situationName: string;
  situationDescription: string;
  sampleDialogue: DialogueExample;
  keyPhrases: SituationPhrase[];
  tags: string[];
}

// ── App Settings ───────────────────────────────────────────
export interface AppSettings {
  geminiApiKey: string;
  theme: Theme;
}

// ── History ───────────────────────────────────────────────
export interface LookupHistoryItem {
  phrase: string;
  translation: string;
  timestamp: number;
}

// ── Sort & Filter ──────────────────────────────────────────
export type SortMode = 'newest' | 'alpha' | 'random' | 'unfamiliar' | 'okay' | 'familiar';
export type CollectionTab = 'phrases' | 'situations';
