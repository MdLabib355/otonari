import { useEffect, useState } from 'react';
import { meta, t } from '../i18n/index.js';

// 🔊 Reads a text aloud with the browser's own voices. Hidden if it has no voice for the language.
// A small icon normally, a big button with text in elder mode (see styles.css).
//
//    <SpeakButton lang={lang} text="今から向かいます。" />
export default function SpeakButton({ lang, text }) {
  const voice = useVoice(meta(lang).speech);
  if (!voice) return null;

  function speak() {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    window.speechSynthesis.cancel(); // stop whatever is being read right now
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button type="button" className="speak-button" aria-label={t(lang, 'speak.button')} onClick={speak}>
      <span aria-hidden="true">🔊</span>
      <span className="speak-text">{t(lang, 'speak.button')}</span>
    </button>
  );
}

// The voice for a language like 'ja-JP', or undefined. Browsers load their voices a moment after the
// page, and tell us with a 'voiceschanged' event. (The ?. are for browsers without speech.)
function useVoice(speech) {
  const [voice, setVoice] = useState(() => findVoice(speech));

  useEffect(() => {
    const update = () => setVoice(findVoice(speech));
    update(); // the language may have changed
    window.speechSynthesis?.addEventListener?.('voiceschanged', update);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', update);
  }, [speech]);

  return voice;
}

// Exactly 'bn-BD' if possible, otherwise any Bengali voice (e.g. 'bn-IN'). Android writes 'bn_BD'.
function findVoice(speech) {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const sameLanguage = voices.filter((voice) => voice.lang.split(/[-_]/)[0] === speech.split('-')[0]);
  return sameLanguage.find((voice) => voice.lang.replace('_', '-') === speech) ?? sameLanguage[0];
}
