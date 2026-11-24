// Items as the client sees them: 0 / 1 → false / true.

import type { ItemDetails, MyItem, ShelfItem } from '../../../shared/types.ts';
import type { Stored, StoredDetails } from './itemModel.ts';

export function myItemView(item: Stored<MyItem>): MyItem {
  return { ...item, trusted_only: item.trusted_only === 1 };
}

export function shelfItemView(item: Stored<ShelfItem>): ShelfItem {
  return { ...item, trusted_only: item.trusted_only === 1 };
}

export function itemDetailsView(item: StoredDetails, myLoanId: number | null, allowedForMe: boolean): ItemDetails {
  return { ...item, trusted_only: item.trusted_only === 1, my_loan_id: myLoanId, allowed_for_me: allowedForMe };
}
