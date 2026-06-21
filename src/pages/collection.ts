import type { ConversationItem, SituationPack, SortMode, CollectionTab } from '../types/index';
import {
  loadPhrases,
  loadSituations,
  deleteSituationPack,
} from '../services/storage';
import { renderPhraseCard } from '../components/phraseCard';
import { renderDialogue } from '../components/dialogueDisplay';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';
import { TAG_GROUPS, ALL_PREDEFINED_TAGS } from '../constants/tags';

let currentTab: CollectionTab = 'phrases';
let currentSort: SortMode = 'newest';
let currentSituationFilter = '';
let currentTagFilter = '';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderCollectionPage(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">我的收藏庫</h1>
        <p class="page-subtitle">管理已儲存的會話表達與情境包</p>
      </div>

      <!-- Tabs -->
      <div class="collection-tabs">
        <button class="collection-tab${currentTab === 'phrases' ? ' active' : ''}" data-tab="phrases" id="tab-phrases">
          💬 表達收藏
        </button>
        <button class="collection-tab${currentTab === 'situations' ? ' active' : ''}" data-tab="situations" id="tab-situations">
          🗺️ 情境包
        </button>
      </div>

      <div id="collection-content"></div>
    </div>
  `;

  bindTabEvents(container);
  renderCurrentTab(container);
}

function bindTabEvents(container: HTMLElement): void {
  container.querySelectorAll('.collection-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = (btn as HTMLElement).dataset.tab as CollectionTab;
      container.querySelectorAll('.collection-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderCurrentTab(container);
    });
  });
}

function renderCurrentTab(container: HTMLElement): void {
  if (currentTab === 'phrases') {
    renderPhrasesTab(container);
  } else {
    renderSituationsTab(container);
  }
}

// ── Phrases Tab ───────────────────────────────────────────
function renderPhrasesTab(container: HTMLElement): void {
  const content = container.querySelector<HTMLElement>('#collection-content')!;
  const allPhrases = loadPhrases();

  // Collect all unique situation tags
  const allSituationTags = Array.from(new Set(allPhrases.flatMap((p) => p.situationTags)));

  const counts = {
    total: allPhrases.length,
    unfamiliar: allPhrases.filter((p) => p.masteryLevel === 'unfamiliar').length,
    okay: allPhrases.filter((p) => p.masteryLevel === 'okay').length,
    familiar: allPhrases.filter((p) => p.masteryLevel === 'familiar').length,
  };

  content.innerHTML = `
    <!-- Stats -->
    <div class="stats-bar">
      <span class="stat-chip total">📚 共 ${counts.total} 個</span>
      <span class="stat-chip unfamiliar">🔴 不熟 ${counts.unfamiliar}</span>
      <span class="stat-chip okay">🟡 尚可 ${counts.okay}</span>
      <span class="stat-chip familiar">🟢 熟悉 ${counts.familiar}</span>
    </div>

    <!-- Toolbar -->
    <div class="collection-toolbar">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="sort-select" class="select" style="width:auto">
          <option value="newest" ${currentSort === 'newest' ? 'selected' : ''}>最新</option>
          <option value="alpha" ${currentSort === 'alpha' ? 'selected' : ''}>字母</option>
          <option value="random" ${currentSort === 'random' ? 'selected' : ''}>隨機</option>
          <option value="unfamiliar" ${currentSort === 'unfamiliar' ? 'selected' : ''}>不熟優先</option>
          <option value="okay" ${currentSort === 'okay' ? 'selected' : ''}>尚可</option>
          <option value="familiar" ${currentSort === 'familiar' ? 'selected' : ''}>熟悉</option>
        </select>
        ${allSituationTags.length ? `
          <select id="situation-filter" class="select" style="width:auto">
            <option value="">所有情境</option>
            ${allSituationTags.map((t) => `<option value="${esc(t)}" ${currentSituationFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
        ` : ''}
      </div>
      <div style="font-size:13px;color:var(--text-muted)" id="filter-count"></div>
    </div>

    <!-- Tag filter: grouped by category -->
    <div id="tag-filter-groups-wrap"></div>

    <div class="phrase-grid" id="phrase-grid"></div>
  `;

  renderGroupedTagFilters(content, allPhrases);
  renderPhraseGrid(content, allPhrases);

  // Sort change
  content.querySelector('#sort-select')?.addEventListener('change', (e) => {
    currentSort = (e.target as HTMLSelectElement).value as SortMode;
    renderPhraseGrid(content, loadPhrases());
  });

  // Situation filter
  content.querySelector('#situation-filter')?.addEventListener('change', (e) => {
    currentSituationFilter = (e.target as HTMLSelectElement).value;
    renderPhraseGrid(content, loadPhrases());
  });
}

function renderGroupedTagFilters(content: HTMLElement, allPhrases: ConversationItem[]): void {
  const wrap = content.querySelector<HTMLElement>('#tag-filter-groups-wrap')!;
  // Only show tags that exist in the current collection
  const usedTags = new Set(allPhrases.flatMap((p) => p.tags));
  // Also include any non-predefined legacy tags
  const legacyTags = [...usedTags].filter((t) => !ALL_PREDEFINED_TAGS.includes(t));

  // Build groups: only show groups that have at least one used tag
  const activeGroups = TAG_GROUPS.map((g) => ({
    ...g,
    tags: g.tags.filter((t) => usedTags.has(t)),
  })).filter((g) => g.tags.length > 0);

  if (activeGroups.length === 0 && legacyTags.length === 0) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = '';

  const groupsWrap = document.createElement('div');
  groupsWrap.className = 'tag-filter-groups';

  const allRow = document.createElement('div');
  allRow.className = 'tag-filter-group';

  const allChipsWrap = document.createElement('div');
  allChipsWrap.className = 'tag-filter-chips';

  const allChip = document.createElement('span');
  allChip.className = 'tag tag-filter-chip';
  allChip.textContent = '全部';
  allChip.dataset.tagFilter = '';
  if (!currentTagFilter) allChip.classList.add('active-filter');
  allChipsWrap.appendChild(allChip);
  allRow.appendChild(allChipsWrap);
  groupsWrap.appendChild(allRow);

  activeGroups.forEach((group) => {
    const row = document.createElement('div');
    row.className = 'tag-filter-group';

    const label = document.createElement('span');
    label.className = 'tag-filter-group-label';
    label.textContent = group.icon;
    row.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'tag-filter-chips';
    group.tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag tag-filter-chip';
      chip.textContent = tag;
      chip.dataset.tagFilter = tag;
      if (currentTagFilter === tag) chip.classList.add('active-filter');
      chips.appendChild(chip);
    });
    row.appendChild(chips);
    groupsWrap.appendChild(row);
  });

  // Legacy tags (miscellaneous)
  if (legacyTags.length > 0) {
    const row = document.createElement('div');
    row.className = 'tag-filter-group';
    const label = document.createElement('span');
    label.className = 'tag-filter-group-label';
    label.textContent = '…';
    row.appendChild(label);
    const chips = document.createElement('div');
    chips.className = 'tag-filter-chips';
    legacyTags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag tag-filter-chip';
      chip.textContent = tag;
      chip.dataset.tagFilter = tag;
      if (currentTagFilter === tag) chip.classList.add('active-filter');
      chips.appendChild(chip);
    });
    row.appendChild(chips);
    groupsWrap.appendChild(row);
  }

  wrap.appendChild(groupsWrap);

  // Bind click events
  wrap.querySelectorAll('.tag-filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentTagFilter = (chip as HTMLElement).dataset.tagFilter ?? '';
      wrap.querySelectorAll('.tag-filter-chip').forEach((c) => c.classList.remove('active-filter'));
      chip.classList.add('active-filter');
      renderPhraseGrid(content, loadPhrases());
    });
  });
}

