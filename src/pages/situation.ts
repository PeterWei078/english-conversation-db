import type { GeminiSituationResult, SituationPack, SituationCategory } from '../types/index';
import { searchSituation, ThrottleError } from '../services/ai';
import {
  loadSettings,
  addSituationPack,
  loadSituations,
  deleteSituationPack,
  updateSituationPack,
  loadSituationCategories,
  addSituationCategory,
  deleteSituationCategory,
} from '../services/storage';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';
import { renderDialogue } from '../components/dialogueDisplay';

// User-editable list of categories (persisted in localStorage, seeded with defaults)
let categories: SituationCategory[] = [];
// null = show all; cat.label = specific category
let currentFilter: string | null = null;
// category label to assign when saving a newly generated pack
let generateCategory: string = '';
// whether the category grid shows delete affordances / the add-category form
let categoryEditMode = false;
let currentResult: GeminiSituationResult | null = null;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderSituationPage(container: HTMLElement): void {
  currentResult = null;
  currentFilter = null;
  categoryEditMode = false;
  categories = loadSituationCategories();
  generateCategory = categories[0]?.label ?? '';

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">英語情境學習</h1>
        <p class="page-subtitle">瀏覽已收藏的情境包，或生成新的學習內容</p>
      </div>

      <!-- Category filter grid -->
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-size:13px;font-weight:600;color:var(--text-secondary)">情境分類篩選</div>
          <button id="category-edit-toggle" class="btn-icon" style="font-size:12px;width:auto;padding:4px 10px;color:var(--text-secondary)">⚙️ 管理分類</button>
        </div>
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
              ${categories.map((c) => `<option value="${esc(c.label)}"${generateCategory === c.label ? ' selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
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

  container.querySelector('#category-edit-toggle')?.addEventListener('click', () => {
    categoryEditMode = !categoryEditMode;
    renderCategoryGrid(container);
  });
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
  const toggle = container.querySelector<HTMLElement>('#category-edit-toggle');
  if (toggle) {
    toggle.textContent = categoryEditMode ? '✓ 完成' : '⚙️ 管理分類';
    toggle.classList.toggle('active-toggle', categoryEditMode);
  }

  const grid = container.querySelector<HTMLElement>('#category-grid')!;
  grid.innerHTML = '';
  const packs = loadSituations();

  categories.forEach((cat) => {
    const count = packs.filter((p) => p.category === cat.label).length;
    const btn = document.createElement('button');
    btn.className = `situation-category-btn${currentFilter === cat.label ? ' active' : ''}`;
    btn.dataset.label = cat.label;
    btn.innerHTML = `
      ${categoryEditMode ? `<span class="situation-category-delete" title="刪除分類">✕</span>` : ''}
      <span class="situation-category-icon">${cat.icon}</span>
      <span>${cat.label}</span>
      ${count > 0 ? `<span class="sit-count-badge">${count}</span>` : ''}
    `;

    if (categoryEditMode) {
      btn.querySelector('.situation-category-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const msg = count > 0
          ? `「${cat.label}」下還有 ${count} 個情境包，刪除分類後這些包會變成未分類。確定刪除？`
          : `確定刪除分類「${cat.label}」？`;
        if (!confirm(msg)) return;
        deleteSituationCategory(cat.label);
        categories = loadSituationCategories();
        if (currentFilter === cat.label) currentFilter = null;
        if (generateCategory === cat.label) generateCategory = categories[0]?.label ?? '';
        refreshFilters(container);
        renderPacksList(container);
        syncGenerateCategorySelect(container);
      });
    } else {
      btn.addEventListener('click', () => {
        currentFilter = cat.label;
        generateCategory = cat.label;
        // Sync generate section selects
        const input = container.querySelector<HTMLInputElement>('#situation-input');
        if (input && !input.value) input.value = cat.query;
        syncGenerateCategorySelect(container);
        refreshFilters(container);
        renderPacksList(container);
      });
    }
    grid.appendChild(btn);
  });

  if (categoryEditMode) {
    const addBtn = document.createElement('button');
    addBtn.className = 'situation-category-btn situation-category-add';
    addBtn.innerHTML = `<span class="situation-category-icon">＋</span><span>新增分類</span>`;
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddCategoryForm(addBtn, container);
    });
    grid.appendChild(addBtn);
  }
}

function syncGenerateCategorySelect(container: HTMLElement): void {
  const sel = container.querySelector<HTMLSelectElement>('#generate-category-select');
  if (!sel) return;
  sel.innerHTML = categories.map((c) =>
    `<option value="${esc(c.label)}"${generateCategory === c.label ? ' selected' : ''}>${c.icon} ${c.label}</option>`
  ).join('');
}

function openAddCategoryForm(anchor: HTMLElement, container: HTMLElement): void {
  document.querySelectorAll('.cat-picker-popover').forEach((p) => p.remove());

  const pop = document.createElement('div');
  pop.className = 'cat-picker-popover category-add-popover';

  const rect = anchor.getBoundingClientRect();
  const popWidth = 220;
  pop.style.cssText = `
    position: fixed;
    left: ${Math.min(rect.left, window.innerWidth - popWidth - 8)}px;
    top: ${rect.bottom + 4}px;
    width: ${popWidth}px;
    z-index: 1000;
  `;

  pop.innerHTML = `
    <input id="new-cat-icon" class="input" style="font-size:13px;padding:6px 8px" type="text" maxlength="4" placeholder="圖示 (例如 🏥)" autocomplete="off" />
    <input id="new-cat-label" class="input" style="font-size:13px;padding:6px 8px;margin-top:6px" type="text" maxlength="12" placeholder="分類名稱" autocomplete="off" />
    <div style="display:flex;gap:6px;margin-top:8px">
      <button id="new-cat-save" class="btn btn-primary btn-sm" style="flex:1">新增</button>
      <button id="new-cat-cancel" class="btn btn-secondary btn-sm" style="flex:1">取消</button>
    </div>
  `;

  document.body.appendChild(pop);
  pop.querySelector<HTMLInputElement>('#new-cat-label')?.focus();

  const close = () => pop.remove();

  const submit = () => {
    const icon = pop.querySelector<HTMLInputElement>('#new-cat-icon')!.value.trim() || '📁';
    const label = pop.querySelector<HTMLInputElement>('#new-cat-label')!.value.trim();
    if (!label) {
      showToast('請輸入分類名稱', 'warning');
      return;
    }
    const ok = addSituationCategory({ icon, label, query: '' });
    if (!ok) {
      showToast('已有相同名稱的分類', 'warning');
      return;
    }
    categories = loadSituationCategories();
    close();
    refreshFilters(container);
    syncGenerateCategorySelect(container);
    showToast(`已新增分類「${label}」`, 'success');
  };

  pop.querySelector('#new-cat-cancel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  pop.querySelector('#new-cat-save')?.addEventListener('click', (e) => {
    e.stopPropagation();
    submit();
  });

  pop.querySelectorAll('input').forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') submit();
    });
  });

  pop.addEventListener('click', (e) => e.stopPropagation());

  const outsideClick = (ev: MouseEvent) => {
    if (!pop.contains(ev.target as Node) && ev.target !== anchor) {
      close();
      document.removeEventListener('click', outsideClick);
    }
  };
  setTimeout(() => document.addEventListener('click', outsideClick), 0);
}

function refreshFilters(container: HTMLElement): void {
  // Rebuild both filter rows to reflect new counts + active state
  renderAllFilterChip(container);
  renderCategoryGrid(container);
}

// ── Packs list ────────────────────────────────────────────

function isValidCategory(label: string): boolean {
  return categories.some((c) => c.label === label);
}

function renderPacksList(container: HTMLElement): void {
  const section = container.querySelector<HTMLElement>('#packs-section')!;
  const allPacks = loadSituations();
  const filtered = currentFilter === null
    ? allPacks
    : allPacks.filter((p) => p.category === currentFilter);

  const catMeta = currentFilter
    ? categories.find((c) => c.label === currentFilter)
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
      if (catMeta.query) {
        performGenerate(catMeta.query, container);
      } else {
        input.focus();
      }
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
  const isValid = isValidCategory(pack.category);
  const catMeta = categories.find((c) => c.label === pack.category);

  const renderBtn = (currentCat: string) => {
    wrap.innerHTML = '';
    const meta = categories.find((c) => c.label === currentCat);
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

      categories.forEach((cat) => {
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
      ${pack.vocabulary && pack.vocabulary.length > 0 ? `
      <details class="phrase-alt-details" style="margin-top:4px">
        <summary class="phrase-section-summary">📚 重要字彙整理（${pack.vocabulary.length} 個）</summary>
        <div id="vocab-${pack.id}" style="margin-top:8px"></div>
      </details>` : ''}
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
  card.querySelector<HTMLElement>(`#kp-${pack.id}`)?.closest('details')
    ?.addEventListener('toggle', () => {
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

  // Lazy render vocabulary
  if (pack.vocabulary && pack.vocabulary.length > 0) {
    card.querySelector<HTMLElement>(`#vocab-${pack.id}`)?.closest('details')
      ?.addEventListener('toggle', () => {
      const el = card.querySelector<HTMLElement>(`#vocab-${pack.id}`)!;
      if (el.children.length > 0) return;
      pack.vocabulary!.forEach((item, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color)';
        if (i === pack.vocabulary!.length - 1) row.style.borderBottom = 'none';
        row.innerHTML = `
          <div style="min-width:26px;height:26px;border-radius:50%;background:var(--accent-light);color:var(--accent-text);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px">${i + 1}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:700;color:var(--text-primary)">
                ${esc(item.word)}
                <button class="btn-icon speak-vocab-btn" style="width:20px;height:20px;font-size:12px;display:inline-flex;vertical-align:middle"
                  data-text="${esc(item.word)}" title="朗讀">🔊</button>
              </span>
              <span style="font-size:11px;color:var(--text-muted);background:var(--bg-secondary);padding:1px 7px;border-radius:999px">${esc(item.partOfSpeech)}</span>
              <span style="font-size:13px;color:var(--accent-text);font-weight:600">${esc(item.translation)}</span>
            </div>
            <div style="margin-top:4px;font-size:13px;color:var(--text-secondary);font-style:italic">${esc(item.example)}</div>
            <div style="font-size:12px;color:var(--text-muted)">${esc(item.exampleTranslation)}</div>
          </div>
        `;
        row.querySelector('.speak-vocab-btn')?.addEventListener('click', (e) => {
          speak((e.currentTarget as HTMLElement).dataset.text ?? '');
        });
        el.appendChild(row);
      });
    }, { once: true });
  }

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
  const catMeta = categories.find((c) => c.label === generateCategory);
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

      <div class="situation-pack-card" style="margin-bottom:16px">
        <div class="situation-pack-header">
          <span style="font-size:15px;font-weight:700">🔑 關鍵表達（${result.keyPhrases.length} 個）</span>
        </div>
        <div class="situation-pack-body" style="padding-top:16px">
          <div class="situation-key-phrases" id="key-phrases-list"></div>
        </div>
      </div>

      <div class="situation-pack-card">
        <div class="situation-pack-header">
          <span style="font-size:15px;font-weight:700">📚 重要字彙整理（${result.vocabulary.length} 個）</span>
        </div>
        <div class="situation-pack-body" style="padding-top:16px">
          <div id="vocabulary-list"></div>
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

  const vocabList = output.querySelector<HTMLElement>('#vocabulary-list')!;
  result.vocabulary.forEach((item, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color)';
    if (i === result.vocabulary.length - 1) row.style.borderBottom = 'none';
    row.innerHTML = `
      <div style="min-width:26px;height:26px;border-radius:50%;background:var(--accent-light);color:var(--accent-text);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px">${i + 1}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:700;color:var(--text-primary)">
            ${esc(item.word)}
            <button class="btn-icon speak-vocab-btn" style="width:20px;height:20px;font-size:12px;display:inline-flex;vertical-align:middle"
              data-text="${esc(item.word)}" title="朗讀">🔊</button>
          </span>
          <span style="font-size:11px;color:var(--text-muted);background:var(--bg-secondary);padding:1px 7px;border-radius:999px">${esc(item.partOfSpeech)}</span>
          <span style="font-size:13px;color:var(--accent-text);font-weight:600">${esc(item.translation)}</span>
        </div>
        <div style="margin-top:4px;font-size:13px;color:var(--text-secondary);font-style:italic">${esc(item.example)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${esc(item.exampleTranslation)}</div>
      </div>
    `;
    row.querySelector('.speak-vocab-btn')?.addEventListener('click', (e) => {
      speak((e.currentTarget as HTMLElement).dataset.text ?? '');
    });
    vocabList.appendChild(row);
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
      vocabulary: currentResult.vocabulary,
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
