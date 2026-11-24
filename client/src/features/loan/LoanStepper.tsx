import type { Lang, LoanStatus } from '../../../../shared/types.ts';
import { CheckIcon } from '../../components/Icons.tsx';
import { t } from '../../i18n/index.ts';

const STEPS = ['pending', 'accepted', 'active', 'returned'] as const;

// How far this loan is: asked → accepted → borrowed → returned. Not for declined or cancelled loans.
export default function LoanStepper({ status, lang }: { status: LoanStatus; lang: Lang }) {
  const now = STEPS.findIndex((step) => step === status);
  if (now === -1) return null;

  function stepClass(index: number) {
    if (index < now || status === 'returned') return 'stepper-step done';
    return index === now ? 'stepper-step current' : 'stepper-step';
  }

  return (
    <ol className="loan-stepper" aria-label={t(lang, `status.${status}`)}>
      {STEPS.map((step, index) => (
        <li key={step} className={stepClass(index)} aria-current={index === now ? 'step' : undefined}>
          <span className="stepper-dot" aria-hidden="true">
            {index < now || status === 'returned' ? <CheckIcon className="icon-xs" /> : index + 1}
          </span>
          {/* "Accepted — waiting for handover" is too long here: the first part is enough. */}
          <span className="stepper-label">{t(lang, `status.${step}`).split(/[—・(（]/)[0].trim()}</span>
        </li>
      ))}
    </ol>
  );
}
