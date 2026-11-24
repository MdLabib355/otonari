import type { User } from '../../../shared/types.ts';
import type { UiKey } from '../i18n/index.ts';
import { BoxIcon, LoansIcon, SettingsIcon, ShelfIcon, ShieldIcon } from '../components/Icons.tsx';

export interface NavTab {
  to: string;
  Icon: typeof BoxIcon;
  label: UiKey;
}

// Base resident tabs; Group Admins and Co-Admins also see the conditional Manage tab.
export const NAV_TABS: NavTab[] = [
  { to: '/', Icon: ShelfIcon, label: 'nav.shelf' },
  { to: '/my-items', Icon: BoxIcon, label: 'nav.myItems' },
  { to: '/loans', Icon: LoansIcon, label: 'nav.loans' },
  { to: '/settings', Icon: SettingsIcon, label: 'nav.settings' },
];

export function navTabsFor(user?: User): NavTab[] {
  if (user && (user.group_role === 'group_admin' || user.group_role === 'co_admin')) {
    return [
      NAV_TABS[0],
      NAV_TABS[1],
      NAV_TABS[2],
      { to: '/group-admin', Icon: ShieldIcon, label: 'nav.manage' },
      NAV_TABS[3],
    ];
  }
  return NAV_TABS;
}
