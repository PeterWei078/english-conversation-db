import type { SimilarPhrase } from '../services/storage';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Show a modal asking the user whether to save despite similar phrases existing.
 * Returns true if user chooses "Save Anyway", false if "Cancel".
 */
export function showSimilarPhraseDialog(
  newPhrase: string,
  similars: SimilarPhrase[]
): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';

    const similarRows = similars
      .map(
        ({ item, reason }) => `
          <div style="
            padding: 10px 12px;
            background: var(--warning-light);
            border-radius: var(--radius);
            margin-bottom: 8px;
          ">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-weight:700;font-size:14px">${esc(item.phrase)}</span>
              <span style="font-size:11px;padding:2px 8px;background:var(--bg-card);border-radius:999px;color:var(--warning);border:1px solid var(--warning)">${esc(reason)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary)">${esc(item.translation)}</div>
          </div>
        `
      )
      .join('');

    backdrop.innerHTML = `
      <div class="dialog" style="max-width:420px">
        <div class="dialog-title">⚠️ 發現相似表達</div>
        <div class="dialog-message">
          你正在儲存的表達：
          <strong style="display:block;font-size:16px;margin:6px 0 12px">"${esc(newPhrase)}"</strong>
          與收藏庫中以下 ${similars.length} 個表達高度相似：
        </div>
        <div style="margin-bottom:20px">
          ${similarRows}
        </div>
        <div class="dialog-actions">
          <button id="cancel-btn" class="btn btn-secondary">取消</button>
          <button id="save-anyway-btn" class="btn btn-primary">仍然儲存</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const cleanup = (result: boolean) => {
      backdrop.classList.add('exiting');
      backdrop.addEventListener('animationend', () => backdrop.remove(), { once: true });
      // Fallback removal
      setTimeout(() => backdrop.remove(), 300);
      resolve(result);
    };

    backdrop.querySelector('#save-anyway-btn')?.addEventListener('click', () => cleanup(true));
    backdrop.querySelector('#cancel-btn')?.addEventListener('click', () => cleanup(false));
    // Click outside = cancel
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup(false);
    });
  });
}
