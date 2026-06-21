import type { GeminiSituationResult, SituationPack } from '../types/index';
import { searchSituation, ThrottleError } from '../services/ai';
import { loadSettings, addSituationPack, loadSituations } from '../services/storage';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';
import { renderDialogue } from '../components/dialogueDisplay';

interface SituationCategory {
  icon: string;
  label: string;
  query: string;
}

const CATEGORIES: SituationCategory[] = [
  // 出國旅遊系列
  { icon: '✈️', label: '機場辦理',    query: '在機場辦理報到、過安檢、找登機門' },
  { icon: '🛫', label: '飛機上',       query: '在飛機上與空服員溝通，詢問餐點、設備、協助' },
  { icon: '🛂', label: '入境海關',     query: '入境海關申報與移民官員對話' },
  { icon: '🏨', label: '飯店住宿',     query: '飯店辦理入住退房、詢問設施、提出要求' },
  { icon: '🚕', label: '交通/計程車', query: '搭計程車、叫車、詢問路線、租車' },
  { icon: '🗺️', label: '觀光問路',     query: '觀光景點問路、請人拍照、買門票' },
  { icon: '🏪', label: '便利商店',     query: '在國外便利商店或超市購物結帳' },
  { icon: '💊', label: '藥局/醫療',   query: '在藥局購藥或小診所看診，說明症狀' },
  // 生活場景
  { icon: '☕', label: '咖啡廳',       query: '在咖啡廳點餐、客製化飲料、外帶' },
  { icon: '🍽️', label: '餐廳用餐',    query: '在餐廳訂位、點餐、提出特殊需求、結帳' },
  { icon: '🛍️', label: '購物',         query: '在服飾店或商店購物，詢問尺寸、退換貨' },
  // 社交場合
  { icon: '🤝', label: '初次見面',     query: '初次認識、自我介紹、打破沉默的閒聊' },
  { icon: '💬', label: '日常閒聊',     query: '日常閒聊、問候、談天氣與近況' },
  { icon: '🎉', label: '派對聚會',     query: '參加派對或聚會，社交寒暄、祝賀' },
  // 職場
  { icon: '💼', label: '職場溝通',     query: '職場日常溝通、開會發言、請假' },
  { icon: '📧', label: '電話/視訊',   query: '電話接聽、轉接、留言、視訊會議開場' },
  // 情感表達
  { icon: '🙏', label: '道歉/感謝',   query: '道歉、表達遺憾、感謝、接受感謝' },
  { icon: '🎁', label: '祝賀/邀請',   query: '生日祝賀、節日問候、活動邀請' },
];

let currentResult: GeminiSituationResult | null = null;
let activeCategory: string | null = null;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderSituationPage(container: HTMLElement): void {
  currentResult = null;
  activeCategory = null;

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">英語情境搜尋</h1>
        <p class="page-subtitle">選擇情境分類，或自行輸入情境描述，AI 生成完整情境學習包</p>
      </div>

      <!-- Category Grid -->
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:12px">情境分類</div>
        <div class="situation-categories" id="category-grid"></div>
      </div>

      <!-- Custom input -->
      <div class="card" style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:10px">或輸入自訂情境</div>
        <div class="input-group" style="margin-bottom:12px">
          <input
            id="situation-input"
            class="input input-lg"
            type="text"
            placeholder="例如：在醫院急診、面試英文自我介紹、上班第一天…"
            autocomplete="off"
          />
          <div class="input-group-append">
            <button id="search-situation-btn" class="btn btn-primary">搜尋</button>
          </div>
        </div>
      </div>

      <div id="situation-output"></div>
    </div>
  `;

  renderCategoryGrid(container);
  bindSituationEvents(container);
}

function renderCategoryGrid(container: HTMLElement): void {
  const grid = container.querySelector<HTMLElement>('#category-grid')!;
  CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'situation-category-btn';
    btn.dataset.query = cat.query;
    btn.innerHTML = `
      <span class="situation-category-icon">${cat.icon}</span>
      <span>${cat.label}</span>
    `;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.situation-category-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = cat.label;
      const input = container.querySelector<HTMLInputElement>('#situation-input')!;
      input.value = cat.query;
      performSearch(cat.query, container);
    });
    grid.appendChild(btn);
  });
}

function bindSituationEvents(container: HTMLElement): void {
  const input = container.querySelector<HTMLInputElement>('#situation-input')!;
  const btn = container.querySelector<HTMLButtonElement>('#search-situation-btn')!;

  const trigger = () => {
    const q = input.value.trim();
    if (!q) return;
    activeCategory = null;
    container.querySelectorAll('.situation-category-btn').forEach((b) => b.classList.remove('active'));
    performSearch(q, container);
  };

  btn.addEventListener('click', trigger);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') trigger(); });
}

async function performSearch(query: string, container: HTMLElement): Promise<void> {
  const settings = loadSettings();
  if (!settings.geminiApiKey) {
    showToast('請先在設定中填入 Gemini API 金鑰', 'warning');
    return;
  }

  const output = container.querySelector<HTMLElement>('#situation-output')!;
  output.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><span>AI 生成情境學習包中，請稍候…</span></div>`;

  try {
    const result = await searchSituation(settings.geminiApiKey, query);
    currentResult = result;
    renderSituationResult(result, output);
  } catch (err) {
    if (err instanceof ThrottleError) {
      showToast(err.message, 'warning');
      output.innerHTML = '';
    } else {
      output.innerHTML = `<div class="card" style="color:var(--danger)">搜尋失敗：${esc(String(err))}</div>`;
    }
  }
}

