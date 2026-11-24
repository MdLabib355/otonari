// For the /loans/:id routes: loads the loan into req.loan and checks that I am its 'lender', its
// 'borrower', or (for 'participant') either of them.

import type { NextFunction, Request, Response } from 'express';
import { findLoan } from './loanModel.ts';

export function loanRole(role: 'lender' | 'borrower' | 'participant') {
  return (req: Request, res: Response, next: NextFunction) => {
    const loan = findLoan(Number(req.params.id));
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    const iAmLender = loan.lender_id === req.user.id;
    const iAmBorrower = loan.borrower_id === req.user.id;
    const allowed = role === 'lender' ? iAmLender : role === 'borrower' ? iAmBorrower : iAmLender || iAmBorrower;
    if (!allowed) {
      return res.status(403).json({ error: `Only the ${role} can do this` });
    }
    req.loan = loan;
    next();
  };
}
