import { UserIcon } from './Icons.tsx';

// A profile photo, or an icon if there is none. The name is always written next to it.
export default function Avatar({ url, large = false }: { url: string | null; large?: boolean }) {
  const className = large ? 'avatar avatar-large' : 'avatar';
  if (url) return <img className={className} src={url} alt="" />;
  return (
    <span className={className}>
      <UserIcon />
    </span>
  );
}
