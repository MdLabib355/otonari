import { t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// Placeholder: the printable QR join poster is built in Step 10.
export default function Poster() {
  const { lang } = useUser();
  return (
    <section>
      <h1>{t(lang, 'poster.title')}</h1>
      <p className="placeholder">/poster</p>
    </section>
  );
}
