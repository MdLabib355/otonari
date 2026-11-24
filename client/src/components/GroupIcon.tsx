import type { GroupType } from '../../../shared/types.ts';
import { BlockIcon, BuildingIcon } from './Icons.tsx';

interface Props {
  group: { type: GroupType; image: string | null };
  className?: string;
}

// The image of a group, or a building / block icon if it has none. The name is always written next to it.
export default function GroupIcon({ group, className = '' }: Props) {
  if (group.image) return <img className={`group-image ${className}`} src={group.image} alt="" />;
  return group.type === 'block' ? <BlockIcon className={className} /> : <BuildingIcon className={className} />;
}
