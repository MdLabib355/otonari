import type { Me } from '../../../../shared/types.ts';
import Avatar from '../../components/Avatar.tsx';
import ImageEditor from '../../components/ImageEditor.tsx';
import { useUser } from '../../core/UserContext.ts';

// My profile photo.
export default function AvatarEditor() {
  const { user, setMe } = useUser();
  const avatar = user?.avatar ?? null;
  return (
    <ImageEditor<Me>
      path="/me/avatar"
      picture={<Avatar url={avatar} large />}
      hasImage={avatar !== null}
      onSaved={setMe}
    />
  );
}
