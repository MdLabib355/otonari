import { useState } from 'react';
import type { Lang, Message, Person } from '../../../../shared/types.ts';
import { displayName, meta, renderPhrase, t } from '../../i18n/index.ts';
import { BellIcon } from '../../components/Icons.tsx';
import SpeakButton from '../../components/SpeakButton.tsx';

// One message of a loan, in MY language. Messages are stored as phrase_key + params, so the same
// message can be rendered in any language at any time.
//   mine → right, theirs → left, system reminders (no sender) → centered with a bell
// "Show original" renders the same phrase in the sender's language, which proves that both sides
// saw the same meaning. It is hidden when that would be the identical text (my own messages, and
// neighbors who use the same language as me).
interface Props {
  message: Message;
  lang: Lang;
  myId: number;
  other: Person;
}

export default function PhraseBubble({ message, lang, myId, other }: Props) {
  const [showOriginal, setShowOriginal] = useState(false);

  const isSystem = message.from_user_id === null;
  const isMine = message.from_user_id === myId;
  // The sender's language, if "Show original" makes sense for this message.
  const originalLang = !isMine && message.from_lang !== lang ? message.from_lang : null; // null for reminders
  const text = renderPhrase(lang, message.phrase_key, message.params);

  let side = 'theirs';
  if (isMine) side = 'mine';
  if (isSystem) side = 'system';

  return (
    <li className={`bubble bubble-${side}`}>
      {isSystem && (
        <p className="bubble-label inline-icon-text">
          <BellIcon className="icon-sm" /> {t(lang, 'loan.system')}
        </p>
      )}
      <div className="bubble-main">
        <p className="bubble-text">{text}</p>
        <SpeakButton lang={lang} text={text} />
      </div>

      {originalLang && showOriginal && (
        <div className="bubble-original">
          <p className="bubble-label">
            {t(lang, 'loan.originalIn', {
              name: displayName(lang, other.nickname),
              language: meta(originalLang).name,
            })}
          </p>
          <p className="bubble-text" lang={originalLang === 'ja-easy' ? 'ja' : originalLang}>
            {renderPhrase(originalLang, message.phrase_key, message.params)}
          </p>
        </div>
      )}
      {originalLang && (
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
