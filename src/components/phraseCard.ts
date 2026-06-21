import type { ConversationItem, MasteryLevel } from '../types/index';
import { updatePhraseItem, deletePhraseItem } from '../services/storage';
import { speak } from '../services/speech';
import { renderTagEditor } from './tagEditor';
import { renderDialogue } from './dialogueDisplay';
import { showToast } from './toast';

const MASTERY_CONFIG: Record<MasteryLevel, { label: string; icon: string; cls: string }> = {
  unfamiliar: { label: '不熟',  icon: '🔴', cls: 'unfamiliar' },
  okay:       { label: '尚可',  icon: '🟡', cls: 'okay' },
  familiar:   { label: '熟悉',  icon: '🟢', cls: 'familiar' },
};

const MASTERY_ORDER: MasteryLevel[] = ['unfamiliar', 'okay', 'familiar'];

const FORMALITY_LABEL: Record<string, string> = {
  formal:   '正式',
  informal: '口語',
  neutral:  '通用',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderPhraseCard(
  item: ConversationItem,
  onDelete: (id: string) => void
): HTMLElement {
  const card = document.createElement('div');
  card.className = `phrase-card${item.isPinned ? ' pinned' : ''}`;
  card.dataset.id = item.id;

  const rebuild = (current: ConversationItem) => {
    card.className = `phrase-card${current.isPinned ? ' pinned' : ''}`;
    card.innerHTML = '';

    // ── Header ─────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'phrase-card-header';

    const phraseBlock = document.createElement('div');
    phraseBlock.className = 'phrase-card-phrase';
    phraseBlock.innerHTML = `
      <span class="phrase-text">${esc(current.phrase)}</span>
      <span class="phrase-type-badge">${esc(current.type.replace('_', ' '))}</span>
      <span class="phrase-formality-badge formality-${current.formalityLevel}">${FORMALITY_LABEL[current.formalityLevel] ?? current.formalityLevel}</span>
    `;
    header.appendChild(phraseBlock);

    const actions = document.createElement('div');
    actions.className = 'phrase-card-actions';

    const speakBtn = document.createElement('button');
    speakBtn.className = 'btn-icon';
    speakBtn.title = '朗讀表達';
    speakBtn.textContent = '🔊';
    speakBtn.addEventListener('click', () => speak(current.phrase));
    actions.appendChild(speakBtn);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'btn-icon';
    pinBtn.title = current.isPinned ? '取消置頂' : '置頂';
    pinBtn.textContent = current.isPinned ? '📌' : '📍';
    pinBtn.addEventListener('click', () => {
      const next = { ...current, isPinned: !current.isPinned };
      updatePhraseItem(current.id, { isPinned: next.isPinned });
      rebuild(next);
    });
    actions.appendChild(pinBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.title = '刪除';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => {
      if (confirm(`確定刪除「${current.phrase}」？`)) {
        deletePhraseItem(current.id);
        card.remove();
        onDelete(current.id);
        showToast(`已刪除「${current.phrase}」`, 'info');
      }
    });
    actions.appendChild(delBtn);
    header.appendChild(actions);
    card.appendChild(header);

    // ── Translation ─────────────────────────────────────
    const trans = document.createElement('div');
    trans.className = 'phrase-translation';
    trans.textContent = current.translation;
    card.appendChild(trans);

    // ── Usage Notes ─────────────────────────────────────
    if (current.usageNotes) {
      const notes = document.createElement('div');
      notes.className = 'phrase-usage-notes';
      notes.innerHTML = `<span class="notes-label">用法說明</span> ${esc(current.usageNotes)}`;
      card.appendChild(notes);
    }

    // ── Dialogue (collapsible) ──────────────────────────
    const dialogueSection = document.createElement('details');
    dialogueSection.className = 'phrase-dialogue-details';
    const dSummary = document.createElement('summary');
    dSummary.className = 'phrase-section-summary';
    dSummary.textContent = '💬 情境對話範例';
    dialogueSection.appendChild(dSummary);
    dialogueSection.appendChild(renderDialogue(current.dialogueExample));
    card.appendChild(dialogueSection);

    // ── Alternative Expressions ─────────────────────────
    if (current.alternativeExpressions.length > 0) {
      const altSection = document.createElement('details');
      altSection.className = 'phrase-alt-details';
      const altSummary = document.createElement('summary');
      altSummary.className = 'phrase-section-summary';
      altSummary.textContent = `🔄 替換說法（${current.alternativeExpressions.length} 種）`;
      altSection.appendChild(altSummary);

      const altList = document.createElement('div');
      altList.className = 'alt-list';
      current.alternativeExpressions.forEach((alt) => {
        const altItem = document.createElement('div');
        altItem.className = 'alt-item';
        altItem.innerHTML = `
          <div class="alt-expression">
            <span class="alt-text">${esc(alt.expression)}</span>
            <button class="btn-icon alt-speak-btn" style="width:22px;height:22px;font-size:13px" title="朗讀">🔊</button>
            <span class="phrase-formality-badge formality-${alt.formalityLevel}">${FORMALITY_LABEL[alt.formalityLevel] ?? alt.formalityLevel}</span>
          </div>
          <div class="alt-nuance">${esc(alt.nuanceDifference)}</div>
        `;
        altItem.querySelector('.alt-speak-btn')!.addEventListener('click', () => speak(alt.expression));
        altList.appendChild(altItem);
      });
      altSection.appendChild(altList);
      card.appendChild(altSection);
    }

    // ── Footer ──────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'phrase-card-footer';

    // Situation tags
    if (current.situationTags.length) {
      const sitTags = document.createElement('div');
      sitTags.className = 'situation-tags';
      current.situationTags.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'situation-tag-chip';
        chip.textContent = t;
        sitTags.appendChild(chip);
      });
      footer.appendChild(sitTags);
    }

    // Mastery cycle button
    const masteryConfig = MASTERY_CONFIG[current.masteryLevel];
    const masteryBtn = document.createElement('button');
    masteryBtn.className = `btn btn-sm mastery-btn mastery-${masteryConfig.cls}`;
    masteryBtn.innerHTML = `${masteryConfig.icon} ${masteryConfig.label}`;
    masteryBtn.title = '點擊切換熟悉度';
    masteryBtn.addEventListener('click', () => {
      const currentIdx = MASTERY_ORDER.indexOf(current.masteryLevel);
      const nextMastery = MASTERY_ORDER[(currentIdx + 1) % MASTERY_ORDER.length];
      updatePhraseItem(current.id, { masteryLevel: nextMastery });
      rebuild({ ...current, masteryLevel: nextMastery });
    });
    footer.appendChild(masteryBtn);

    card.appendChild(footer);

    // ── General Tags ────────────────────────────────────
    const tagSection = document.createElement('div');
    tagSection.className = 'phrase-tags-section';
    tagSection.appendChild(
      renderTagEditor(current.tags, current.id, (newTags) => {
        current = { ...current, tags: newTags };
      })
    );
    card.appendChild(tagSection);
  };

  rebuild(item);
  return card;
}
