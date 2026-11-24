//   GET  /api/v1/loans                   user          my loans: { borrowing: [...], lending: [...] }
//   POST /api/v1/loans                   borrower      { item_id, start_at, end_at } → new pending loan
//   GET  /api/v1/loans/:id               participant   the loan, its item, both people and the messages
//   POST /api/v1/loans/:id/accept        lender        pending → accepted (item reserved)
//   POST /api/v1/loans/:id/decline       lender        { reason: 'default' | 'busy' } pending → declined
//   POST /api/v1/loans/:id/cancel        borrower      pending → cancelled
//   POST /api/v1/loans/:id/handover      lender        photo (multipart) → the item's condition before
//   POST /api/v1/loans/:id/received      borrower      accepted + handover photo → active (item lent)
//   POST /api/v1/loans/:id/return        borrower      photo (multipart) → the item's condition after
//   POST /api/v1/loans/:id/return-confirmed  lender    active + return photo → returned (item available)
//   POST /api/v1/loans/:id/quick-reply   participant   { phrase_key } one of the five fixed quick replies
// Every step also sends the matching phrase to the other person (CLAUDE.md section 6).

import express from 'express';
import {
  accept,
  cancel,
  decline,
  giveBack,
  handover,
  quickReply,
  received,
  requestLoan,
  returnConfirmed,
  showLoan,
  showMyLoans,
} from './loanController.ts';
import { requireUser } from '../../core/auth.ts';
import { loanRole } from './loanRole.ts';
import { receivePhoto } from './receivePhoto.ts';

const router = express.Router();

router.get('/loans', requireUser, showMyLoans);
router.post('/loans', requireUser, requestLoan);
router.get('/loans/:id', requireUser, loanRole('participant'), showLoan);

router.post('/loans/:id/accept', requireUser, loanRole('lender'), accept);
router.post('/loans/:id/decline', requireUser, loanRole('lender'), decline);
router.post('/loans/:id/cancel', requireUser, loanRole('borrower'), cancel);
router.post('/loans/:id/received', requireUser, loanRole('borrower'), received);
router.post('/loans/:id/return-confirmed', requireUser, loanRole('lender'), returnConfirmed);
router.post('/loans/:id/quick-reply', requireUser, loanRole('participant'), quickReply);

// Uploads can be slow, so the loan is loaded and checked AFTER the photo has arrived: its status may
// have changed in the meantime.
router.post('/loans/:id/handover', requireUser, receivePhoto, loanRole('lender'), handover);
router.post('/loans/:id/return', requireUser, receivePhoto, loanRole('borrower'), giveBack);

export default router;
