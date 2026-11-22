import { t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// Placeholder: the group shelf is built in Step 3.
export default function Shelf() {
  const { lang, group } = useUser();
  return (
    <section>
      <h1>{t(lang, 'shelf.title', { group: group.name })}</h1>
      <p className="placeholder">/</p>
    </section>
  );
}
