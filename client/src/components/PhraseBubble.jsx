import { useState } from 'react';
import { displayName, meta, renderPhrase, t } from '../i18n/index.js';
import { BellIcon } from './Icons.jsx';
import SpeakButton from './SpeakButton.jsx';

// One message of a loan, rendered dynamically in MY language.
// Supports mine/theirs/system bubbles, warm thank-you stamps, inline issue photos, and "Show original".
export default function PhraseBubble({ message, lang, myId, other }) {
  const [showOriginal, setShowOriginal] = useState(false);

  const isSystem = message.from_user_id === null;
  const isMine = message.from_user_id === myId;
  const isStamp = message.phrase_key.startsWith('stamp.');
  const isIssue = message.phrase_key.startsWith('issue.');
  const hasOriginal = !isSystem && !isMine && message.from_lang !== lang;
  const text = renderPhrase(lang, message.phrase_key, message.params);
  const attachedPhoto = message.params?.photo || null;

  let side = 'theirs';
  if (isMine) side = 'mine';
  if (isSystem) side = 'system';

  const extraClass = isStamp ? ' bubble-stamp' : isIssue ? ' bubble-issue' : '';

  return (
    <li className={`bubble bubble-${side}${extraClass}`}>
      {isSystem && (
        <p className="bubble-label inline-icon-text" style={{ justifyContent: 'center' }}>
          <BellIcon className="icon-sm" /> {t(lang, 'loan.system')}
        </p>
      )}
      <div className="bubble-main">
        <p className="bubble-text">{text}</p>
        <SpeakButton lang={lang} text={text} />
      </div>

      {attachedPhoto && <img className="bubble-photo" src={attachedPhoto} alt="" loading="lazy" />}

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
