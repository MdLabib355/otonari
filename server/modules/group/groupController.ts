// Looking up and starting neighborhoods.

import type { Request, Response } from 'express';
import { GROUP_TYPES, isOneOf } from '../../core/allowedKeys.ts';
import { createGroup, findGroupByCode, findSimilarGroup } from './groupModel.ts';
import { countMembers } from '../user/userModel.ts';
import { groupPreviewView, newGroupView } from './groupView.ts';

export function previewGroup(req: Request, res: Response) {
  const group = findGroupByCode(req.params.code);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  res.json(groupPreviewView(group, countMembers(group.id)));
}

// Anything that isn't text (missing, a number, ...) counts as empty.
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Start a new neighborhood: for a building manager or a neighborhood association leader.
export function startGroup(req: Request, res: Response) {
  const { type, create_anyway }: Record<string, unknown> = req.body ?? {};
  const name = trimmed(req.body?.name);
  const city = trimmed(req.body?.city);

  if (name.length < 1 || name.length > 60 || city.length < 1 || city.length > 40) {
    return res.status(400).json({ error: 'The name must be 1 to 60 characters, the city 1 to 40' });
  }
  if (!isOneOf(GROUP_TYPES, type)) {
    return res.status(400).json({ error: "type must be 'building' or 'block'" });
  }

  // Tell only the name of the similar group, never its code: codes are for people who see the poster.
  const similar = findSimilarGroup(name, city);
  if (similar && create_anyway !== true) {
    return res.status(409).json({ error: 'There is a similar group in this city', existing_name: similar.name });
  }

  const code = createGroup(name, type, city);
  res.status(201).json(newGroupView({ code, name, type, city }));
}
