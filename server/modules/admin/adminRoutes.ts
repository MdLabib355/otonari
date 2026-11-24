//   GET    /api/v1/admin/groups      super admin   all groups, with their code and number of members
//   GET    /api/v1/admin/users       super admin   all accounts
//   PATCH  /api/v1/admin/users/:id   super admin   { role?, active? }

import express from 'express';
import { requireSuperAdmin } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';
import { showGroups, showUsers, updateUser } from './adminController.ts';

const router = express.Router();

router.get('/admin/groups', read(requireSuperAdmin, showGroups));
router.get('/admin/users', read(requireSuperAdmin, showUsers));
router.patch('/admin/users/:id', write(requireSuperAdmin, updateUser));

export default router;
