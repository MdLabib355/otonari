// Super Admin API routes (/api/v1/super-admin/*) plus the public active catalog (/api/v1/catalog, /api/v1/categories).
// Authentication uses Otonari's unified accounts & sessions (/api/v1/auth/login) with role = 'super_admin'.

import express from 'express';
import { requireSuperAdmin } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';
import {
  createCatalogEntry,
  createCategory,
  listCatalog,
  listDisputes,
  listGroups,
  provisionGroup,
  rescueGroupAdmin,
  resolveDispute,
  rotateAnyGroupCode,
  runCleanupUploads,
  runRemindersNow,
  sendDisputeNotice,
  showAuditLogs,
  showCategories,
  showDisputeEvidence,
  showOverview,
  showPublicCatalog,
  showPublicCategories,
  unlockDisputeBreakGlass,
  updateCatalogEntry,
  updateCategory,
  updateGroupStatus,
} from './superAdminController.ts';

const router = express.Router();

// Public active catalog for resident client synchronization
router.get('/catalog', read(showPublicCatalog));
router.get('/categories', read(showPublicCategories));

// Platform Overview & Operations
router.get('/super-admin/overview', read(requireSuperAdmin, showOverview));
router.post('/super-admin/operations/run-reminders', write(requireSuperAdmin, runRemindersNow));
router.post('/super-admin/operations/cleanup-uploads', write(requireSuperAdmin, runCleanupUploads));

// Groups & Admin Rescue
router.get('/super-admin/groups', read(requireSuperAdmin, listGroups));
router.post('/super-admin/groups', write(requireSuperAdmin, provisionGroup));
router.post('/super-admin/groups/:groupId/rotate-code', write(requireSuperAdmin, rotateAnyGroupCode));
router.post('/super-admin/groups/:groupId/rescue-admin', write(requireSuperAdmin, rescueGroupAdmin));
router.patch('/super-admin/groups/:groupId/status', write(requireSuperAdmin, updateGroupStatus));

// Global Fixed Catalog
router.get('/super-admin/catalog', read(requireSuperAdmin, listCatalog));
router.post('/super-admin/catalog', write(requireSuperAdmin, createCatalogEntry));
router.patch('/super-admin/catalog/:key', write(requireSuperAdmin, updateCatalogEntry));

// Global Categories
router.get('/super-admin/categories', read(requireSuperAdmin, showCategories));
router.post('/super-admin/categories', write(requireSuperAdmin, createCategory));
router.patch('/super-admin/categories/:key', write(requireSuperAdmin, updateCategory));

// Escalated Disputes & Audited Break-Glass Inspection
router.get('/super-admin/disputes', read(requireSuperAdmin, listDisputes));
router.post('/super-admin/disputes/:disputeId/break-glass', write(requireSuperAdmin, unlockDisputeBreakGlass));
router.get('/super-admin/disputes/:disputeId/evidence', read(requireSuperAdmin, showDisputeEvidence));
router.post('/super-admin/disputes/:disputeId/notice', write(requireSuperAdmin, sendDisputeNotice));
router.patch('/super-admin/disputes/:disputeId/resolve', write(requireSuperAdmin, resolveDispute));

// Immutable Audit Log
router.get('/super-admin/audit-logs', read(requireSuperAdmin, showAuditLogs));

export default router;
