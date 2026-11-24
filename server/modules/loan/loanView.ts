// Everything the loan page needs, from the viewer's side.

import type { LoanDetails } from '../../../shared/types.ts';
import { getLoanItem } from '../item/itemModel.ts';
import { listLoanMessages } from '../message/messageModel.ts';
import { trustOf } from '../user/userModel.ts';
import { personView } from '../user/userView.ts';
import { getLoan } from './loanModel.ts';
import { photoUrl } from '../../core/photoFiles.ts';

export async function loanDetailsView(loanId: number, viewerId: number): Promise<LoanDetails> {
  const loan = await getLoan(loanId);
  return {
    loan: {
      ...loan,
      handover_photo: await photoUrl(loan.handover_photo),
      return_photo: await photoUrl(loan.return_photo),
    },
    item: await getLoanItem(loan.item_id),
    borrower: await personView(loan.borrower_id),
    lender: await personView(loan.lender_id),
    borrower_trust: viewerId === loan.lender_id ? await trustOf(loan.borrower_id) : null, // only for the lender
    messages: await listLoanMessages(loanId, viewerId),
  };
}
