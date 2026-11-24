import { useEffect, useState } from 'react';
import type { Lang } from '../../../shared/types.ts';
import { SpeakerIcon } from './Icons.tsx';
import { meta, t } from '../i18n/index.ts';

// 🔊 Reads a text aloud with the browser's own voices. Hidden if it has no voice for the language.
// A small icon normally, a big button with text in elder mode (see styles/elder.css).
//
//    <SpeakButton lang={lang} text="今から向かいます。" />
export default function SpeakButton({ lang, text }: { lang: Lang; text: string }) {
  const voice = useVoice(meta(lang).speech);
  if (!voice) return null;

  function speak(voice: SpeechSynthesisVoice) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    window.speechSynthesis.cancel(); // stop whatever is being read right now
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button type="button" className="speak-button" aria-label={t(lang, 'speak.button')} onClick={() => speak(voice)}>
      <SpeakerIcon />
      <span className="speak-text">{t(lang, 'speak.button')}</span>
    </button>
  );
}

// The voice for a language like 'ja-JP', or undefined. Browsers load their voices a moment after the
// page, and tell us with a 'voiceschanged' event. (The ?. are for browsers without speech.)
function useVoice(speech: string) {
  const [voice, setVoice] = useState(() => findVoice(speech));

  useEffect(() => {
    const update = () => setVoice(findVoice(speech));
    update(); // the language may have changed
    window.speechSynthesis?.addEventListener?.('voiceschanged', update);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', update);
  }, [speech]);

  return voice;
}

// Voices with "Natural" or "Online" in their name sound best, so they come first; then any voice for
// the language. Among those exactly 'bn-BD' if possible, otherwise e.g. 'bn-IN'. Android writes 'bn_BD'.
function findVoice(speech: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const sameLanguage = voices.filter((voice) => voice.lang.split(/[-_]/)[0] === speech.split('-')[0]);
  const natural = sameLanguage.filter((voice) => /Natural|Online/.test(voice.name));
  const best = natural.length > 0 ? natural : sameLanguage;
  return best.find((voice) => voice.lang.replace('_', '-') === speech) ?? best[0];
}
