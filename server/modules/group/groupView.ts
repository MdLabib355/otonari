// What the client may see about groups.

import type { Group, GroupPreview } from '../../../shared/types.ts';

// For the join page and the poster: without the code.
export function groupPreviewView(group: Group, memberCount: number): GroupPreview {
  return {
    name: group.name,
    type: group.type,
    city: group.city,
    image: group.image,
    member_count: memberCount,
    join_policy: group.join_policy,
    lifecycle_status: group.lifecycle_status,
  };
}
