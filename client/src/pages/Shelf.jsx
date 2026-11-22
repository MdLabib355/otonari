import { t } from '../i18n/index.js';

// Placeholder: the group shelf is built in Step 3.
export default function Shelf({ lang }) {
  return (
    <section>
      <h1>{t(lang, 'nav.shelf')}</h1>
      <p className="placeholder">/</p>
    </section>
  );
}
