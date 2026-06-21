import { updatePhraseItem } from '../services/storage';

export function renderTagEditor(
  tags: string[],
  itemId: string,
  onUpdate: (tags: string[]) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tag-editor';

  const render = (current: string[]) => {
    container.innerHTML = '';

    current.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.innerHTML = `${escTag(tag)} <span class="tag-remove" title="移除標籤">×</span>`;
      chip.querySelector('.tag-remove')!.addEventListener('click', () => {
        const next = current.filter((t) => t !== tag);
        updatePhraseItem(itemId, { tags: next });
        onUpdate(next);
        render(next);
      });
      container.appendChild(chip);
    });

    const input = document.createElement('input');
    input.className = 'tag-input-inline';
    input.placeholder = '+ 新增標籤';
    input.maxLength = 20;

    const addTag = () => {
      const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
      if (val && !current.includes(val)) {
        const next = [...current, val];
        updatePhraseItem(itemId, { tags: next });
        onUpdate(next);
        render(next);
      } else {
        input.value = '';
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag();
      }
    });
    input.addEventListener('blur', addTag);
    container.appendChild(input);
  };

  render(tags);
  return container;
}

function escTag(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
