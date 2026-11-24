import type { UiKey } from '../i18n/index.ts';
import { BoxIcon, LoansIcon, SettingsIcon, ShelfIcon } from '../components/Icons.tsx';

// The four pages of the app: in the header on wide screens, at the bottom on phones.
export const NAV_TABS: { to: string; Icon: typeof BoxIcon; label: UiKey }[] = [
  { to: '/', Icon: ShelfIcon, label: 'nav.shelf' },
  { to: '/my-items', Icon: BoxIcon, label: 'nav.myItems' },
  { to: '/loans', Icon: LoansIcon, label: 'nav.loans' },
  { to: '/settings', Icon: SettingsIcon, label: 'nav.settings' },
];
