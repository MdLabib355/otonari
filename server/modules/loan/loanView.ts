// Everything the loan page needs, from the viewer's side.

import type { LoanDetails } from '../../../shared/types.ts';
import { getLoanItem } from '../item/itemModel.ts';
import { listLoanMessages } from '../message/messageModel.ts';
import { getPerson, trustOf } from '../user/userModel.ts';
import { getLoan } from './loanModel.ts';

export async function loanDetailsView(loanId: number, viewerId: number): Promise<LoanDetails> {
  const loan = await getLoan(loanId);
  return {
    loan,
    item: await getLoanItem(loan.item_id),
    borrower: await getPerson(loan.borrower_id),
    lender: await getPerson(loan.lender_id),
    borrower_trust: viewerId === loan.lender_id ? await trustOf(loan.borrower_id) : null, // only for the lender
    messages: await listLoanMessages(loanId, viewerId),
  };
}
