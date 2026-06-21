let preferredVoice: SpeechSynthesisVoice | null = null;

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
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = rate;
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener('voiceschanged', () => {
    preferredVoice = null;
  });
}
