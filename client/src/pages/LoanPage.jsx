import { useLocation, useParams } from 'react-router-dom';
import { displayName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// Placeholder: messages, answers, photos and reminders are built in Steps 5–7.
export default function LoanPage() {
  const { lang } = useUser();
  const { id } = useParams();
  const { state } = useLocation(); // { sentTo } right after sending a request from the item page
  return (
    <section>
      {state?.sentTo && (
        <p className="notice">{t(lang, 'borrow.sent', { name: displayName(lang, state.sentTo) })}</p>
      )}
      <h1>{t(lang, 'loans.title')}</h1>
      <p className="placeholder">/loan/{id}</p>
    </section>
  );
}
