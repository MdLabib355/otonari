import { t } from '../i18n/index.js';

// Placeholder: the join screen (reads ?code= from the URL) is built in Step 2.
export default function Join({ lang }) {
  return (
    <section>
      <h1>{t(lang, 'join.title')}</h1>
      <p className="placeholder">/join</p>
    </section>
  );
}