function applyFiltersAndSort(phrases: ConversationItem[]): ConversationItem[] {
  let result = phrases;

  if (currentSituationFilter) {
    result = result.filter((p) => p.situationTags.includes(currentSituationFilter));
  }
  if (currentTagFilter) {
    result = result.filter((p) => p.tags.includes(currentTagFilter));
  }

  const pinned = result.filter((p) => p.isPinned);
  const unpinned = result.filter((p) => !p.isPinned);

  const sortFn = (a: ConversationItem, b: ConversationItem): number => {
    switch (currentSort) {
      case 'alpha':   return a.phrase.localeCompare(b.phrase);
      case 'random':  return Math.random() - 0.5;
      case 'unfamiliar': return Number(b.masteryLevel === 'unfamiliar') - Number(a.masteryLevel === 'unfamiliar');
      case 'okay':    return Number(b.masteryLevel === 'okay') - Number(a.masteryLevel === 'okay');
      case 'familiar':return Number(b.masteryLevel === 'familiar') - Number(a.masteryLevel === 'familiar');
      default:        return b.createdAt - a.createdAt;
    }
  };

  return [...pinned.sort(sortFn), ...unpinned.sort(sortFn)];
}

function renderPhraseGrid(content: HTMLElement, allPhrases: ConversationItem[]): void {
  const grid = content.querySelector<HTMLElement>('#phrase-grid')!;
  const filtered = applyFiltersAndSort(allPhrases);

  const countEl = content.querySelector<HTMLElement>('#filter-count');
  if (countEl) {
    countEl.textContent = filtered.length !== allPhrases.length
      ? `顯示 ${filtered.length} / ${allPhrases.length}`
      : '';
  }

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-text">還沒有收藏的表達</div>
        <div class="empty-state-hint">從「查詢」或「情境」頁面儲存表達後會在這裡顯示</div>
      </div>
    `;
    return;
  }

  filtered.forEach((item) => {
    const card = renderPhraseCard(item, () => {
      renderPhraseGrid(content, loadPhrases());
    });
    grid.appendChild(card);
  });
}

// ── Situations Tab ────────────────────────────────────────
function renderSituationsTab(container: HTMLElement): void {
  const content = container.querySelector<HTMLElement>('#collection-content')!;
  const situations = loadSituations();

  content.innerHTML = `
    <div style="margin-bottom:16px">
      <span style="font-size:14px;color:var(--text-secondary)">共 ${situations.length} 個情境包</span>
    </div>
    <div id="situations-grid" style="display:flex;flex-direction:column;gap:16px"></div>
  `;

  const grid = content.querySelector<HTMLElement>('#situations-grid')!;

  if (situations.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗺️</div>
        <div class="empty-state-text">還沒有儲存的情境包</div>
        <div class="empty-state-hint">從「情境」頁面搜尋並儲存情境包</div>
      </div>
    `;
    return;
  }

  situations.forEach((pack) => {
    const card = renderSituationPackCard(pack, () => {
      renderSituationsTab(container);
    });
    grid.appendChild(card);
  });
}

