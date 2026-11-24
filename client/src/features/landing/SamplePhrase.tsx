import type { Lang } from '../../../../shared/types.ts';
import { useUser } from '../../core/UserContext.ts';
import { meta, renderPhrase, t } from '../../i18n/index.ts';
import { japanTime } from '../item/borrowTimes.ts';

// The idea of Otonari in one picture: the same stored message, rendered in the visitor's language and
// in their neighbor's. It is not a mock-up: renderPhrase is what the app uses for every message.
export default function SamplePhrase() {
  const { lang } = useUser();
  const isJapanese = lang === 'ja' || lang === 'ja-easy';
  const neighborLang: Lang = isJapanese ? 'en' : 'ja';
  const params = { item: 'futon_dryer', spot: 'entrance', start: japanTime(1, 9), end: japanTime(4, 9) };

  return (
    <div className="sample-phrase">
      <p className="bubble-label">{t(lang, 'landing.sampleYou', { language: meta(lang).name })}</p>
      <p className="bubble bubble-mine">{renderPhrase(lang, 'request', params)}</p>
      <p className="bubble-label">{t(lang, 'landing.sampleNeighbor', { language: meta(neighborLang).name })}</p>
      <p className="bubble bubble-theirs" lang={neighborLang}>
        {renderPhrase(neighborLang, 'request', params)}
      </p>
    </div>
  );
}
