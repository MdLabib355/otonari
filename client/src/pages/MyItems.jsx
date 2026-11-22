import { t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// Placeholder: listing and adding my items is built in Step 3.
export default function MyItems() {
  const { lang } = useUser();
  return (
    <section>
      <h1>{t(lang, 'myItems.title')}</h1>
      <p className="placeholder">/my-items</p>
    </section>
  );
}
