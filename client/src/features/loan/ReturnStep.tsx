import TipCard from '../../components/TipCard.tsx';
import { t } from '../../i18n/index.ts';
import type { StepProps } from './loanProps.ts';
import PhotoCapture from './PhotoCapture.tsx';

// Borrowed: the borrower photographs the item when returning it, then the lender confirms.
export default function ReturnStep({ loan, iAmLender, otherName, lang, busy, act, sendPhoto }: StepProps) {
  if (!iAmLender) {
    if (loan.return_photo) return null; // now it's the lender's turn
    return (
      <div className="step">
        <TipCard lang={lang} tipKey="atReturn" />
        <p className="label">{t(lang, 'loan.returnStep')}</p>
        <PhotoCapture lang={lang} busy={busy} onSend={(file) => sendPhoto('return-photo', file)} />
      </div>
    );
  }

  if (!loan.return_photo) return <p className="notice">{t(lang, 'loan.waitReturn', { name: otherName })}</p>;
  return (
    <div className="step">
      <button type="button" className="button-primary" disabled={busy} onClick={() => act('confirm-return')}>
        {t(lang, 'loan.confirmReturn')}
      </button>
    </div>
  );
}
