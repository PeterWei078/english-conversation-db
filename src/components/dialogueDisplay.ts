import type { DialogueExample } from '../types/index';
import { speak } from '../services/speech';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderDialogue(dialogue: DialogueExample): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'dialogue-block';

  if (dialogue.contextDescription) {
    const ctx = document.createElement('div');
    ctx.className = 'dialogue-context';
    ctx.textContent = `📍 ${dialogue.contextDescription}`;
    wrap.appendChild(ctx);
  }

  dialogue.lines.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'dialogue-row';

    const speakerEl = document.createElement('span');
    speakerEl.className = 'dialogue-speaker';
    speakerEl.textContent = line.speaker;

    const textWrap = document.createElement('div');
    textWrap.className = 'dialogue-text-wrap';

    const textEl = document.createElement('div');
    textEl.className = 'dialogue-text';
    textEl.innerHTML = `<span class="dialogue-en">${esc(line.text)}</span>
      <button class="btn-icon dialogue-speak-btn" title="朗讀" data-text="${esc(line.text)}">🔊</button>`;

    const transEl = document.createElement('div');
    transEl.className = 'dialogue-translation';
    transEl.textContent = line.translation;

    textWrap.appendChild(textEl);
    textWrap.appendChild(transEl);
    row.appendChild(speakerEl);
    row.appendChild(textWrap);
    wrap.appendChild(row);
  });

  wrap.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.dialogue-speak-btn');
    if (btn) {
      const text = (btn as HTMLElement).dataset.text ?? '';
      speak(text, 0.85);
    }
  });

  return wrap;
}
