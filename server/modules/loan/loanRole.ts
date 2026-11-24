// A step of the /loans/:id routes: loads the loan into req.loan and checks that I am its 'lender', its
// 'borrower', or (for 'participant') either of them.

import type { Request } from 'express';
import { refuse, toId } from '../../core/http.ts';
import { findLoan } from './loanModel.ts';

export function loanRole(role: 'lender' | 'borrower' | 'participant') {
  return async (req: Request) => {
    const loan = await findLoan(toId(req.params.id));
    if (!loan) return refuse(404, 'Loan not found');

    const iAmLender = loan.lender_id === req.user.id;
    const iAmBorrower = loan.borrower_id === req.user.id;
    const allowed = role === 'lender' ? iAmLender : role === 'borrower' ? iAmBorrower : iAmLender || iAmBorrower;
    if (!allowed) return refuse(403, `Only the ${role} can do this`);

    req.loan = loan;
    return null;
  };
}
