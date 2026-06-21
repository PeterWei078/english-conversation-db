import type { GeminiSituationResult, SituationPack } from '../types/index';
import { searchSituation, ThrottleError } from '../services/ai';
import { loadSettings, addSituationPack, loadSituations, deleteSituationPack, updateSituationPack } from '../services/storage';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';
import { renderDialogue } from '../components/dialogueDisplay';

interface SituationCategory {
  icon: string;
  label: string;
  query: string;
}

const CATEGORIES: SituationCategory[] = [
  { icon: '✈️', label: '機場辦理',    query: '在機場辦理報到、過安檢、找登機門' },
  { icon: '🛫', label: '飛機上',       query: '在飛機上與空服員溝通，詢問餐點、設備、協助' },
  { icon: '🛂', label: '入境海關',     query: '入境海關申報與移民官員對話' },
  { icon: '🏨', label: '飯店住宿',     query: '飯店辦理入住退房、詢問設施、提出要求' },
  { icon: '🚕', label: '交通/計程車', query: '搭計程車、叫車、詢問路線、租車' },
  { icon: '🗺️', label: '觀光問路',     query: '觀光景點問路、請人拍照、買門票' },
  { icon: '🏪', label: '便利商店',     query: '在國外便利商店或超市購物結帳' },
  { icon: '💊', label: '藥局/醫療',   query: '在藥局購藥或小診所看診，說明症狀' },
  { icon: '☕', label: '咖啡廳',       query: '在咖啡廳點餐、客製化飲料、外帶' },
  { icon: '🍽️', label: '餐廳用餐',    query: '在餐廳訂位、點餐、提出特殊需求、結帳' },
  { icon: '🛍️', label: '購物',         query: '在服飾店或商店購物，詢問尺寸、退換貨' },
  { icon: '🤝', label: '初次見面',     query: '初次認識、自我介紹、打破沉默的閒聊' },
  { icon: '💬', label: '日常閒聊',     query: '日常閒聊、問候、談天氣與近況' },
  { icon: '🎉', label: '派對聚會',     query: '參加派對或聚會，社交寒暄、祝賀' },
  { icon: '💼', label: '職場溝通',     query: '職場日常溝通、開會發言、請假' },
  { icon: '📧', label: '電話/視訊',   query: '電話接聽、轉接、留言、視訊會議開場' },
  { icon: '🙏', label: '道歉/感謝',   query: '道歉、表達遺憾、感謝、接受感謝' },
  { icon: '🎁', label: '祝賀/邀請',   query: '生日祝賀、節日問候、活動邀請' },
];

