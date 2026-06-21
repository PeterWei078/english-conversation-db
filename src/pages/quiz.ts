import type { ConversationItem, MasteryLevel } from '../types/index';
import { loadPhrases, updatePhraseItem } from '../services/storage';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';
import { renderDialogue } from '../components/dialogueDisplay';

interface FlashcardResult {
  id: string;
  masteryLevel: MasteryLevel;
}

let sessionItems: ConversationItem[] = [];
let sessionResults: FlashcardResult[] = [];
let currentIndex = 0;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderQuizPage(container: HTMLElement): void {
  sessionItems = [];
  sessionResults = [];
  currentIndex = 0;

  const allPhrases = loadPhrases();

  if (allPhrases.length === 0) {
    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1 class="page-title">閃卡測驗</h1>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">🃏</div>
          <div class="empty-state-text">收藏庫還沒有任何表達</div>
          <div class="empty-state-hint">先從「查詢」或「情境」頁面儲存一些表達，再來測驗！</div>
        </div>
      </div>
    `;
    return;
  }

  renderQuizSetup(container, allPhrases);
}

function renderQuizSetup(container: HTMLElement, allPhrases: ConversationItem[]): void {
  const allSituationTags = Array.from(new Set(allPhrases.flatMap((p) => p.situationTags)));
  const allTags = Array.from(new Set(allPhrases.flatMap((p) => p.tags)));

  const counts = {
    total: allPhrases.length,
    unfamiliar: allPhrases.filter((p) => p.masteryLevel === 'unfamiliar').length,
    okay: allPhrases.filter((p) => p.masteryLevel === 'okay').length,
    familiar: allPhrases.filter((p) => p.masteryLevel === 'familiar').length,
  };

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">閃卡測驗</h1>
        <p class="page-subtitle">選擇範圍與題數，開始 Flashcard 練習</p>
      </div>

      <div class="quiz-setup">
        <!-- Stats -->
        <div class="stats-bar" style="margin-bottom:20px">
          <span class="stat-chip total">📚 共 ${counts.total}</span>
          <span class="stat-chip unfamiliar">🔴 不熟 ${counts.unfamiliar}</span>
          <span class="stat-chip okay">🟡 尚可 ${counts.okay}</span>
          <span class="stat-chip familiar">🟢 熟悉 ${counts.familiar}</span>
        </div>

        <div class="card">
          <!-- Mastery scope -->
          <div class="form-group">
            <label class="label">熟悉度範圍</label>
            <div style="display:flex;flex-direction:column;gap:8px" id="mastery-scope">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                <input type="checkbox" value="unfamiliar" checked> 🔴 不熟（${counts.unfamiliar} 個）
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                <input type="checkbox" value="okay" checked> 🟡 尚可（${counts.okay} 個）
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
                <input type="checkbox" value="familiar"> 🟢 熟悉（${counts.familiar} 個）
              </label>
            </div>
          </div>

          <!-- Situation filter -->
          ${allSituationTags.length ? `
          <div class="form-group">
            <label class="label">情境主題（可多選）</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px" id="situation-filter-chips">
              <span class="tag sit-chip active-chip" data-sit="" style="cursor:pointer;background:var(--accent-light);color:var(--accent-text);border-color:var(--accent)">全部情境</span>
              ${allSituationTags.map((t) => `<span class="tag sit-chip" data-sit="${esc(t)}" style="cursor:pointer">${esc(t)}</span>`).join('')}
            </div>
          </div>
          ` : ''}

          <!-- Tag filter -->
          ${allTags.length ? `
          <div class="form-group">
            <label class="label">主題標籤（可多選）</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px" id="tag-filter-chips">
              <span class="tag tag-chip active-chip" data-tag="" style="cursor:pointer;background:var(--accent-light);color:var(--accent-text);border-color:var(--accent)">全部標籤</span>
              ${allTags.map((t) => `<span class="tag tag-chip" data-tag="${esc(t)}" style="cursor:pointer">${esc(t)}</span>`).join('')}
            </div>
          </div>
          ` : ''}

          <!-- Count -->
          <div class="form-group">
            <label class="label">出題數量</label>
            <select id="quiz-count" class="select">
              <option value="10">10 題</option>
              <option value="20" selected>20 題</option>
              <option value="30">30 題</option>
              <option value="999">全部</option>
            </select>
          </div>

          <!-- Preview count -->
          <div id="preview-count" style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
            符合條件：計算中…
          </div>

          <button id="start-quiz-btn" class="btn btn-primary btn-full btn-lg">🃏 開始測驗</button>
        </div>
      </div>
    </div>
  `;

  bindSetupEvents(container, allPhrases);
  updatePreviewCount(container, allPhrases);
}

let selectedSituations: Set<string> = new Set();
let selectedTags: Set<string> = new Set();
let selectedMasteryLevels: Set<MasteryLevel> = new Set(['unfamiliar', 'okay']);

function bindSetupEvents(container: HTMLElement, allPhrases: ConversationItem[]): void {
  selectedSituations = new Set();
  selectedTags = new Set();
  selectedMasteryLevels = new Set(['unfamiliar', 'okay']);

  // Mastery checkboxes
  container.querySelectorAll('#mastery-scope input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const input = cb as HTMLInputElement;
      if (input.checked) {
        selectedMasteryLevels.add(input.value as MasteryLevel);
      } else {
        selectedMasteryLevels.delete(input.value as MasteryLevel);
      }
      updatePreviewCount(container, allPhrases);
    });
  });

  // Situation chips (single select, empty = all)
  container.querySelectorAll('.sit-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const sit = (chip as HTMLElement).dataset.sit ?? '';
      if (sit === '') {
        selectedSituations.clear();
      } else {
        if (selectedSituations.has(sit)) {
          selectedSituations.delete(sit);
        } else {
          selectedSituations.add(sit);
        }
      }
      container.querySelectorAll('.sit-chip').forEach((c) => {
        const s = (c as HTMLElement).dataset.sit ?? '';
        const isActive = s === '' ? selectedSituations.size === 0 : selectedSituations.has(s);
        (c as HTMLElement).style.background = isActive ? 'var(--accent-light)' : '';
        (c as HTMLElement).style.color = isActive ? 'var(--accent-text)' : '';
        (c as HTMLElement).style.borderColor = isActive ? 'var(--accent)' : '';
      });
      updatePreviewCount(container, allPhrases);
    });
  });

  // Tag chips (single select, empty = all)
  container.querySelectorAll('.tag-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = (chip as HTMLElement).dataset.tag ?? '';
      if (tag === '') {
        selectedTags.clear();
      } else {
        if (selectedTags.has(tag)) {
          selectedTags.delete(tag);
        } else {
          selectedTags.add(tag);
        }
      }
      container.querySelectorAll('.tag-chip').forEach((c) => {
        const t = (c as HTMLElement).dataset.tag ?? '';
        const isActive = t === '' ? selectedTags.size === 0 : selectedTags.has(t);
        (c as HTMLElement).style.background = isActive ? 'var(--accent-light)' : '';
        (c as HTMLElement).style.color = isActive ? 'var(--accent-text)' : '';
        (c as HTMLElement).style.borderColor = isActive ? 'var(--accent)' : '';
      });
      updatePreviewCount(container, allPhrases);
    });
  });

  container.querySelector('#quiz-count')?.addEventListener('change', () => {
    updatePreviewCount(container, allPhrases);
  });

  container.querySelector('#start-quiz-btn')?.addEventListener('click', () => {
    const filtered = getFilteredPhrases(allPhrases);
    if (filtered.length === 0) {
      showToast('沒有符合條件的表達', 'warning');
      return;
    }
    const countEl = container.querySelector<HTMLSelectElement>('#quiz-count')!;
    const count = parseInt(countEl.value, 10);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    sessionItems = shuffled.slice(0, count);
    sessionResults = [];
    currentIndex = 0;
    renderFlashcard(container);
  });
}

