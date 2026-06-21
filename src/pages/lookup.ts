import type { GeminiConversationResult, ConversationItem, MasteryLevel } from '../types/index';
import { lookupPhrase, ThrottleError } from '../services/ai';
import {
  loadSettings,
  addPhraseItem,
  phraseExists,
  findSimilarPhrases,
  loadHistory,
  pushHistory,
  clearHistory,
} from '../services/storage';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';
import { showSimilarPhraseDialog } from '../components/confirmDialog';
import { renderDialogue } from '../components/dialogueDisplay';

let throttleTimer: ReturnType<typeof setInterval> | null = null;
let currentResult: GeminiConversationResult | null = null;
let selectedMastery: MasteryLevel = 'unfamiliar';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderLookupPage(container: HTMLElement, initialPhrase?: string): void {
  currentResult = null;
  selectedMastery = 'unfamiliar';

  container.innerHTML = `
    <div class="page">
      <div class="lookup-layout">
        <div class="lookup-main">
          <div class="page-header">
            <h1 class="page-title">片語 ／ 慣用語查詢</h1>
            <p class="page-subtitle">輸入英文表達、慣用語或句型，AI 即時查詢說明與同義替換</p>
          </div>

          <div class="form-group" style="margin-bottom:12px">
            <div class="input-group">
              <input
                id="lookup-input"
                class="input input-lg"
                type="text"
                placeholder="輸入英文表達或慣用語，按 Enter 查詢…"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
              />
              <div class="input-group-append">
                <button id="lookup-btn" class="btn btn-primary">查詢</button>
              </div>
            </div>
          </div>

          <div id="throttle-banner" style="display:none" class="throttle-banner">
            ⏳ 請等待 <span id="throttle-count">0</span> 秒後再查詢
          </div>

          <div id="lookup-output"></div>
        </div>

        <aside id="history-panel">
          ${renderHistoryPanel()}
        </aside>
      </div>
    </div>
  `;

  bindLookupEvents(container);

  if (initialPhrase) {
    const input = container.querySelector<HTMLInputElement>('#lookup-input');
    if (input) input.value = initialPhrase;
    performLookup(initialPhrase, container);
  }
}

function renderHistoryPanel(): string {
  const history = loadHistory();
  const items = history.length
    ? history.map((h) => `
      <div class="lookup-history-item" data-phrase="${esc(h.phrase)}">
        <span class="lookup-history-phrase">${esc(h.phrase)}</span>
        <span class="lookup-history-translation">${esc(h.translation)}</span>
      </div>`).join('')
    : `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">暫無查詢記錄</div>`;

  return `
    <div class="lookup-history-panel">
      <div class="lookup-history-header">
        <span>最近查詢</span>
        ${history.length ? `<button id="clear-history-btn" class="btn-ghost btn btn-sm" style="font-size:12px">清除</button>` : ''}
      </div>
      <div class="lookup-history-list">${items}</div>
    </div>
  `;
}

function refreshHistory(container: HTMLElement): void {
  const panel = container.querySelector('#history-panel');
  if (panel) {
    panel.innerHTML = renderHistoryPanel();
    bindHistoryEvents(container);
  }
}

function bindHistoryEvents(container: HTMLElement): void {
  container.querySelector('#clear-history-btn')?.addEventListener('click', () => {
    clearHistory();
    refreshHistory(container);
  });
  container.querySelectorAll('.lookup-history-item').forEach((el) => {
    el.addEventListener('click', () => {
      const phrase = (el as HTMLElement).dataset.phrase ?? '';
      const input = container.querySelector<HTMLInputElement>('#lookup-input');
      if (input) input.value = phrase;
      performLookup(phrase, container);
    });
  });
}

function bindLookupEvents(container: HTMLElement): void {
  const input = container.querySelector<HTMLInputElement>('#lookup-input')!;
  const btn = container.querySelector<HTMLButtonElement>('#lookup-btn')!;

  const trigger = () => {
    const phrase = input.value.trim();
    if (!phrase) return;
    performLookup(phrase, container);
  };

  btn.addEventListener('click', trigger);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') trigger(); });
  bindHistoryEvents(container);
}

