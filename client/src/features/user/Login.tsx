import { Link } from 'react-router-dom';
import { useUser } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';
import DemoUsers from '../demo/DemoUsers.tsx';

// Otonari has no passwords: whoever joined on this device is logged in automatically (App.tsx), and never
// sees this page. For everyone else it explains that, and leads to the join code.
export default function Login() {
  const { lang } = useUser();

  return (
    <section className="narrow-page surface-card">
      <h1>{t(lang, 'auth.loginTitle')}</h1>
      <p className="notice">{t(lang, 'auth.noPassword')}</p>
      <p>{t(lang, 'auth.newDevice')}</p>
      <div className="actions">
        <Link to="/register" className="button-primary button-link">
          {t(lang, 'auth.useCode')}
        </Link>
      </div>
      <DemoUsers lang={lang} />
    </section>
  );
}