function getFilteredPhrases(allPhrases: ConversationItem[]): ConversationItem[] {
  return allPhrases.filter((p) => {
    if (!selectedMasteryLevels.has(p.masteryLevel)) return false;
    if (selectedSituations.size > 0 && !p.situationTags.some((t) => selectedSituations.has(t))) return false;
    if (selectedTags.size > 0 && !p.tags.some((t) => selectedTags.has(t))) return false;
    return true;
  });
}

function updatePreviewCount(container: HTMLElement, allPhrases: ConversationItem[]): void {
  const filtered = getFilteredPhrases(allPhrases);
  const countEl = container.querySelector<HTMLSelectElement>('#quiz-count');
  const count = countEl ? parseInt(countEl.value, 10) : 20;
  const actual = Math.min(filtered.length, count);
  const preview = container.querySelector<HTMLElement>('#preview-count');
  if (preview) {
    preview.textContent = `符合條件：${filtered.length} 個，將出 ${actual} 題`;
  }
}

// ── Flashcard Session ─────────────────────────────────────
function renderFlashcard(container: HTMLElement): void {
  const item = sessionItems[currentIndex];
  const progress = (currentIndex / sessionItems.length) * 100;

  container.innerHTML = `
    <div class="page">
      <!-- Progress -->
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-muted);margin-bottom:6px">
          <span>${currentIndex + 1} / ${sessionItems.length}</span>
          <span>已答 ${sessionResults.length}</span>
        </div>
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${progress}%"></div>
        </div>
      </div>

      <div class="flashcard-area">
        <div class="flashcard" id="flashcard">
          <!-- Front -->
          <div class="flashcard-front" id="flashcard-front">
            <div class="flashcard-counter" style="text-align:center;font-size:12px;color:var(--text-muted)">#${currentIndex + 1}</div>
            <div class="flashcard-phrase-en">${esc(item.phrase)}</div>
            <div class="flashcard-badge-row">
              <span class="phrase-type-badge">${item.type.replace('_', ' ')}</span>
              <span class="phrase-formality-badge formality-${item.formalityLevel}">${item.formalityLevel === 'formal' ? '正式' : item.formalityLevel === 'informal' ? '口語' : '通用'}</span>
            </div>
            <div style="text-align:center;margin-top:12px">
              <button id="speak-front-btn" class="btn btn-secondary">🔊 朗讀</button>
            </div>
            <div class="flashcard-reveal-hint">
              ⬇️ 點擊「翻面查看答案」後，選擇熟悉程度
            </div>
            <div style="margin-top:24px;text-align:center">
              <button id="reveal-btn" class="btn btn-primary btn-lg">翻面查看答案</button>
            </div>
          </div>
        </div>

        <div id="flashcard-back-area" style="display:none"></div>
      </div>
    </div>
  `;

  container.querySelector('#speak-front-btn')?.addEventListener('click', () => speak(item.phrase));

  container.querySelector('#reveal-btn')?.addEventListener('click', () => {
    revealFlashcard(container, item);
  });
}

