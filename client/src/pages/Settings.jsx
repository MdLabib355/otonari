import { t } from '../i18n/index.js';

// Placeholder: language switch, elder mode and leaving are built in Step 8.
export default function Settings({ lang }) {
  return (
    <section>
      <h1>{t(lang, 'settings.title')}</h1>
      <p className="placeholder">/settings</p>
    </section>
  );
}
