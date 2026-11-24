// Group Admin API routes mounted under /api/v1/group-admin.
// Every route resolves group_id strictly from the authenticated admin's session (req.user.group_id).

import express from 'express';
import { requireGroupAdmin, requirePrimaryGroupAdmin } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';
import {
  approveMember,
  listMembers,
  rejectMember,
  removeMember,
  rotateInviteCode,
  setMemberRole,
  setMemberStatus,
  setMemberTrust,
  showDashboard,
  updateSettings,
} from './groupAdminController.ts';

const router = express.Router();

router.get('/group-admin/dashboard', read(requireGroupAdmin, showDashboard));
router.get('/group-admin/members', read(requireGroupAdmin, listMembers));
router.post('/group-admin/members/:userId/approve', write(requireGroupAdmin, approveMember));
router.post('/group-admin/members/:userId/reject', write(requireGroupAdmin, rejectMember));
router.patch('/group-admin/members/:userId/trust', write(requireGroupAdmin, setMemberTrust));
router.patch('/group-admin/members/:userId/status', write(requireGroupAdmin, setMemberStatus));
router.patch('/group-admin/members/:userId/role', write(requirePrimaryGroupAdmin, setMemberRole));
router.delete('/group-admin/members/:userId', write(requireGroupAdmin, removeMember));
router.patch('/group-admin/settings', write(requireGroupAdmin, updateSettings));
router.post('/group-admin/invite-code/rotate', write(requireGroupAdmin, rotateInviteCode));

export default router;
