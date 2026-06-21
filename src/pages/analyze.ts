import type { GeminiConversationResult, ConversationItem, MasteryLevel } from '../types/index';
import { analyzeDialogue, ThrottleError } from '../services/ai';
import { loadSettings, addPhraseItem, phraseExists, findSimilarPhrases } from '../services/storage';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';
import { renderDialogue } from '../components/dialogueDisplay';
import { showSimilarPhraseDialog } from '../components/confirmDialog';

const MAX_CHARS = 5000;

interface ResultItem {
  result: GeminiConversationResult;
  checked: boolean;
  alreadySaved: boolean;
  similarLabel: string | null;  // non-null means fuzzy similar found
}

let items: ResultItem[] = [];
let selectedMastery: MasteryLevel = 'unfamiliar';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderAnalyzePage(container: HTMLElement): void {
  items = [];
  selectedMastery = 'unfamiliar';

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">對話段落分析</h1>
        <p class="page-subtitle">貼上英文對話或文章，AI 自動找出重要的會話表達與慣用語</p>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label class="label" style="margin:0">貼上英文對話或文章</label>
            <span id="char-count" style="font-size:12px;color:var(--text-muted)">0 / ${MAX_CHARS}</span>
          </div>
          <textarea
            id="dialogue-input"
            class="input"
            style="min-height:200px;resize:vertical;line-height:1.7;font-size:14px"
            placeholder="在此貼上英文對話或文章段落…"
            maxlength="${MAX_CHARS}"
          ></textarea>
        </div>
        <button id="analyze-btn" class="btn btn-primary btn-lg btn-full">
          🔍 分析對話（找出重要表達與慣用語）
        </button>
      </div>

      <div id="analyze-output"></div>
    </div>
  `;

  bindAnalyzeEvents(container);
}

function bindAnalyzeEvents(container: HTMLElement): void {
  const textarea = container.querySelector<HTMLTextAreaElement>('#dialogue-input')!;
  const charCount = container.querySelector<HTMLElement>('#char-count')!;
  const btn = container.querySelector<HTMLButtonElement>('#analyze-btn')!;

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len} / ${MAX_CHARS}`;
    charCount.style.color = len > MAX_CHARS * 0.9 ? 'var(--danger)' : 'var(--text-muted)';
  });

  btn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) { showToast('請先貼上英文對話或文章', 'warning'); return; }
    if (text.length < 50) { showToast('內容太短，請至少貼上 50 個字元', 'warning'); return; }
    performAnalysis(text, container);
  });
}

async function performAnalysis(text: string, container: HTMLElement): Promise<void> {
  const settings = loadSettings();
  if (!settings.geminiApiKey) {
    showToast('請先在設定中填入 Gemini API 金鑰', 'warning');
    return;
  }

  const output = container.querySelector<HTMLElement>('#analyze-output')!;
  output.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><span>AI 分析中，請稍候…</span></div>`;

  try {
    const results = await analyzeDialogue(settings.geminiApiKey, text);
    items = results.map((r) => {
      const alreadySaved = phraseExists(r.phrase);
      const similars = alreadySaved ? [] : findSimilarPhrases(r.phrase);
      return {
        result: r,
        checked: !alreadySaved,
        alreadySaved,
        similarLabel: similars.length > 0
          ? `與「${similars[0].item.phrase}」${similars[0].reason}`
          : null,
      };
    });
    renderAnalyzeResults(output, container);
  } catch (err) {
    if (err instanceof ThrottleError) {
      showToast(err.message, 'warning');
      output.innerHTML = '';
    } else {
      output.innerHTML = `<div class="card" style="color:var(--danger)">分析失敗：${esc(String(err))}</div>`;
    }
  }
}

function renderAnalyzeResults(output: HTMLElement, container: HTMLElement): void {
  if (items.length === 0) {
    output.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🤔</div><div class="empty-state-text">未找到值得收藏的表達</div></div>`;
    return;
  }

  const checkedCount = items.filter((i) => i.checked && !i.alreadySaved).length;

  output.innerHTML = `
    <div class="analyze-toolbar">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:600">找到 <strong>${items.length}</strong> 個表達</span>
        <div style="display:flex;gap:6px">
          <button id="select-all-btn" class="btn btn-sm btn-secondary">全選</button>
          <button id="deselect-all-btn" class="btn btn-sm btn-secondary">取消全選</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:13px;color:var(--text-secondary)">熟悉度：</span>
          <select id="mastery-select" class="select" style="width:auto;font-size:13px">
            <option value="unfamiliar">🔴 不熟</option>
            <option value="okay">🟡 尚可</option>
            <option value="familiar">🟢 熟悉</option>
          </select>
        </div>
        <button id="save-selected-btn" class="btn btn-primary" ${checkedCount === 0 ? 'disabled' : ''}>
          💾 儲存已選（<span id="checked-count">${checkedCount}</span>）
        </button>
      </div>
    </div>

    <div class="analyze-cards" id="analyze-cards"></div>
  `;

  renderAnalyzeCards(output);
  bindAnalyzeResultEvents(output, container);
}

