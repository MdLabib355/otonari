import type { Lang, LoanItem } from '../../../../shared/types.ts';
import { QUICK_REPLIES } from '../../data/catalog.ts';
import { renderPhrase, t } from '../../i18n/index.ts';
import type { Act } from './loanProps.ts';

// Fixed phrases instead of typing. Each chip shows the whole sentence that will be sent.
export default function QuickReplies({ item, lang, busy, act }: { item: LoanItem; lang: Lang; busy: boolean; act: Act }) {
  return (
    <div className="quick-replies">
      <p className="label">{t(lang, 'loan.quickReplies')}</p>
      <div className="chip-group">
        {QUICK_REPLIES.map((phraseKey) => (
          <button
            key={phraseKey}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => act('messages', { phrase_key: phraseKey })}
          >
            {renderPhrase(lang, phraseKey, { spot: item.spot })}
          </button>
        ))}
      </div>
    </div>
  );
}
