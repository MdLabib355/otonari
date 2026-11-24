import express from 'express';
import {
  accept,
  askAdminHelp,
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
import { storePhoto } from '../../core/photoFiles.ts';
import { receivePhoto } from '../../core/receivePhoto.ts';

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
router.post('/loans/:id/help', write(requireMember, loanRole('participant'), askAdminHelp));

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
