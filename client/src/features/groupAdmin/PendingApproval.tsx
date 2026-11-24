import { useEffect } from 'react';
import type { Me } from '../../../../shared/types.ts';
import SpeakButton from '../../components/SpeakButton.tsx';
import { api } from '../../core/api.ts';
import { useMember } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';

// Shown when a building requires Group Admin approval; polls /me and unlocks automatically once approved.
export default function PendingApproval() {
  const { group, lang, setMe, logout } = useMember();

  useEffect(() => {
    const timer = setInterval(() => {
      api
        .get<Me>('/me')
        .then(setMe)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [setMe]);

  const title = t(lang, 'groupAdmin.waitingTitle');
  const body = t(lang, 'groupAdmin.waitingBody', { group: group.name });

  return (
    <section className="narrow-page surface-card">
      <div className="ga-card-top">
        <h1>{title}</h1>
        <SpeakButton lang={lang} text={`${title}\n${body}`} />
      </div>
      <p>{body}</p>
      <div className="actions">
        <button type="button" className="button-secondary" onClick={logout}>
          {t(lang, 'common.back')}
        </button>
      </div>
    </section>
  );
}
