import { useEffect, useState } from 'react';
import type { Lang } from '../../../../shared/types.ts';
import { api } from '../../core/api.ts';
import { t } from '../../i18n/index.ts';

// Demo mode only: jump to the moments when reminders are sent, instead of waiting for days.
export default function DemoButtons({ loanId, lang, onDone }: { loanId: number; lang: Lang; onDone: () => void }) {
  const [demoMode, setDemoMode] = useState(false);

  // The demo routes only exist in demo mode, so an answer means it is on (like on the join page).
  useEffect(() => {
    api
      .get('/demo/users')
      .then(() => setDemoMode(true))
      .catch(() => setDemoMode(false));
  }, []);

  async function fastForward(to: 'dueSoon' | 'overdue') {
    try {
      await api.post(`/demo/loans/${loanId}/fast-forward`, { to });
    } catch {
      // E.g. the item was returned in the meantime: reloading the loan shows what happened.
    }
    onDone();
  }

  if (!demoMode) return null;
  return (
    <div className="demo-buttons">
      <button type="button" onClick={() => fastForward('dueSoon')}>
        {t(lang, 'loan.demoDueSoon')}
      </button>
      <button type="button" onClick={() => fastForward('overdue')}>
        {t(lang, 'loan.demoOverdue')}
      </button>
    </div>
  );
}