function renderAnalyzeCards(output: HTMLElement): void {
  const cardsContainer = output.querySelector<HTMLElement>('#analyze-cards')!;
  cardsContainer.innerHTML = '';

  const FORMALITY_LABEL: Record<string, string> = { formal: '正式', informal: '口語', neutral: '通用' };
  const TYPE_LABEL: Record<string, string> = {
    phrase: '片語', idiom: '慣用語', expression: '表達', sentence_pattern: '句型'
  };

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = `analyze-card${item.checked ? ' is-checked' : ''}${item.alreadySaved ? ' already-saved' : ''}${item.similarLabel ? ' has-similar' : ''}`;
    card.dataset.idx = String(idx);

    card.innerHTML = `
      <div class="analyze-card-check">
        <label class="analyze-checkbox-wrap">
          <input type="checkbox" class="analyze-checkbox" ${item.checked ? 'checked' : ''} ${item.alreadySaved ? 'disabled' : ''}>
        </label>
        ${item.alreadySaved ? `<span class="already-saved-badge">已收藏</span>` : ''}
        ${item.similarLabel && !item.alreadySaved ? `<span class="already-saved-badge" style="color:var(--warning);writing-mode:vertical-rl;transform:rotate(180deg)">相似</span>` : ''}
      </div>
      <div class="analyze-card-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
            <span style="font-size:16px;font-weight:700">${esc(item.result.phrase)}</span>
            <span class="phrase-type-badge">${TYPE_LABEL[item.result.type] ?? item.result.type}</span>
            <span class="phrase-formality-badge formality-${item.result.formalityLevel}">${FORMALITY_LABEL[item.result.formalityLevel] ?? item.result.formalityLevel}</span>
          </div>
          <button class="btn-icon speak-btn" style="width:28px;height:28px;font-size:15px;flex-shrink:0" data-text="${esc(item.result.phrase)}">🔊</button>
        </div>
        <div style="font-size:14px;color:var(--text-secondary);margin-bottom:6px">${esc(item.result.translation)}</div>
        ${item.similarLabel && !item.alreadySaved ? `
          <div style="font-size:12px;padding:4px 8px;background:var(--warning-light);color:var(--warning);border-radius:var(--radius-sm);margin-bottom:6px">
            ⚠️ ${esc(item.similarLabel)}
          </div>` : ''}
        ${item.result.usageNotes ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${esc(item.result.usageNotes)}</div>` : ''}
        ${item.result.alternativeExpressions.length ? `
          <div style="margin-top:6px">
            <span style="font-size:11px;color:var(--accent-text);font-weight:600">替換說法：</span>
            ${item.result.alternativeExpressions.slice(0, 3).map((a) => `
              <span style="font-size:12px;padding:2px 8px;background:var(--accent-light);color:var(--accent-text);border-radius:999px;margin:2px 2px 0 0;display:inline-block">${esc(a.expression)}</span>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    card.querySelector('.speak-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      speak((e.currentTarget as HTMLElement).dataset.text ?? '');
    });

    const checkbox = card.querySelector<HTMLInputElement>('.analyze-checkbox')!;
    checkbox.addEventListener('change', () => {
      items[idx].checked = checkbox.checked;
      card.classList.toggle('is-checked', checkbox.checked);
      updateCheckedCount(output);
    });

    cardsContainer.appendChild(card);
  });
}

function updateCheckedCount(output: HTMLElement): void {
  const count = items.filter((i) => i.checked && !i.alreadySaved).length;
  const el = output.querySelector<HTMLElement>('#checked-count');
  if (el) el.textContent = String(count);
  const btn = output.querySelector<HTMLButtonElement>('#save-selected-btn');
  if (btn) btn.disabled = count === 0;
}

function bindAnalyzeResultEvents(output: HTMLElement, _container: HTMLElement): void {
  output.querySelector('#select-all-btn')?.addEventListener('click', () => {
    items.forEach((item) => { if (!item.alreadySaved) item.checked = true; });
    renderAnalyzeCards(output);
    updateCheckedCount(output);
  });

  output.querySelector('#deselect-all-btn')?.addEventListener('click', () => {
    items.forEach((item) => { if (!item.alreadySaved) item.checked = false; });
    renderAnalyzeCards(output);
    updateCheckedCount(output);
  });

  output.querySelector('#mastery-select')?.addEventListener('change', (e) => {
    selectedMastery = (e.target as HTMLSelectElement).value as MasteryLevel;
  });

  output.querySelector('#save-selected-btn')?.addEventListener('click', async () => {
    const toSave = items.filter((i) => i.checked && !i.alreadySaved);
    if (toSave.length === 0) return;

    // Check for similar items in the selected batch
    const similarItems = toSave.filter((i) => i.similarLabel);
    if (similarItems.length > 0) {
      // Collect all similars for a single dialog
      const allSimilars = similarItems.flatMap((i) => findSimilarPhrases(i.result.phrase));
      const uniqueSimilars = allSimilars.filter(
        (s, idx, arr) => arr.findIndex((x) => x.item.id === s.item.id) === idx
      );
      const confirmed = await showSimilarPhraseDialog(
        similarItems.map((i) => i.result.phrase).join('、'),
        uniqueSimilars
      );
      if (!confirmed) return;
    }

    let savedCount = 0;
    toSave.forEach(({ result }) => {
      const item: ConversationItem = {
        id: `phrase_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        phrase: result.phrase,
        translation: result.translation,
        type: result.type,
        formalityLevel: result.formalityLevel,
        usageNotes: result.usageNotes,
        dialogueExample: result.dialogueExample,
        alternativeExpressions: result.alternativeExpressions,
        situationTags: [],
        tags: result.tags,
        isPinned: false,
        masteryLevel: selectedMastery,
        createdAt: Date.now(),
      };
      addPhraseItem(item);
      savedCount++;
      const i = items.find((x) => x.result.phrase === result.phrase);
      if (i) { i.alreadySaved = true; i.similarLabel = null; }
    });

    showToast(`已儲存 ${savedCount} 個表達`, 'success');
    renderAnalyzeCards(output);
    updateCheckedCount(output);
  });
}

// suppress unused import warning
void renderDialogue;
