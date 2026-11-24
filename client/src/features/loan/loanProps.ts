// Types shared by the parts of the loan page.

import type { Lang, Loan } from '../../../../shared/types.ts';

// Sends an action ('accept', 'received', ...) for this loan.
export type Act = (action: string, body?: object) => void;

// What the handover step and the return step need.
export interface StepProps {
  loan: Loan;
  iAmLender: boolean;
  otherName: string;
  lang: Lang;
  busy: boolean;
  act: Act;
  sendPhoto: (action: 'handover' | 'return', file: Blob) => void;
}
