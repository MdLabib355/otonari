// Group Admin API routes mounted under /api/v1/group-admin.
// Every route resolves group_id strictly from the authenticated admin's session (req.user.group_id).

import express from 'express';
import { requireGroupAdmin } from '../../core/auth.ts';
import { check, read, write } from '../../core/http.ts';
import { deleteRefusedPhoto, storeOptionalPhoto, storePhoto } from '../../core/photoFiles.ts';
import { receiveOptionalPhoto, receivePhoto } from '../../core/receivePhoto.ts';
import {
  approveMember,
  changeImage,
  clearAnnouncement,
  listItems,
  listLoans,
  listMembers,
  moderateItem,
  nudgeLoan,
  publishAnnouncement,
  rejectMember,
  removeImage,
  removeMember,
  resolveLoan,
  rotateInviteCode,
  setMemberRole,
  setMemberStatus,
  setMemberTrust,
  showActivityLog,
  showDashboard,
  updateSettings,
} from './groupAdminController.ts';
import { approveItem, editItem, rejectItem } from './itemApproval.ts';

const router = express.Router();

// JSON, or a form with a photo of the item
const optionalPhoto = [check(requireGroupAdmin), receiveOptionalPhoto, storeOptionalPhoto, deleteRefusedPhoto];

router.get('/group-admin/dashboard', read(requireGroupAdmin, showDashboard));
router.get('/group-admin/members', read(requireGroupAdmin, listMembers));
router.post('/group-admin/members/:userId/approve', write(requireGroupAdmin, approveMember));
router.post('/group-admin/members/:userId/reject', write(requireGroupAdmin, rejectMember));
router.patch('/group-admin/members/:userId/trust', write(requireGroupAdmin, setMemberTrust));
router.patch('/group-admin/members/:userId/status', write(requireGroupAdmin, setMemberStatus));
router.patch('/group-admin/members/:userId/role', write(requireGroupAdmin, setMemberRole));
router.delete('/group-admin/members/:userId', write(requireGroupAdmin, removeMember));
router.patch('/group-admin/settings', write(requireGroupAdmin, updateSettings));
router.post('/group-admin/image', check(requireGroupAdmin), receivePhoto, storePhoto, read(requireGroupAdmin, changeImage));
router.delete('/group-admin/image', read(requireGroupAdmin, removeImage));
router.post('/group-admin/invite-code/rotate', write(requireGroupAdmin, rotateInviteCode));

router.get('/group-admin/items', read(requireGroupAdmin, listItems));
router.post('/group-admin/items/:itemId/approve', ...optionalPhoto, read(requireGroupAdmin, approveItem));
router.post('/group-admin/items/:itemId/reject', write(requireGroupAdmin, rejectItem));
router.patch('/group-admin/items/:itemId', ...optionalPhoto, read(requireGroupAdmin, editItem));
router.patch('/group-admin/items/:itemId/moderate', write(requireGroupAdmin, moderateItem));
router.get('/group-admin/loans', read(requireGroupAdmin, listLoans));
router.post('/group-admin/loans/:loanId/nudge', write(requireGroupAdmin, nudgeLoan));
router.post('/group-admin/loans/:loanId/resolve', write(requireGroupAdmin, resolveLoan));
router.post('/group-admin/announcements', write(requireGroupAdmin, publishAnnouncement));
router.delete('/group-admin/announcements/active', write(requireGroupAdmin, clearAnnouncement));
router.get('/group-admin/activity-log', read(requireGroupAdmin, showActivityLog));

export default router;