function renderSituationResult(result: GeminiSituationResult, output: HTMLElement): void {
  output.innerHTML = `
    <div style="animation: fadeInUp 0.2s ease">
      <!-- Situation header -->
      <div class="situation-pack-card" style="margin-bottom:16px">
        <div class="situation-pack-header">
          <div>
            <div class="situation-pack-title">🗺️ ${esc(result.situationName)}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${esc(result.situationDescription)}</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button id="save-pack-btn" class="btn btn-primary btn-sm">💾 儲存情境包</button>
          </div>
        </div>
      </div>

      <!-- Sample dialogue -->
      <div class="situation-pack-card" style="margin-bottom:16px">
        <div class="situation-pack-header">
          <span style="font-size:15px;font-weight:700">💬 情境對話範例</span>
        </div>
        <div class="situation-pack-body" style="padding-top:16px">
          <div id="sample-dialogue"></div>
        </div>
      </div>

      <!-- Key phrases -->
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

  // Render dialogue
  const dialogueEl = output.querySelector<HTMLElement>('#sample-dialogue')!;
  dialogueEl.appendChild(renderDialogue(result.sampleDialogue));

  // Render key phrases (read-only — no save buttons)
  const phrasesList = output.querySelector<HTMLElement>('#key-phrases-list')!;
  result.keyPhrases.forEach((phrase) => {
    const item = document.createElement('div');
    item.className = 'situation-phrase-item';

    item.innerHTML = `
      <div class="situation-phrase-en">
        ${esc(phrase.phrase)}
        <button class="btn-icon speak-btn" style="width:22px;height:22px;font-size:13px;display:inline-flex;vertical-align:middle" data-text="${esc(phrase.phrase)}" title="朗讀">🔊</button>
      </div>
      <div class="situation-phrase-zh">${esc(phrase.translation)}</div>
      ${phrase.usage ? `<div class="situation-phrase-usage">${esc(phrase.usage)}</div>` : ''}
      ${phrase.alternatives.length ? `
        <div style="margin-top:6px">
          <span style="font-size:11px;color:var(--text-muted)">替換說法：</span>
          <div class="situation-phrase-alts">
            ${phrase.alternatives.map((a) => `
              <span class="situation-alt-chip" data-text="${esc(a.expression)}" title="${esc(a.nuanceDifference)}">
                ${esc(a.expression)}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    item.querySelector('.speak-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      speak((e.currentTarget as HTMLElement).dataset.text ?? '');
    });
    item.querySelectorAll('.situation-alt-chip').forEach((chip) => {
      chip.addEventListener('click', () => speak((chip as HTMLElement).dataset.text ?? ''));
    });

    phrasesList.appendChild(item);
  });

  // Save pack button
  output.querySelector('#save-pack-btn')?.addEventListener('click', () => {
    if (!currentResult) return;

    // Check if already saved (by name)
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
      category: activeCategory ?? '自訂',
      sampleDialogue: currentResult.sampleDialogue,
      keyPhrases: currentResult.keyPhrases,
      savedAt: Date.now(),
      tags: currentResult.tags,
    };
    addSituationPack(pack);
    showToast(`已儲存情境包「${pack.situationName}」到收藏庫`, 'success');
    const btn = output.querySelector<HTMLButtonElement>('#save-pack-btn')!;
    btn.textContent = '✅ 已儲存';
    btn.disabled = true;
  });
}