function revealFlashcard(container: HTMLElement, item: ConversationItem): void {
  const frontCard = container.querySelector<HTMLElement>('#flashcard-front')!;
  frontCard.style.opacity = '0.4';

  const backArea = container.querySelector<HTMLElement>('#flashcard-back-area')!;
  backArea.style.display = 'block';

  const FORMALITY_LABEL: Record<string, string> = { formal: '正式', informal: '口語', neutral: '通用' };

  backArea.innerHTML = `
    <div class="flashcard" style="margin-top:12px;border-color:var(--accent)">
      <div class="flashcard-back">
        <div class="flashcard-translation">${esc(item.translation)}</div>

        ${item.usageNotes ? `<div class="flashcard-usage">${esc(item.usageNotes)}</div>` : ''}

        <div class="flashcard-divider"></div>

        <!-- Alternatives -->
        ${item.alternativeExpressions.length ? `
          <div style="margin-bottom:12px">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">🔄 替換說法</div>
            <div class="flashcard-alts">
              ${item.alternativeExpressions.map((a) => `
                <span class="flashcard-alt-chip" data-text="${esc(a.expression)}" title="${esc(a.nuanceDifference)}">
                  ${esc(a.expression)}
                  <span style="font-size:10px;opacity:0.7">(${FORMALITY_LABEL[a.formalityLevel] ?? a.formalityLevel})</span>
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Dialogue (collapsed) -->
        ${item.dialogueExample.lines.length > 0 ? `
          <details style="margin-bottom:12px">
            <summary class="phrase-section-summary">💬 情境對話</summary>
            <div id="flashcard-dialogue" style="margin-top:8px"></div>
          </details>
        ` : ''}

        <div class="flashcard-divider"></div>

        <!-- Mastery buttons -->
        <div style="font-size:13px;font-weight:600;text-align:center;margin-bottom:12px">這個表達你熟悉嗎？</div>
        <div class="flashcard-mastery-row">
          <button class="mastery-vote-btn unfamiliar" data-mastery="unfamiliar">🔴<br>不熟</button>
          <button class="mastery-vote-btn okay" data-mastery="okay">🟡<br>尚可</button>
          <button class="mastery-vote-btn familiar" data-mastery="familiar">🟢<br>熟悉</button>
        </div>
      </div>
    </div>
  `;

  // Render dialogue lazily
  const dialogueDetails = backArea.querySelector('details');
  dialogueDetails?.addEventListener('toggle', () => {
    const el = backArea.querySelector<HTMLElement>('#flashcard-dialogue')!;
    if (el && el.children.length === 0) {
      el.appendChild(renderDialogue(item.dialogueExample));
    }
  }, { once: true });

  // Alt speak
  backArea.querySelectorAll('.flashcard-alt-chip').forEach((chip) => {
    chip.addEventListener('click', () => speak((chip as HTMLElement).dataset.text ?? ''));
  });

  // Mastery buttons
  backArea.querySelectorAll('.mastery-vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mastery = (btn as HTMLElement).dataset.mastery as MasteryLevel;
      updatePhraseItem(item.id, { masteryLevel: mastery });
      sessionResults.push({ id: item.id, masteryLevel: mastery });

      currentIndex++;
      if (currentIndex >= sessionItems.length) {
        renderQuizResult(container);
      } else {
        renderFlashcard(container);
      }
    });
  });
}

