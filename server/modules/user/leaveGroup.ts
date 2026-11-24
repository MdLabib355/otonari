// Leaving the neighborhood. Not in userModel.ts, because it also needs the items and the loans.

import { db } from '../../core/database.ts';
import { listItemsOf } from '../item/itemModel.ts';
import { removeItem } from '../item/removeItem.ts';
import { cancelLoan, listPendingRequestsOf } from '../loan/loanModel.ts';
import { markLeft } from './userModel.ts';

export const leaveGroup = db.transaction((userId: number) => {
  // My items leave the shelf, and whoever was waiting for one of them gets a polite no.
  for (const item of listItemsOf(userId)) {
    if (item.status === 'available') removeItem(item.id);
  }
  // My own requests are cancelled.
  for (const loan of listPendingRequestsOf(userId)) cancelLoan(loan);

  markLeft(userId);
});
