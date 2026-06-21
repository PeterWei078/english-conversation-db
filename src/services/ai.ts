import type {
  GeminiConversationResult,
  GeminiSituationResult,
  ConversationItem,
} from '../types/index';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ── Throttle ─────────────────────────────────────────────
const THROTTLE_MS = 3000;
let lastCallAt = 0;

export function getThrottleRemaining(): number {
  const elapsed = Date.now() - lastCallAt;
  return Math.max(0, THROTTLE_MS - elapsed);
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const remaining = getThrottleRemaining();
  if (remaining > 0) {
    throw new ThrottleError(remaining);
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `API 錯誤 ${res.status}`);
  }

  lastCallAt = Date.now();

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text;
}

function parseJson<T>(text: string): T {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean) as T;
}

// ── Phrase Lookup ─────────────────────────────────────────
export async function lookupPhrase(
  apiKey: string,
  phrase: string
): Promise<GeminiConversationResult> {
  const prompt = `你是一位專業的英語會話教學助手。請查詢英文會話表達「${phrase}」，嚴格以下列 JSON 格式回傳，不要加任何其他文字：

{
  "phrase": "原始表達（保持原輸入形式）",
  "translation": "繁體中文翻譯（簡潔）",
  "type": "phrase 或 idiom 或 expression 或 sentence_pattern 其中一個",
  "formalityLevel": "formal 或 informal 或 neutral 其中一個",
  "usageNotes": "使用時機與語境說明（繁體中文，2-3句）",
  "dialogueExample": {
    "contextDescription": "對話情境說明（繁體中文）",
    "lines": [
      { "speaker": "A", "text": "英文對話", "translation": "中文翻譯" },
      { "speaker": "B", "text": "英文回應", "translation": "中文翻譯" },
      { "speaker": "A", "text": "英文繼續", "translation": "中文翻譯" }
    ]
  },
  "alternativeExpressions": [
    {
      "expression": "同義或替換的英文表達",
      "nuanceDifference": "與原表達的語感差異（繁體中文，1句）",
      "formalityLevel": "formal 或 informal 或 neutral"
    }
  ],
  "situationTags": ["情境標籤，如：職場、社交、旅遊、餐廳"],
  "tags": ["主題標籤，如：打招呼、道歉、請求、感謝"]
}

對話範例要求：
- 4-6 句對話，自然流暢，貼近真實場景
- 對話中必須包含查詢的表達「${phrase}」

alternativeExpressions 要求：
- 提供 3-5 個同義或功能相近的替換表達
- 每個都要說明語感差異（例如：更正式、更口語、更委婉、美式 vs 英式等）`;

  const text = await callGemini(apiKey, prompt);
  return parseJson<GeminiConversationResult>(text);
}

// ── Dialogue Analysis ─────────────────────────────────────
export async function analyzeDialogue(
  apiKey: string,
  dialogue: string
): Promise<GeminiConversationResult[]> {
  const prompt = `你是英語會話分析師。請從以下英文對話或段落中，找出 8-15 個最實用的會話表達、慣用語和固定句型。

規則：
- 優先選擇：慣用語、固定句型、口語表達、會話填充語、特定語境的常用說法
- 排除過於簡單的基礎片語（如：I want、please help）
- 同一表達出現多次只列一次
- 例句直接從原文引用或略微調整

文章／對話：
"""
${dialogue}
"""

嚴格以 JSON 陣列格式回傳，不要加任何其他文字：
[
  {
    "phrase": "找出的表達",
    "translation": "繁體中文翻譯（簡潔）",
    "type": "phrase 或 idiom 或 expression 或 sentence_pattern",
    "formalityLevel": "formal 或 informal 或 neutral",
    "usageNotes": "使用時機說明（繁體中文，1-2句）",
    "dialogueExample": {
      "contextDescription": "對話情境（繁體中文）",
      "lines": [
        { "speaker": "A", "text": "原文引用或改寫的英文例句", "translation": "中文翻譯" },
        { "speaker": "B", "text": "英文回應", "translation": "中文翻譯" }
      ]
    },
    "alternativeExpressions": [
      {
        "expression": "替換表達",
        "nuanceDifference": "語感差異（繁體中文，1句）",
        "formalityLevel": "formal 或 informal 或 neutral"
      }
    ],
    "situationTags": ["情境標籤"],
    "tags": ["主題標籤"]
  }
]

每筆 alternativeExpressions 提供 2-3 個即可。`;

  const text = await callGemini(apiKey, prompt);
  return parseJson<GeminiConversationResult[]>(text);
}

// ── Situation Search ──────────────────────────────────────
export async function searchSituation(
  apiKey: string,
  situation: string
): Promise<GeminiSituationResult> {
  const prompt = `你是英語情境教學專家。請為「${situation}」這個生活情境，生成一套完整的英語會話學習資料，嚴格以下列 JSON 格式回傳，不要加任何其他文字：

{
  "situationName": "情境名稱（繁體中文）",
  "situationDescription": "情境說明（繁體中文，2-3句，說明這個情境的場合與使用時機）",
  "sampleDialogue": {
    "contextDescription": "對話情境說明（繁體中文）",
    "lines": [
      { "speaker": "A", "text": "英文對話", "translation": "中文翻譯" }
    ]
  },
  "keyPhrases": [
    {
      "phrase": "關鍵英文表達",
      "translation": "繁體中文翻譯",
      "usage": "使用說明（繁體中文，1-2句）",
      "alternatives": [
        {
          "expression": "替換表達",
          "nuanceDifference": "語感差異（繁體中文，1句）",
          "formalityLevel": "formal 或 informal 或 neutral"
        }
      ]
    }
  ],
  "tags": ["相關主題標籤"]
}

要求：
- sampleDialogue：10-14 句自然對話，涵蓋情境中的典型對話流程
- keyPhrases：12-18 個在這個情境中最常用、最實用的表達
- 每個 keyPhrase 提供 2-4 個 alternatives（含語感差異說明）
- 對話要真實自然，包含常見的口語說法和文化背景
- 語言以美式英語為主，如有英式說法可在 alternatives 中說明`;

  const text = await callGemini(apiKey, prompt);
  return parseJson<GeminiSituationResult>(text);
}

// ── Quiz Phrase Generation ─────────────────────────────────
export async function generateQuizHint(
  apiKey: string,
  item: ConversationItem
): Promise<string> {
  const prompt = `為英文表達「${item.phrase}」（${item.translation}）生成一個簡短的學習提示，不超過 30 個字，用繁體中文說明記憶這個表達的訣竅或重點。直接回傳提示文字，不要 JSON。`;
  return callGemini(apiKey, prompt);
}

// ── Custom Error ──────────────────────────────────────────
export class ThrottleError extends Error {
  constructor(public remainingMs: number) {
    super(`請等待 ${Math.ceil(remainingMs / 1000)} 秒後再查詢`);
    this.name = 'ThrottleError';
  }
}