async function performLookup(phrase: string, container: HTMLElement): Promise<void> {
  const settings = loadSettings();
  if (!settings.geminiApiKey) {
    showToast('請先在設定中填入 Gemini API 金鑰', 'warning');
    return;
  }

  const output = container.querySelector<HTMLElement>('#lookup-output')!;
  output.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><span>AI 查詢中…</span></div>`;

  try {
    const result = await lookupPhrase(settings.geminiApiKey, phrase);
    currentResult = result;
    pushHistory({ phrase: result.phrase, translation: result.translation, timestamp: Date.now() });
    refreshHistory(container);
    renderLookupResult(result, output, container);
  } catch (err) {
    if (err instanceof ThrottleError) {
      showThrottle(err.remainingMs, container);
      output.innerHTML = '';
    } else {
      output.innerHTML = `<div class="card" style="color:var(--danger)">查詢失敗：${esc(String(err))}</div>`;
    }
  }
}

function showThrottle(remainingMs: number, container: HTMLElement): void {
  const banner = container.querySelector<HTMLElement>('#throttle-banner')!;
  const count = container.querySelector<HTMLElement>('#throttle-count')!;
  banner.style.display = 'flex';
  let secs = Math.ceil(remainingMs / 1000);
  count.textContent = String(secs);
  if (throttleTimer) clearInterval(throttleTimer);
  throttleTimer = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(throttleTimer!);
      throttleTimer = null;
      banner.style.display = 'none';
    } else {
      count.textContent = String(secs);
    }
  }, 1000);
}

function renderLookupResult(
  result: GeminiConversationResult,
  output: HTMLElement,
  container: HTMLElement
): void {
  const alreadySaved = phraseExists(result.phrase);

  const FORMALITY_LABEL: Record<string, string> = { formal: '正式', informal: '口語', neutral: '通用' };
  const TYPE_LABEL: Record<string, string> = {
    phrase: '片語', idiom: '慣用語', expression: '表達', sentence_pattern: '句型'
  };

  output.innerHTML = `
    <div class="card" style="animation: fadeInUp 0.2s ease">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
          <span style="font-size:24px;font-weight:800">${esc(result.phrase)}</span>
          <span class="phrase-type-badge">${TYPE_LABEL[result.type] ?? result.type}</span>
          <span class="phrase-formality-badge formality-${result.formalityLevel}">${FORMALITY_LABEL[result.formalityLevel] ?? result.formalityLevel}</span>
        </div>
        <button id="speak-phrase-btn" class="btn-icon" title="朗讀" style="font-size:20px">🔊</button>
      </div>

      <!-- Translation -->
      <div style="font-size:17px;font-weight:600;color:var(--text-secondary);margin-bottom:10px">${esc(result.translation)}</div>

      <!-- Usage notes -->
      ${result.usageNotes ? `<div class="phrase-usage-notes" style="margin-bottom:16px">
        <span class="notes-label">用法說明</span>${esc(result.usageNotes)}
      </div>` : ''}

      <div class="divider"></div>

      <!-- Dialogue -->
      <div id="dialogue-section"></div>

      <div class="divider"></div>

      <!-- Alternatives -->
      ${result.alternativeExpressions.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:13px;font-weight:700;color:var(--accent-text);margin-bottom:10px">🔄 替換說法（${result.alternativeExpressions.length} 種）</div>
          <div id="alt-list"></div>
        </div>
        <div class="divider"></div>
      ` : ''}

      <!-- Save section -->
      <div style="margin-top:4px">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:10px">儲存設定</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:13px;color:var(--text-secondary)">熟悉度：</span>
          <div id="mastery-btns" style="display:flex;gap:6px">
            <button class="btn btn-sm mastery-btn mastery-unfamiliar mastery-vote-opt" data-level="unfamiliar">🔴 不熟</button>
            <button class="btn btn-sm mastery-btn mastery-okay       mastery-vote-opt" data-level="okay">🟡 尚可</button>
            <button class="btn btn-sm mastery-btn mastery-familiar   mastery-vote-opt" data-level="familiar">🟢 熟悉</button>
          </div>
        </div>
        <div style="margin-top:12px">
          <button id="save-btn" class="btn btn-primary btn-full btn-lg" ${alreadySaved ? 'disabled' : ''}>
            ${alreadySaved ? '✅ 已儲存' : '💾 儲存到收藏庫'}
          </button>
        </div>
      </div>
    </div>
  `;

  // Render dialogue
  const dialogueSection = output.querySelector<HTMLElement>('#dialogue-section')!;
  const dialogueTitle = document.createElement('div');
  dialogueTitle.style.cssText = 'font-size:13px;font-weight:700;color:var(--accent-text);margin-bottom:10px';
  dialogueTitle.textContent = '💬 情境對話範例';
  dialogueSection.appendChild(dialogueTitle);
  dialogueSection.appendChild(renderDialogue(result.dialogueExample));

  // Render alternatives
  const altList = output.querySelector<HTMLElement>('#alt-list');
  if (altList && result.alternativeExpressions.length) {
    const FORMALITY_LABEL2: Record<string, string> = { formal: '正式', informal: '口語', neutral: '通用' };
    result.alternativeExpressions.forEach((alt) => {
      const item = document.createElement('div');
      item.className = 'alt-item';
      item.innerHTML = `
        <div class="alt-expression">
          <span class="alt-text">${esc(alt.expression)}</span>
          <button class="btn-icon alt-speak-btn" style="width:22px;height:22px;font-size:13px" data-text="${esc(alt.expression)}" title="朗讀">🔊</button>
          <span class="phrase-formality-badge formality-${alt.formalityLevel}">${FORMALITY_LABEL2[alt.formalityLevel] ?? alt.formalityLevel}</span>
        </div>
        <div class="alt-nuance">${esc(alt.nuanceDifference)}</div>
      `;
      item.querySelector('.alt-speak-btn')!.addEventListener('click', (e) => {
        speak((e.currentTarget as HTMLElement).dataset.text ?? '');
      });
      altList.appendChild(item);
    });
  }

  // Speak button
  output.querySelector('#speak-phrase-btn')?.addEventListener('click', () => speak(result.phrase));

  // Mastery selection
  output.querySelectorAll('.mastery-vote-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      output.querySelectorAll('.mastery-vote-opt').forEach((b) => b.classList.remove('ring-selected'));
      btn.classList.add('ring-selected');
      selectedMastery = (btn as HTMLElement).dataset.level as MasteryLevel;
    });
  });

  // Default unfamiliar selected
  output.querySelector('[data-level="unfamiliar"]')?.classList.add('ring-selected');

  // Save button
  output.querySelector('#save-btn')?.addEventListener('click', async () => {
    if (!currentResult) return;

    // Fuzzy duplicate check
    const similars = findSimilarPhrases(currentResult.phrase);
    if (similars.length > 0) {
      const confirmed = await showSimilarPhraseDialog(currentResult.phrase, similars);
      if (!confirmed) return;
    }

    const item: ConversationItem = {
      id: `phrase_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      phrase: currentResult.phrase,
      translation: currentResult.translation,
      type: currentResult.type,
      formalityLevel: currentResult.formalityLevel,
      usageNotes: currentResult.usageNotes,
      dialogueExample: currentResult.dialogueExample,
      alternativeExpressions: currentResult.alternativeExpressions,
      situationTags: [],
      tags: currentResult.tags,
      isPinned: false,
      masteryLevel: selectedMastery,
      createdAt: Date.now(),
    };
    addPhraseItem(item);
    showToast(`已儲存「${item.phrase}」`, 'success');

    const saveBtn = output.querySelector<HTMLButtonElement>('#save-btn');
    if (saveBtn) { saveBtn.textContent = '✅ 已儲存'; saveBtn.disabled = true; }

    refreshHistory(container);
  });
}
