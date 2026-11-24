import TipCard from '../../components/TipCard.tsx';
import { t } from '../../i18n/index.ts';
import type { StepProps } from './loanProps.ts';
import PhotoCapture from './PhotoCapture.tsx';

// Accepted: the lender photographs the item, then the borrower confirms they have it.
export default function HandoverStep({ loan, iAmLender, otherName, lang, busy, act, sendPhoto }: StepProps) {
  if (iAmLender) {
    if (loan.handover_photo) return null; // now it's the borrower's turn
    return (
      <div className="step">
        <p className="label">{t(lang, 'loan.handoverStep')}</p>
        <PhotoCapture lang={lang} busy={busy} onSend={(file) => sendPhoto('handover', file)} />
      </div>
    );
  }

  if (!loan.handover_photo) return <p className="notice">{t(lang, 'loan.waitHandover', { name: otherName })}</p>;
  return (
    <div className="step">
      <TipCard lang={lang} tipKey="atHandover" />
      <button type="button" className="button-primary" disabled={busy} onClick={() => act('received')}>
        {t(lang, 'loan.confirmReceived')}
      </button>
    </div>
  );
}
