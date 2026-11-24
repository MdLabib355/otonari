// Leaving the neighborhood. Not in userModel.ts, because it also needs the items and the loans.

import { transaction } from '../../core/database.ts';
import { listItemsOf } from '../item/itemModel.ts';
import { removeItem } from '../item/removeItem.ts';
import { cancelLoan, listPendingRequestsOf } from '../loan/loanModel.ts';
import { clearGroup, listMembers, setRole } from './userModel.ts';

export async function leaveGroup(userId: number, groupId: number) {
  await transaction(async () => {
    // Their items leave the shelf, and whoever was waiting for one of them gets a polite no.
    for (const item of await listItemsOf(userId)) {
      if (item.status === 'available') await removeItem(item.id);
    }
    // Their own requests are cancelled.
    for (const loan of await listPendingRequestsOf(userId)) await cancelLoan(loan);

    await clearGroup(userId);

    // A group always has an admin: if it was the last one, the longest-standing member takes over.
    const members = await listMembers(groupId);
    if (members.length > 0 && members.every((member) => member.role === 'user')) {
      await setRole(members[0].id, 'group_admin');
    }
  });
}
