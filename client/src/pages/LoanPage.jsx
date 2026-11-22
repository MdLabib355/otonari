import { useParams } from 'react-router-dom';
import { t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// Placeholder: messages, answers, photos and reminders are built in Steps 5–7.
export default function LoanPage() {
  const { lang } = useUser();
  const { id } = useParams();
  return (
    <section>
      <h1>{t(lang, 'loans.title')}</h1>
      <p className="placeholder">/loan/{id}</p>
    </section>
  );
}
