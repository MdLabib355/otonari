import { useParams } from 'react-router-dom';
import { t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// Placeholder: the borrow request with the live preview is built in Step 4.
export default function ItemPage() {
  const { lang } = useUser();
  const { id } = useParams();
  return (
    <section>
      <h1>{t(lang, 'borrow.send')}</h1>
      <p className="placeholder">/item/{id}</p>
    </section>
  );
}
