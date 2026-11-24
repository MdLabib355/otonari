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
  canGiveBack,
  canHandOver,
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
import { requireMember } from '../../core/auth.ts';
import { check, read, write } from '../../core/http.ts';
import { loanRole } from './loanRole.ts';
import { storePhoto } from './photoFiles.ts';
import { receivePhoto } from './receivePhoto.ts';

const router = express.Router();

router.get('/loans', read(requireMember, showMyLoans));
router.post('/loans', write(requireMember, requestLoan));
router.get('/loans/:id', read(requireMember, loanRole('participant'), showLoan));

router.post('/loans/:id/accept', write(requireMember, loanRole('lender'), accept));
router.post('/loans/:id/decline', write(requireMember, loanRole('lender'), decline));
router.post('/loans/:id/cancel', write(requireMember, loanRole('borrower'), cancel));
router.post('/loans/:id/confirm-handover', write(requireMember, loanRole('borrower'), received));
router.post('/loans/:id/confirm-return', write(requireMember, loanRole('lender'), returnConfirmed));
router.post('/loans/:id/messages', write(requireMember, loanRole('participant'), quickReply));

// Uploads can be slow, so everything is checked AFTER the photo has arrived: the loan may have changed in the
// meantime. And again in the transaction, after the photo has been stored.
const handoverSteps = [requireMember, loanRole('lender'), canHandOver];
const returnSteps = [requireMember, loanRole('borrower'), canGiveBack];

router.post(
  '/loans/:id/handover-photo',
  check(requireMember),
  receivePhoto,
  check(...handoverSteps),
  storePhoto,
  write(...handoverSteps, handover)
);
router.post(
  '/loans/:id/return-photo',
  check(requireMember),
  receivePhoto,
  check(...returnSteps),
  storePhoto,
  write(...returnSteps, giveBack)
);

export default router;
