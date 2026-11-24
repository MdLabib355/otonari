import { tip } from '../i18n/index.js';
import { TipIcon } from './Icons.jsx';

// A small etiquette tip shown at the right moment:  <TipCard lang={lang} tipKey="beforeRequest" />
// The texts are in the "tips" section of the language files.
export default function TipCard({ lang, tipKey }) {
  return (
    <aside className="tip-card">
      <TipIcon className="tip-icon" />
      <p>{tip(lang, tipKey)}</p>
    </aside>
  );
}