function renderSituationPackCard(
  pack: SituationPack,
  onDelete: () => void
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'situation-pack-card';

  const savedDate = new Date(pack.savedAt).toLocaleDateString('zh-TW');

  card.innerHTML = `
    <div class="situation-pack-header">
      <div>
        <div class="situation-pack-title">🗺️ ${esc(pack.situationName)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
          ${esc(pack.category)} · ${savedDate} · ${pack.keyPhrases.length} 個表達
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn-icon delete-pack-btn" title="刪除情境包">🗑️</button>
      </div>
    </div>
    <div class="situation-pack-body">
      <p style="font-size:13px;color:var(--text-secondary);padding:12px 0">${esc(pack.situationDescription)}</p>

      <!-- Dialogue (collapsible) -->
      <details class="phrase-dialogue-details" style="margin-bottom:12px">
        <summary class="phrase-section-summary">💬 情境對話（${pack.sampleDialogue.lines.length} 句）</summary>
        <div id="dialogue-${pack.id}" style="margin-top:8px"></div>
      </details>

      <!-- Key phrases -->
      <details class="phrase-alt-details">
        <summary class="phrase-section-summary">🔑 關鍵表達（${pack.keyPhrases.length} 個）</summary>
        <div class="situation-key-phrases" style="margin-top:8px" id="phrases-${pack.id}"></div>
      </details>
    </div>
  `;

  // Render dialogue lazily on expand
  const dialogueDetails = card.querySelector('details:first-of-type')!;
  dialogueDetails.addEventListener('toggle', () => {
    const el = card.querySelector<HTMLElement>(`#dialogue-${pack.id}`)!;
    if (el.children.length === 0) {
      el.appendChild(renderDialogue(pack.sampleDialogue));
    }
  }, { once: true });

  // Render phrases lazily
  const phrasesDetails = card.querySelector('details:last-of-type')!;
  phrasesDetails.addEventListener('toggle', () => {
    const el = card.querySelector<HTMLElement>(`#phrases-${pack.id}`)!;
    if (el.children.length === 0) {
      pack.keyPhrases.forEach((phrase) => {
        const item = document.createElement('div');
        item.className = 'situation-phrase-item';
        item.style.marginBottom = '8px';
        item.innerHTML = `
          <div class="situation-phrase-en">
            ${esc(phrase.phrase)}
            <button class="btn-icon" style="width:20px;height:20px;font-size:12px;display:inline-flex;vertical-align:middle" data-text="${esc(phrase.phrase)}" title="朗讀">🔊</button>
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
    }
  }, { once: true });

  // Delete
  card.querySelector('.delete-pack-btn')?.addEventListener('click', () => {
    if (confirm(`確定刪除「${pack.situationName}」情境包？`)) {
      deleteSituationPack(pack.id);
      showToast(`已刪除「${pack.situationName}」`, 'info');
      onDelete();
    }
  });

  return card;
}
