// One item as the client sees it: with what it means for the person who looks at it.

import type { ItemDetails } from '../../../shared/types.ts';
import type { ItemWithOwner } from './itemModel.ts';

export function itemDetailsView(item: ItemWithOwner, myLoanId: number | null, allowedForMe: boolean): ItemDetails {
  return { ...item, my_loan_id: myLoanId, allowed_for_me: allowedForMe };
}
