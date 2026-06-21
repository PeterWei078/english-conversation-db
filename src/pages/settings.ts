import type { Theme } from '../types/index';
import { loadSettings, saveSettings, getStorageUsage, exportDataJson, importDataJson, clearAllData, loadPhrases, savePhrases } from '../services/storage';
import { applyTheme } from '../main';
import { showToast } from '../components/toast';
import { mapLegacyTag, ALL_PREDEFINED_TAGS, TAG_GROUPS } from '../constants/tags';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderSettingsPage(container: HTMLElement): void {
  const settings = loadSettings();
  const usage = getStorageUsage();
  const usedKB = (usage.usedBytes / 1024).toFixed(1);
  const totalKB = (usage.totalBytes / 1024).toFixed(0);
  const pct = Math.round((usage.usedBytes / usage.totalBytes) * 100);

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">設定</h1>
      </div>

      <div class="settings-sections">
        <!-- API Key -->
        <div class="settings-section">
          <div class="settings-section-title">AI 設定</div>
          <div class="form-group">
            <label class="label">Gemini API 金鑰</label>
            <div class="input-group">
              <input
                id="api-key-input"
                class="input"
                type="password"
                placeholder="AIza…"
                value="${esc(settings.geminiApiKey)}"
                autocomplete="off"
              />
              <div class="input-group-append">
                <button id="toggle-key-btn" class="btn-icon" title="顯示/隱藏">👁️</button>
              </div>
            </div>
          </div>
          <button id="save-key-btn" class="btn btn-primary">儲存 API 金鑰</button>
          <p style="font-size:12px;color:var(--text-muted);margin-top:10px">
            金鑰僅儲存在瀏覽器 LocalStorage，不會上傳到任何伺服器。
            前往 <strong>Google AI Studio</strong> 免費取得 Gemini API 金鑰。
          </p>
        </div>

        <!-- Theme -->
        <div class="settings-section">
          <div class="settings-section-title">外觀</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">主題</div>
              <div class="settings-row-desc">淺色、深色或跟隨系統</div>
            </div>
            <select id="theme-select" class="select" style="width:auto">
              <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>☀️ 淺色</option>
              <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>🌙 深色</option>
              <option value="auto" ${settings.theme === 'auto' ? 'selected' : ''}>🖥️ 跟隨系統</option>
            </select>
          </div>
        </div>

        <!-- Storage -->
        <div class="settings-section">
          <div class="settings-section-title">儲存空間</div>
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
              <span>已使用 ${usedKB} KB / ${totalKB} KB</span>
              <span>${pct}%</span>
            </div>
            <div class="storage-bar-wrap">
              <div class="storage-bar-track">
                <div class="storage-bar-fill" style="width:${pct}%"></div>
              </div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${usage.breakdown.map((b) => `
              <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary)">
                <span>${esc(b.label)}</span>
                <span>${(b.bytes / 1024).toFixed(1)} KB</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Export/Import -->
        <div class="settings-section">
          <div class="settings-section-title">資料匯出 ／ 匯入</div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <button id="export-btn" class="btn btn-secondary">📤 匯出所有資料（JSON）</button>
            <div>
              <label class="label">匯入方式</label>
              <div style="display:flex;gap:8px;margin-bottom:10px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px">
                  <input type="radio" name="import-mode" value="merge" checked> 合併（保留現有）
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px">
                  <input type="radio" name="import-mode" value="replace"> 覆蓋（取代現有）
                </label>
              </div>
              <button id="import-btn" class="btn btn-secondary">📥 匯入資料（JSON）</button>
              <input type="file" id="import-file" accept=".json" style="display:none">
            </div>
          </div>
        </div>

        <!-- Tag Management -->
        <div class="settings-section">
          <div class="settings-section-title">標籤管理</div>
          <div style="margin-bottom:16px">
            <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
              標準標籤清單（共 ${ALL_PREDEFINED_TAGS.length} 個，分 ${TAG_GROUPS.length} 類）：
            </div>
            ${TAG_GROUPS.map((g) => `
              <div style="margin-bottom:10px">
                <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">${g.icon} ${g.group}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px">
                  ${g.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">一鍵清理舊標籤</div>
              <div class="settings-row-desc">將收藏中的舊有標籤自動對應到標準清單，無法對應的將被移除</div>
            </div>
            <button id="cleanup-tags-btn" class="btn btn-secondary btn-sm">🧹 整理標籤</button>
          </div>
        </div>

        <!-- Danger zone -->
        <div class="settings-section" style="border-color:var(--danger-light)">
          <div class="settings-section-title" style="color:var(--danger)">危險操作</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">清除所有資料</div>
              <div class="settings-row-desc">刪除所有收藏、情境包及設定（無法恢復）</div>
            </div>
            <button id="clear-btn" class="btn btn-danger btn-sm">清除全部</button>
          </div>
        </div>

        <!-- About -->
        <div class="settings-section">
          <div class="settings-section-title">關於</div>
          <div style="font-size:14px;color:var(--text-secondary);line-height:1.8">
            <div><strong>英文會話學習資料庫</strong></div>
            <div>版本 1.0.0</div>
            <div style="margin-top:8px;font-size:13px">
              由 AI（Gemini 2.5 Flash）驅動的英語會話學習工具。<br>
              所有資料儲存在瀏覽器 LocalStorage，無需帳號，完全離線可用（AI 查詢除外）。
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindSettingsEvents(container);
}

function bindSettingsEvents(container: HTMLElement): void {
  // API key toggle visibility
  const keyInput = container.querySelector<HTMLInputElement>('#api-key-input')!;
  container.querySelector('#toggle-key-btn')?.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  // Save API key
  container.querySelector('#save-key-btn')?.addEventListener('click', () => {
    const settings = loadSettings();
    settings.geminiApiKey = keyInput.value.trim();
    saveSettings(settings);
    showToast('API 金鑰已儲存', 'success');
  });

  // Theme
  container.querySelector('#theme-select')?.addEventListener('change', (e) => {
    const theme = (e.target as HTMLSelectElement).value as Theme;
    const settings = loadSettings();
    settings.theme = theme;
    saveSettings(settings);
    applyTheme(theme);
  });

  // Export
  container.querySelector('#export-btn')?.addEventListener('click', () => {
    const json = exportDataJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `english-conversation-db-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('資料已匯出', 'success');
  });

  // Import
  const importFile = container.querySelector<HTMLInputElement>('#import-file')!;
  container.querySelector('#import-btn')?.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    const modeEl = container.querySelector<HTMLInputElement>('input[name="import-mode"]:checked')!;
    const mode = (modeEl.value as 'merge' | 'replace');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = importDataJson(e.target!.result as string, mode);
        showToast(`已匯入 ${result.phrases} 個表達、${result.situations} 個情境包`, 'success');
        renderSettingsPage(container);
      } catch {
        showToast('匯入失敗：JSON 格式不正確', 'error');
      }
    };
    reader.readAsText(file);
    importFile.value = '';
  });

  // Tag cleanup
  container.querySelector('#cleanup-tags-btn')?.addEventListener('click', () => {
    const phrases = loadPhrases();
    let totalRemoved = 0;
    let totalMapped = 0;

    const updated = phrases.map((p) => {
      const cleanedTags: string[] = [];

      // First migrate situationTags → tags
      const allRaw = [...(p.situationTags ?? []), ...p.tags];

      allRaw.forEach((tag) => {
        const mapped = mapLegacyTag(tag);
        if (mapped && !cleanedTags.includes(mapped)) {
          if (mapped !== tag) totalMapped++;
          cleanedTags.push(mapped);
        } else if (!mapped) {
          totalRemoved++;
        }
      });

      return { ...p, tags: cleanedTags, situationTags: [] };
    });

    savePhrases(updated);
    showToast(
      `標籤整理完成：對應 ${totalMapped} 個、移除 ${totalRemoved} 個無效標籤`,
      'success',
      5000
    );
    renderSettingsPage(container);
  });

  // Clear all
  container.querySelector('#clear-btn')?.addEventListener('click', () => {
    if (!confirm('確定要清除所有資料？此操作無法恢復！')) return;
    if (!confirm('再次確認：這將刪除所有表達收藏、情境包和設定。確定嗎？')) return;
    clearAllData();
    showToast('所有資料已清除', 'info');
    renderSettingsPage(container);
  });
}
