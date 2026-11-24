// Types shared by the parts of the loan page.

import type { Lang, Loan } from '../../../../shared/types.ts';

// POST /api/v1/loans/:id/<action>, e.g. 'accept' or 'confirm-handover'.
export type Act = (action: string, body?: object) => void;

// What the handover step and the return step need.
export interface StepProps {
  loan: Loan;
  iAmLender: boolean;
  otherName: string;
  lang: Lang;
  busy: boolean;
  act: Act;
  sendPhoto: (action: 'handover-photo' | 'return-photo', file: Blob) => void;
}