// ── Quiz Result ────────────────────────────────────────────
function renderQuizResult(container: HTMLElement): void {
  const familiar   = sessionResults.filter((r) => r.masteryLevel === 'familiar').length;
  const okay       = sessionResults.filter((r) => r.masteryLevel === 'okay').length;
  const unfamiliar = sessionResults.filter((r) => r.masteryLevel === 'unfamiliar').length;
  const total      = sessionResults.length;
  const score      = total > 0 ? Math.round((familiar / total) * 100) : 0;

  const scoreColor = score >= 80 ? 'var(--mastery-familiar)' : score >= 50 ? 'var(--mastery-okay)' : 'var(--mastery-unfamiliar)';
  const scoreEmoji = score >= 80 ? '🎉' : score >= 50 ? '💪' : '📖';

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">測驗結果</h1>
      </div>
      <div class="flashcard-area">
        <div class="quiz-result-card">
          <div style="font-size:32px;margin-bottom:8px">${scoreEmoji}</div>
          <div class="quiz-score-circle" style="border-color:${scoreColor}">
            <div class="quiz-score-number" style="color:${scoreColor}">${score}%</div>
            <div class="quiz-score-label">熟悉度</div>
          </div>

          <div style="font-size:15px;font-weight:600;margin-bottom:4px">
            ${score >= 80 ? '太棒了！繼續保持！' : score >= 50 ? '不錯，繼續加油！' : '還需要多練習，加油！'}
          </div>
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">共完成 ${total} 題</div>

          <div class="quiz-result-breakdown">
            <div class="quiz-result-stat">
              <div class="quiz-result-stat-num" style="color:var(--mastery-familiar)">${familiar}</div>
              <div class="quiz-result-stat-label">🟢 熟悉</div>
            </div>
            <div class="quiz-result-stat">
              <div class="quiz-result-stat-num" style="color:var(--mastery-okay)">${okay}</div>
              <div class="quiz-result-stat-label">🟡 尚可</div>
            </div>
            <div class="quiz-result-stat">
              <div class="quiz-result-stat-num" style="color:var(--mastery-unfamiliar)">${unfamiliar}</div>
              <div class="quiz-result-stat-label">🔴 不熟</div>
            </div>
          </div>

          <div style="display:flex;gap:10px;justify-content:center;margin-top:8px;flex-wrap:wrap">
            <button id="retry-btn" class="btn btn-primary">🔄 重新設定</button>
            <button id="retry-unfamiliar-btn" class="btn btn-secondary" ${unfamiliar === 0 ? 'disabled' : ''}>
              🔴 只練不熟的（${unfamiliar} 題）
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#retry-btn')?.addEventListener('click', () => {
    renderQuizPage(container);
  });

  container.querySelector('#retry-unfamiliar-btn')?.addEventListener('click', () => {
    const unfamiliarIds = new Set(
      sessionResults.filter((r) => r.masteryLevel === 'unfamiliar').map((r) => r.id)
    );
    const allPhrases = loadPhrases();
    sessionItems = allPhrases.filter((p) => unfamiliarIds.has(p.id)).sort(() => Math.random() - 0.5);
    sessionResults = [];
    currentIndex = 0;
    if (sessionItems.length === 0) {
      showToast('沒有不熟的題目', 'info');
      return;
    }
    renderFlashcard(container);
  });
}
