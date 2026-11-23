import { useState } from 'react';
import { displayName, meta, renderPhrase, t } from '../i18n/index.js';

// One message of a loan, in MY language. Messages are stored as phrase_key + params, so the same
// message can be rendered in any language at any time.
//   mine → right, theirs → left, system reminders (no sender) → centered with 🔔
// "Show original" renders the same phrase in the sender's language, which proves that both sides
// saw the same meaning. It is hidden when that would be the identical text (my own messages, and
// neighbors who use the same language as me).
export default function PhraseBubble({ message, lang, myId, other }) {
  const [showOriginal, setShowOriginal] = useState(false);

  const isSystem = message.from_user_id === null;
  const isMine = message.from_user_id === myId;
  const hasOriginal = !isSystem && !isMine && message.from_lang !== lang;

  let side = 'theirs';
  if (isMine) side = 'mine';
  if (isSystem) side = 'system';

  return (
    <li className={`bubble bubble-${side}`}>
      {isSystem && <p className="bubble-label">🔔 {t(lang, 'loan.system')}</p>}
      <p className="bubble-text">{renderPhrase(lang, message.phrase_key, message.params)}</p>

      {hasOriginal && showOriginal && (
        <div className="bubble-original">
          <p className="bubble-label">
            {t(lang, 'loan.originalIn', {
              name: displayName(lang, other.nickname),
              language: meta(message.from_lang).name,
            })}
          </p>
          <p className="bubble-text" lang={message.from_lang === 'ja-easy' ? 'ja' : message.from_lang}>
            {renderPhrase(message.from_lang, message.phrase_key, message.params)}
          </p>
        </div>
      )}
      {hasOriginal && (
        <button
          type="button"
          className="bubble-toggle"
          aria-expanded={showOriginal}
          onClick={() => setShowOriginal(!showOriginal)}
        >
          {t(lang, showOriginal ? 'loan.hideOriginal' : 'loan.showOriginal')}
        </button>
      )}
    </li>
  );
}
