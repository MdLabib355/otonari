import { t } from '../i18n/index.js';

// Placeholder: listing and adding my items is built in Step 3.
export default function MyItems({ lang }) {
  return (
    <section>
      <h1>{t(lang, 'myItems.title')}</h1>
      <p className="placeholder">/my-items</p>
    </section>
  );
}
