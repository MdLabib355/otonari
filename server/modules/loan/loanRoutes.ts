//   GET    /api/v1/loans                        user          my loans: { borrowing: [...], lending: [...] }
//   POST   /api/v1/loans                        borrower      { item_id, start_at, end_at } → new pending loan
//   GET    /api/v1/loans/:id                    participant   the loan, its item, both people and the messages
//   POST   /api/v1/loans/:id/accept             lender        pending → accepted (item reserved)
//   POST   /api/v1/loans/:id/decline            lender        { reason: 'default' | 'busy' } pending → declined
//   POST   /api/v1/loans/:id/cancel             borrower      pending → cancelled
//   POST   /api/v1/loans/:id/handover-photo     lender        photo (multipart) → the item's condition before
//   POST   /api/v1/loans/:id/confirm-handover   borrower      accepted + handover photo → active (item lent)
//   POST   /api/v1/loans/:id/return-photo       borrower      photo (multipart) → the item's condition after
//   POST   /api/v1/loans/:id/confirm-return     lender        active + return photo → returned (item available)
//   POST   /api/v1/loans/:id/messages           participant   { phrase_key } one of the five fixed quick replies
// Every step also sends the matching phrase to the other person (CLAUDE.md section 6).

import express from 'express';
import {
  accept,
  askAdminHelp,
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
import { requireActiveMember, requireUser } from '../../core/auth.ts';
import { check, read, write } from '../../core/http.ts';
import { loanRole } from './loanRole.ts';
import { receivePhoto } from './receivePhoto.ts';

const router = express.Router();

router.get('/loans', read(requireUser, requireActiveMember, showMyLoans));
router.post('/loans', write(requireUser, requireActiveMember, requestLoan));
router.get('/loans/:id', read(requireUser, requireActiveMember, loanRole('participant'), showLoan));

router.post('/loans/:id/accept', write(requireUser, requireActiveMember, loanRole('lender'), accept));
router.post('/loans/:id/decline', write(requireUser, requireActiveMember, loanRole('lender'), decline));
router.post('/loans/:id/cancel', write(requireUser, requireActiveMember, loanRole('borrower'), cancel));
router.post('/loans/:id/confirm-handover', write(requireUser, requireActiveMember, loanRole('borrower'), received));
router.post('/loans/:id/confirm-return', write(requireUser, requireActiveMember, loanRole('lender'), returnConfirmed));
router.post('/loans/:id/messages', write(requireUser, requireActiveMember, loanRole('participant'), quickReply));
router.post('/loans/:id/help', write(requireUser, requireActiveMember, loanRole('participant'), askAdminHelp));

// Uploads can be slow, so the loan is loaded and checked AFTER the photo has arrived: its status may
// have changed in the meantime.
router.post('/loans/:id/handover-photo', check(requireUser), check(requireActiveMember), receivePhoto, write(requireUser, requireActiveMember, loanRole('lender'), handover));
router.post('/loans/:id/return-photo', check(requireUser), check(requireActiveMember), receivePhoto, write(requireUser, requireActiveMember, loanRole('borrower'), giveBack));

export default router;
