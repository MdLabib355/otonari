// What the client may see about groups.

import type { Group, GroupPreview, NewGroupAnswer } from '../../../shared/types.ts';

// For the join page and the poster: without the code.
export function groupPreviewView(group: Group, memberCount: number): GroupPreview {
  return {
    name: group.name,
    type: group.type,
    city: group.city,
    member_count: memberCount,
    join_policy: group.join_policy,
    lifecycle_status: group.lifecycle_status,
  };
}

export function newGroupView({ code, name, type, city }: NewGroupAnswer): NewGroupAnswer {
  return { code, name, type, city };
}
