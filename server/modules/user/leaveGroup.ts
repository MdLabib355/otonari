// Leaving the neighborhood. Not in userModel.ts, because it also needs the items and the loans.

import { transaction } from '../../core/database.ts';
import { listItemsOf } from '../item/itemModel.ts';
import { removeItem } from '../item/removeItem.ts';
import { cancelLoan, listPendingRequestsOf } from '../loan/loanModel.ts';
import { markLeft } from './userModel.ts';

export async function leaveGroup(userId: number) {
  await transaction(async () => {
    // My items leave the shelf, and whoever was waiting for one of them gets a polite no.
    for (const item of await listItemsOf(userId)) {
      if (item.status === 'available') await removeItem(item.id);
    }
    // My own requests are cancelled.
    for (const loan of await listPendingRequestsOf(userId)) await cancelLoan(loan);

    await markLeft(userId);
  });
}
