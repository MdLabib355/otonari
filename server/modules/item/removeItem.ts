// Not in itemModel.ts, because it also needs the loans (and loanModel.ts needs itemModel.ts).

import { transaction } from '../../core/database.ts';
import { declinePendingLoans } from '../loan/loanModel.ts';
import { markRemoved } from './itemModel.ts';

// Take the item off the shelf, and politely decline anyone still waiting for an answer.
export async function removeItem(itemId: number) {
  await transaction(async () => {
    await markRemoved(itemId);
    await declinePendingLoans(itemId);
  });
}
