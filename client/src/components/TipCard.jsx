import { tip } from '../i18n/index.js';

// A small etiquette tip shown at the right moment:  <TipCard lang={lang} tipKey="beforeRequest" />
// The texts are in the "tips" section of the language files.
export default function TipCard({ lang, tipKey }) {
  return (
    <aside className="tip-card">
      <span aria-hidden="true">💡</span>
      <p>{tip(lang, tipKey)}</p>
    </aside>
  );
}
