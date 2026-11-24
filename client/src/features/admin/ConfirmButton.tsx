import { useState } from 'react';
import { useUser } from '../../core/UserContext.ts';
import { t } from '../../i18n/index.ts';

const DOUBLE_TAP_MS = 500;

// For what can't be undone: takes two separate taps; an accidental double tap doesn't count.
export default function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const { lang } = useUser();
  const [tappedAt, setTappedAt] = useState<number | null>(null);

  function tap() {
    if (tappedAt === null) {
      setTappedAt(Date.now());
    } else if (Date.now() - tappedAt > DOUBLE_TAP_MS) {
      setTappedAt(null);
      onConfirm();
    }
  }

  return (
    <button
      type="button"
      className={tappedAt === null ? 'button-secondary' : 'button-secondary button-danger'}
      onClick={tap}
      onBlur={() => setTappedAt(null)}
    >
      {tappedAt === null ? label : t(lang, 'admin.tapAgain')}
    </button>
  );
}
