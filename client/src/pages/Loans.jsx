import { t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// Placeholder: the borrowing / lending lists are built in Step 5.
export default function Loans() {
  const { lang } = useUser();
  return (
    <section>
      <h1>{t(lang, 'loans.title')}</h1>
      <p className="placeholder">/loans</p>
    </section>
  );
}
