let preferredVoice: SpeechSynthesisVoice | null = null;
let activeSequence: { stop: () => void } | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (preferredVoice) return preferredVoice;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const google = voices.find((v) => v.name.includes('Google') && v.lang === 'en-US');
  if (google) return (preferredVoice = google);
  const nonLocal = voices.find((v) => v.lang === 'en-US' && !v.localService);
  if (nonLocal) return (preferredVoice = nonLocal);
  const anyUS = voices.find((v) => v.lang === 'en-US');
  return (preferredVoice = anyUS ?? null);
}

export function speak(text: string, rate = 0.9): void {
  if (!('speechSynthesis' in window)) return;
  activeSequence?.stop();
  activeSequence = null;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = rate;
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

// Plays a list of lines back-to-back, waiting for each utterance to finish
// before starting the next, so a full dialogue reads like an uninterrupted
// conversation rather than overlapping/cut-off single lines.
export function speakSequence(
  texts: string[],
  rate = 0.9,
  onIndexChange?: (index: number) => void
): { promise: Promise<void>; stop: () => void } {
  if (!('speechSynthesis' in window)) {
    return { promise: Promise.resolve(), stop: () => {} };
  }
  activeSequence?.stop();
  speechSynthesis.cancel();

  let cancelled = false;
  const handle = {
    stop: () => {
      cancelled = true;
      speechSynthesis.cancel();
    },
  };
  activeSequence = handle;

  const voice = pickVoice();

  const promise = (async () => {
    for (let i = 0; i < texts.length; i++) {
      if (cancelled) break;
      onIndexChange?.(i);
      await new Promise<void>((resolve) => {
        const utter = new SpeechSynthesisUtterance(texts[i]);
        utter.lang = 'en-US';
        utter.rate = rate;
        if (voice) utter.voice = voice;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        speechSynthesis.speak(utter);
      });
      if (cancelled) break;
      await new Promise((r) => setTimeout(r, 350));
    }
    if (activeSequence === handle) activeSequence = null;
    onIndexChange?.(-1);
  })();

  return { promise, stop: handle.stop };
}

if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener('voiceschanged', () => {
    preferredVoice = null;
  });
}