// null = show all; cat.label = specific category
let currentFilter: string | null = null;
// category label to assign when saving a newly generated pack (always one of 18)
let generateCategory: string = CATEGORIES[0].label;
let currentResult: GeminiSituationResult | null = null;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderSituationPage(container: HTMLElement): void {
  currentResult = null;
  currentFilter = null;
  generateCategory = CATEGORIES[0].label;

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">英語情境學習</h1>
        <p class="page-subtitle">瀏覽已收藏的情境包，或生成新的學習內容</p>
      </div>

      <!-- Category filter grid -->
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:12px">情境分類篩選</div>
        <div id="all-filter-row" style="margin-bottom:10px"></div>
        <div class="situation-categories" id="category-grid"></div>
      </div>

      <!-- Packs list (main content) -->
      <div id="packs-section" style="margin-bottom:32px"></div>

      <!-- Generate new pack (secondary, always at bottom) -->
      <details id="generate-details" class="phrase-dialogue-details" style="border-top:none">
        <summary class="phrase-section-summary" style="font-size:14px;padding:10px 0">
          ＋ 生成新的情境學習包
        </summary>
        <div class="card" style="margin-top:12px">
          <div class="form-group">
            <label class="label">描述想要學習的情境</label>
            <div class="input-group">
              <input
                id="situation-input"
                class="input"
                type="text"
                placeholder="例如：在醫院急診、面試英文自我介紹、第一天上班…"
                autocomplete="off"
              />
              <div class="input-group-append">
                <button id="search-situation-btn" class="btn btn-primary">生成</button>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:13px;color:var(--text-secondary)">儲存至分類：</span>
            <select id="generate-category-select" class="select" style="width:auto;font-size:13px">
              ${CATEGORIES.map((c) => `<option value="${esc(c.label)}"${generateCategory === c.label ? ' selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </details>

      <!-- Generation result (shown after AI responds) -->
      <div id="situation-output" style="margin-top:16px"></div>
    </div>
  `;

  renderAllFilterChip(container);
  renderCategoryGrid(container);
  renderPacksList(container);
  bindGenerateEvents(container);
}

// ── Filter chips ──────────────────────────────────────────

function renderAllFilterChip(container: HTMLElement): void {
  const row = container.querySelector<HTMLElement>('#all-filter-row')!;
  row.innerHTML = '';

  const total = loadSituations().length;
  const allChip = document.createElement('button');
  allChip.className = `situation-category-btn${currentFilter === null ? ' active' : ''}`;
  allChip.style.cssText = 'display:inline-flex;width:auto;padding:8px 16px;min-width:unset';
  allChip.innerHTML = `<span>全部</span><span class="sit-count-badge">${total}</span>`;
  allChip.addEventListener('click', () => {
    currentFilter = null;
    refreshFilters(container);
    renderPacksList(container);
  });
  row.appendChild(allChip);
}

function renderCategoryGrid(container: HTMLElement): void {
  const grid = container.querySelector<HTMLElement>('#category-grid')!;
  grid.innerHTML = '';
  const packs = loadSituations();

  CATEGORIES.forEach((cat) => {
    const count = packs.filter((p) => p.category === cat.label).length;
    const btn = document.createElement('button');
    btn.className = `situation-category-btn${currentFilter === cat.label ? ' active' : ''}`;
    btn.dataset.label = cat.label;
    btn.innerHTML = `
      <span class="situation-category-icon">${cat.icon}</span>
      <span>${cat.label}</span>
      ${count > 0 ? `<span class="sit-count-badge">${count}</span>` : ''}
    `;
    btn.addEventListener('click', () => {
      currentFilter = cat.label;
      generateCategory = cat.label;
      // Sync generate section selects
      const input = container.querySelector<HTMLInputElement>('#situation-input');
      if (input && !input.value) input.value = cat.query;
      const sel = container.querySelector<HTMLSelectElement>('#generate-category-select');
      if (sel) sel.value = cat.label;
      refreshFilters(container);
      renderPacksList(container);
    });
    grid.appendChild(btn);
  });
}

function refreshFilters(container: HTMLElement): void {
  // Rebuild both filter rows to reflect new counts + active state
  renderAllFilterChip(container);
  renderCategoryGrid(container);
}

// ── Packs list ────────────────────────────────────────────

export const VALID_CATEGORIES = new Set(CATEGORIES.map((c) => c.label));

function renderPacksList(container: HTMLElement): void {
  const section = container.querySelector<HTMLElement>('#packs-section')!;
  const allPacks = loadSituations();
  const filtered = currentFilter === null
    ? allPacks
    : allPacks.filter((p) => p.category === currentFilter);

  const catMeta = currentFilter
    ? CATEGORIES.find((c) => c.label === currentFilter)
    : null;

  // Section header
  const filterLabel = currentFilter === null
    ? `全部情境包（${allPacks.length}）`
    : `${catMeta ? catMeta.icon + ' ' : ''}${currentFilter}（${filtered.length}）`;

  section.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:12px">${filterLabel}</div>
    <div id="packs-grid" style="display:flex;flex-direction:column;gap:12px"></div>
  `;

  const grid = section.querySelector<HTMLElement>('#packs-grid')!;

  if (filtered.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.innerHTML = `
      <div class="empty-state-icon">${catMeta ? catMeta.icon : '🗺️'}</div>
      <div class="empty-state-text">
        ${currentFilter ? `還沒有「${currentFilter}」的情境包` : '還沒有任何情境包'}
      </div>
      <div class="empty-state-hint">點擊下方「生成新的情境學習包」來新增</div>
      ${catMeta ? `
        <button class="btn btn-primary" id="quick-gen-btn" style="margin-top:16px">
          ✨ 立即生成「${catMeta.label}」情境包
        </button>
      ` : ''}
    `;
    grid.appendChild(emptyDiv);

    // Quick generate button
    emptyDiv.querySelector('#quick-gen-btn')?.addEventListener('click', () => {
      if (!catMeta) return;
      const details = container.querySelector<HTMLDetailsElement>('#generate-details')!;
      details.open = true;
      const input = container.querySelector<HTMLInputElement>('#situation-input')!;
      input.value = catMeta.query;
      generateCategory = catMeta.label;
      const sel = container.querySelector<HTMLSelectElement>('#generate-category-select')!;
      sel.value = catMeta.label;
      details.scrollIntoView({ behavior: 'smooth', block: 'start' });
      performGenerate(catMeta.query, container);
    });
    return;
  }

  filtered.forEach((pack) => {
    grid.appendChild(renderPackCard(pack, container));
  });
}

function mountCategoryPicker(
  wrap: HTMLElement,
  pack: SituationPack,
  container: HTMLElement
): void {
  const isValid = VALID_CATEGORIES.has(pack.category);
  const catMeta = CATEGORIES.find((c) => c.label === pack.category);

  const renderBtn = (currentCat: string) => {
    wrap.innerHTML = '';
    const meta = CATEGORIES.find((c) => c.label === currentCat);
    const btn = document.createElement('button');
    btn.className = `cat-picker-btn ${meta ? 'categorized' : 'uncategorized'}`;
    btn.innerHTML = meta
      ? `${meta.icon} ${meta.label} ▾`
      : `⚠️ 未分類 — 點選設定 ▾`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.cat-picker-popover').forEach((p) => p.remove());

      const pop = document.createElement('div');
      pop.className = 'cat-picker-popover';

      // Position relative to viewport (escapes any overflow:hidden parent)
      const rect = btn.getBoundingClientRect();
      const popWidth = 200;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;

      pop.style.cssText = `
        position: fixed;
        left: ${Math.min(rect.left, window.innerWidth - popWidth - 8)}px;
        ${openUpward
          ? `bottom: ${window.innerHeight - rect.top + 4}px;`
          : `top: ${rect.bottom + 4}px;`}
        width: ${popWidth}px;
        max-height: 280px;
        overflow-y: auto;
        z-index: 1000;
      `;

      CATEGORIES.forEach((cat) => {
        const opt = document.createElement('button');
        opt.className = `cat-picker-option${currentCat === cat.label ? ' selected' : ''}`;
        opt.innerHTML = `<span>${cat.icon}</span><span>${cat.label}</span>`;
        opt.addEventListener('click', (ev) => {
          ev.stopPropagation();
          updateSituationPack(pack.id, { category: cat.label });
          pack.category = cat.label;
          pop.remove();
          renderBtn(cat.label);
          refreshFilters(container);
          if (currentFilter !== null && currentFilter !== cat.label) {
            renderPacksList(container);
          }
        });
        pop.appendChild(opt);
      });

      document.body.appendChild(pop);

      const close = (ev: MouseEvent) => {
        if (!pop.contains(ev.target as Node) && ev.target !== btn) {
          pop.remove();
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    });

    wrap.appendChild(btn);
  };

  renderBtn(isValid ? pack.category : (catMeta?.label ?? ''));
}

function renderPackCard(pack: SituationPack, container: HTMLElement): HTMLElement {
  const card = document.createElement('div');
  card.className = 'situation-pack-card';

  const savedDate = new Date(pack.savedAt).toLocaleDateString('zh-TW');

  card.innerHTML = `
    <div class="situation-pack-header">
      <div style="flex:1;min-width:0">
        <div class="situation-pack-title">${esc(pack.situationName)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
          <div class="cat-picker-wrap" id="cat-wrap-${pack.id}"></div>
          <span style="font-size:12px;color:var(--text-muted)">${savedDate} · ${pack.keyPhrases.length} 個表達</span>
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="btn-icon delete-pack-btn" title="刪除" style="font-size:16px">🗑️</button>
      </div>
    </div>
    <div class="situation-pack-body" style="padding-top:8px">
      <p style="font-size:13px;color:var(--text-secondary);padding-bottom:10px">${esc(pack.situationDescription)}</p>
      <details class="phrase-dialogue-details">
        <summary class="phrase-section-summary">💬 情境對話（${pack.sampleDialogue.lines.length} 句）</summary>
        <div id="dlg-${pack.id}" style="margin-top:8px"></div>
      </details>
      <details class="phrase-alt-details" style="margin-top:4px">
        <summary class="phrase-section-summary">🔑 關鍵表達（${pack.keyPhrases.length} 個）</summary>
        <div class="situation-key-phrases" id="kp-${pack.id}" style="margin-top:8px"></div>
      </details>
    </div>
  `;

  // Mount category picker
  const catWrap = card.querySelector<HTMLElement>(`#cat-wrap-${pack.id}`)!;
  mountCategoryPicker(catWrap, pack, container);

  // Lazy render dialogue
  card.querySelector('details:first-of-type')?.addEventListener('toggle', () => {
    const el = card.querySelector<HTMLElement>(`#dlg-${pack.id}`)!;
    if (el.children.length === 0) el.appendChild(renderDialogue(pack.sampleDialogue));
  }, { once: true });

  // Lazy render key phrases
  card.querySelector('details:last-of-type')?.addEventListener('toggle', () => {
    const el = card.querySelector<HTMLElement>(`#kp-${pack.id}`)!;
    if (el.children.length > 0) return;
    pack.keyPhrases.forEach((phrase) => {
      const item = document.createElement('div');
      item.className = 'situation-phrase-item';
      item.style.marginBottom = '8px';
      item.innerHTML = `
        <div class="situation-phrase-en">
          ${esc(phrase.phrase)}
          <button class="btn-icon" style="width:20px;height:20px;font-size:12px;display:inline-flex;vertical-align:middle"
            data-text="${esc(phrase.phrase)}" title="朗讀">🔊</button>
        </div>
        <div class="situation-phrase-zh">${esc(phrase.translation)}</div>
        ${phrase.usage ? `<div class="situation-phrase-usage">${esc(phrase.usage)}</div>` : ''}
        ${phrase.alternatives.length ? `<div class="situation-phrase-alts">
          ${phrase.alternatives.map((a) => `<span class="situation-alt-chip" title="${esc(a.nuanceDifference)}">${esc(a.expression)}</span>`).join('')}
        </div>` : ''}
      `;
      item.querySelector('.btn-icon')?.addEventListener('click', (e) => {
        speak((e.currentTarget as HTMLElement).dataset.text ?? '');
      });
      el.appendChild(item);
    });
  }, { once: true });

  // Delete
  card.querySelector('.delete-pack-btn')?.addEventListener('click', () => {
    if (!confirm(`確定刪除「${pack.situationName}」情境包？`)) return;
    deleteSituationPack(pack.id);
    showToast(`已刪除「${pack.situationName}」`, 'info');
    refreshFilters(container);
    renderPacksList(container);
  });

  return card;
}

// ── Generate section ───────────────────────────────────────

function bindGenerateEvents(container: HTMLElement): void {
  const input = container.querySelector<HTMLInputElement>('#situation-input')!;
  const btn = container.querySelector<HTMLButtonElement>('#search-situation-btn')!;
  const sel = container.querySelector<HTMLSelectElement>('#generate-category-select')!;

  sel.addEventListener('change', () => {
    generateCategory = sel.value;
  });

  const trigger = () => {
    const q = input.value.trim();
    if (!q) { showToast('請輸入情境描述', 'warning'); return; }
    performGenerate(q, container);
  };

  btn.addEventListener('click', trigger);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') trigger(); });
}

async function performGenerate(query: string, container: HTMLElement): Promise<void> {
  const settings = loadSettings();
  if (!settings.geminiApiKey) {
    showToast('請先在設定中填入 Gemini API 金鑰', 'warning');
    return;
  }

  const output = container.querySelector<HTMLElement>('#situation-output')!;
  output.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><span>AI 生成情境學習包中，請稍候…</span></div>`;
  output.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const result = await searchSituation(settings.geminiApiKey, query);
    currentResult = result;
    renderGenerationResult(result, output, container);
  } catch (err) {
    if (err instanceof ThrottleError) {
      showToast(err.message, 'warning');
      output.innerHTML = '';
    } else {
      output.innerHTML = `<div class="card" style="color:var(--danger)">生成失敗：${esc(String(err))}</div>`;
    }
  }
}

function renderGenerationResult(
  result: GeminiSituationResult,
  output: HTMLElement,
  container: HTMLElement
): void {
  const catMeta = CATEGORIES.find((c) => c.label === generateCategory);
  const categoryDisplay = catMeta
    ? `${catMeta.icon} ${catMeta.label}`
    : `📁 ${generateCategory}`;

  output.innerHTML = `
    <div style="animation: fadeInUp 0.2s ease">
      <div class="situation-pack-card" style="margin-bottom:16px">
        <div class="situation-pack-header">
          <div>
            <div class="situation-pack-title">🗺️ ${esc(result.situationName)}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
              <span style="font-size:12px;padding:2px 10px;background:var(--accent-light);color:var(--accent-text);border-radius:999px;font-weight:600">
                ${categoryDisplay}
              </span>
              <span style="font-size:13px;color:var(--text-secondary)">${esc(result.situationDescription)}</span>
            </div>
          </div>
          <button id="save-pack-btn" class="btn btn-primary btn-sm" style="flex-shrink:0">
            💾 儲存到「${esc(generateCategory)}」
          </button>
        </div>
      </div>

      <div class="situation-pack-card" style="margin-bottom:16px">
        <div class="situation-pack-header">
          <span style="font-size:15px;font-weight:700">💬 情境對話範例</span>
        </div>
        <div class="situation-pack-body" style="padding-top:16px">
          <div id="sample-dialogue"></div>
        </div>
      </div>

      <div class="situation-pack-card">
        <div class="situation-pack-header">
          <span style="font-size:15px;font-weight:700">🔑 關鍵表達（${result.keyPhrases.length} 個）</span>
        </div>
        <div class="situation-pack-body" style="padding-top:16px">
          <div class="situation-key-phrases" id="key-phrases-list"></div>
        </div>
      </div>
    </div>
  `;

  output.querySelector<HTMLElement>('#sample-dialogue')!
    .appendChild(renderDialogue(result.sampleDialogue));

  const phrasesList = output.querySelector<HTMLElement>('#key-phrases-list')!;
  result.keyPhrases.forEach((phrase) => {
    const item = document.createElement('div');
    item.className = 'situation-phrase-item';
    item.innerHTML = `
      <div class="situation-phrase-en">
        ${esc(phrase.phrase)}
        <button class="btn-icon speak-btn" style="width:22px;height:22px;font-size:13px;display:inline-flex;vertical-align:middle"
          data-text="${esc(phrase.phrase)}" title="朗讀">🔊</button>
      </div>
      <div class="situation-phrase-zh">${esc(phrase.translation)}</div>
      ${phrase.usage ? `<div class="situation-phrase-usage">${esc(phrase.usage)}</div>` : ''}
      ${phrase.alternatives.length ? `
        <div style="margin-top:6px">
          <span style="font-size:11px;color:var(--text-muted)">替換說法：</span>
          <div class="situation-phrase-alts">
            ${phrase.alternatives.map((a) => `<span class="situation-alt-chip" data-text="${esc(a.expression)}" title="${esc(a.nuanceDifference)}">${esc(a.expression)}</span>`).join('')}
          </div>
        </div>` : ''}
    `;
    item.querySelector('.speak-btn')?.addEventListener('click', (e) => {
      speak((e.currentTarget as HTMLElement).dataset.text ?? '');
    });
    item.querySelectorAll('.situation-alt-chip').forEach((chip) => {
      chip.addEventListener('click', () => speak((chip as HTMLElement).dataset.text ?? ''));
    });
    phrasesList.appendChild(item);
  });

  // Save button
  output.querySelector('#save-pack-btn')?.addEventListener('click', () => {
    if (!currentResult) return;
    const alreadySaved = loadSituations().some(
      (s) => s.situationName === currentResult!.situationName
    );
    if (alreadySaved) {
      showToast('此情境包已在收藏庫中', 'info');
      return;
    }
    const pack: SituationPack = {
      id: `sit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      situationName: currentResult.situationName,
      situationDescription: currentResult.situationDescription,
      category: generateCategory,
      sampleDialogue: currentResult.sampleDialogue,
      keyPhrases: currentResult.keyPhrases,
      savedAt: Date.now(),
      tags: currentResult.tags,
    };
    addSituationPack(pack);
    showToast(`已儲存情境包到「${generateCategory}」`, 'success');
    const saveBtn = output.querySelector<HTMLButtonElement>('#save-pack-btn')!;
    saveBtn.textContent = '✅ 已儲存';
    saveBtn.disabled = true;
    // Refresh the packs list above
    refreshFilters(container);
    // If currently filtered to the saved category, also refresh the list
    if (currentFilter === generateCategory || currentFilter === null) {
      renderPacksList(container);
    }
  });
}
