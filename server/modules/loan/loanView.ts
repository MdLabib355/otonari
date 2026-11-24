// Everything the loan page needs, from the viewer's side.

import type { LoanDetails } from '../../../shared/types.ts';
import { getLoanItem } from '../item/itemModel.ts';
import { getLoan } from './loanModel.ts';
import { listLoanMessages } from '../message/messageModel.ts';
import { getPerson, trustOf } from '../user/userModel.ts';

export function loanDetailsView(loanId: number, viewerId: number): LoanDetails {
  const loan = getLoan(loanId);
  return {
    loan,
    item: getLoanItem(loan.item_id),
    borrower: getPerson(loan.borrower_id),
    lender: getPerson(loan.lender_id),
    borrower_trust: viewerId === loan.lender_id ? trustOf(loan.borrower_id) : null, // only for the lender
    messages: listLoanMessages(loanId, viewerId).map((message) => ({
      ...message,
      params: JSON.parse(message.params),
    })),
  };
}
