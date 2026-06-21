import { updatePhraseItem } from '../services/storage';
import { TAG_GROUPS, ALL_PREDEFINED_TAGS, MAX_TAGS } from '../constants/tags';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderTagEditor(
  tags: string[],
  itemId: string,
  onUpdate: (tags: string[]) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tag-editor';

  const render = (current: string[]) => {
    container.innerHTML = '';

    // Remove chips
    current.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.innerHTML = `${esc(tag)} <span class="tag-remove" title="移除">×</span>`;
      chip.querySelector('.tag-remove')!.addEventListener('click', () => {
        const next = current.filter((t) => t !== tag);
        updatePhraseItem(itemId, { tags: next });
        onUpdate(next);
        render(next);
      });
      container.appendChild(chip);
    });

    // Add button (only if under max)
    if (current.length < MAX_TAGS) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn-ghost btn btn-sm tag-add-btn';
      addBtn.style.fontSize = '12px';
      addBtn.style.padding = '2px 8px';
      addBtn.textContent = '+ 標籤';

      const popover = createTagPopover(current, (selected) => {
        const next = [...current, selected];
        updatePhraseItem(itemId, { tags: next });
        onUpdate(next);
        render(next);
        popover.remove();
      });

      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close any open popovers
        document.querySelectorAll('.tag-popover').forEach((p) => p.remove());
        container.appendChild(popover);
        // Close on outside click
        const close = (ev: MouseEvent) => {
          if (!popover.contains(ev.target as Node)) {
            popover.remove();
            document.removeEventListener('click', close);
          }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
      });

      container.appendChild(addBtn);
    }
  };

  render(tags);
  return container;
}

function createTagPopover(
  currentTags: string[],
  onSelect: (tag: string) => void
): HTMLElement {
  const pop = document.createElement('div');
  pop.className = 'tag-popover';

  TAG_GROUPS.forEach((group) => {
    const available = group.tags.filter((t) => !currentTags.includes(t));
    if (available.length === 0) return;

    const groupEl = document.createElement('div');
    groupEl.className = 'tag-popover-group';

    const label = document.createElement('div');
    label.className = 'tag-popover-group-label';
    label.textContent = `${group.icon} ${group.group}`;
    groupEl.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'tag-popover-chips';
    available.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag-popover-chip';
      chip.textContent = tag;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(tag);
      });
      chips.appendChild(chip);
    });

    groupEl.appendChild(chips);
    pop.appendChild(groupEl);
  });

  // If all tags already selected
  const allUsed = ALL_PREDEFINED_TAGS.every((t) => currentTags.includes(t));
  if (allUsed) {
    pop.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text-muted)">已使用所有標籤</div>';
  }

  return pop;
}
