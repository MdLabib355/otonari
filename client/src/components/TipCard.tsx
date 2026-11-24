import type { Lang } from '../../../shared/types.ts';
import { TipIcon } from './Icons.tsx';
import { tip, type TipKey } from '../i18n/index.ts';

// A small etiquette tip shown at the right moment:  <TipCard lang={lang} tipKey="beforeRequest" />
// The texts are in the "tips" section of the language files.
export default function TipCard({ lang, tipKey }: { lang: Lang; tipKey: TipKey }) {
  return (
    <aside className="tip-card">
      <TipIcon className="tip-icon" />
      <p>{tip(lang, tipKey)}</p>
    </aside>
  );
}
