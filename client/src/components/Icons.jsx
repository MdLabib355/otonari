// Heroicons v2 UI chrome icons (outline 24px + solid 20px for tiny badges).
// Keeps 28 household catalog items and Japanese thank-you stamps as warm emojis.

import {
  ArchiveBoxIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowsRightLeftIcon,
  BellIcon as HeroBellIcon,
  BuildingOffice2Icon,
  BuildingStorefrontIcon,
  CameraIcon as HeroCameraIcon,
  CheckIcon as HeroCheckIcon,
  ClipboardDocumentIcon,
  ClockIcon as HeroClockIcon,
  Cog6ToothIcon,
  DevicePhoneMobileIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  HomeModernIcon,
  KeyIcon as HeroKeyIcon,
  LightBulbIcon,
  LockClosedIcon as HeroLockClosedIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PauseCircleIcon,
  PencilSquareIcon,
  PlusIcon as HeroPlusIcon,
  SpeakerWaveIcon,
  UserCircleIcon,
  UsersIcon as HeroUsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { LockClosedIcon as SolidLockClosedIcon } from '@heroicons/react/20/solid';

function wrap(Component, baseClass = 'icon') {
  return function WrappedIcon({ className = '', ...props }) {
    return <Component className={className ? `${baseClass} ${className}` : baseClass} aria-hidden="true" {...props} />;
  };
}

export const ShelfIcon = wrap(BuildingStorefrontIcon);
export const BoxIcon = wrap(ArchiveBoxIcon);
export const LoansIcon = wrap(ArrowsRightLeftIcon);
export const SettingsIcon = wrap(Cog6ToothIcon);
export const BellIcon = wrap(HeroBellIcon);
export const SpeakerIcon = wrap(SpeakerWaveIcon);
export const CameraIcon = wrap(HeroCameraIcon);
export const LockIcon = wrap(HeroLockClosedIcon);
export const LockSolidIcon = wrap(SolidLockClosedIcon, 'icon icon-sm');
export const PinIcon = wrap(MapPinIcon);
export const WarningIcon = wrap(ExclamationTriangleIcon);
export const ClockIcon = wrap(HeroClockIcon);
export const CheckIcon = wrap(HeroCheckIcon);
export const PauseIcon = wrap(PauseCircleIcon);
export const EditIcon = wrap(PencilSquareIcon);
export const RefreshIcon = wrap(ArrowPathIcon);
export const KeyIcon = wrap(HeroKeyIcon);
export const SearchIcon = wrap(MagnifyingGlassIcon);
export const BuildingIcon = wrap(BuildingOffice2Icon);
export const BlockIcon = wrap(HomeModernIcon);
export const TipIcon = wrap(LightBulbIcon);
export const ArrowLeftIconWrapped = wrap(ArrowLeftIcon);
export const ArrowRightIconWrapped = wrap(ArrowRightIcon);
export const PlusIcon = wrap(HeroPlusIcon);
export const CloseIcon = wrap(XMarkIcon);
export const UsersIcon = wrap(HeroUsersIcon);
export const PhoneIcon = wrap(DevicePhoneMobileIcon);
export const NoteIcon = wrap(DocumentTextIcon);
export const CopyIcon = wrap(ClipboardDocumentIcon);
export const UserIcon = wrap(UserCircleIcon);
