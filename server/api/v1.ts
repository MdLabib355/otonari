// Version 1 of the API: everything under /api/v1.

import express from 'express';
import { DEMO_MODE } from '../core/settings.ts';
import adminRoutes from '../modules/admin/adminRoutes.ts';
import authRoutes from '../modules/auth/authRoutes.ts';
import demoRoutes from '../modules/demo/demoRoutes.ts';
import groupAdminRoutes from '../modules/groupAdmin/groupAdminRoutes.ts';
import groupRoutes from '../modules/group/groupRoutes.ts';
import itemRoutes from '../modules/item/itemRoutes.ts';
import loanRoutes from '../modules/loan/loanRoutes.ts';
import messageRoutes from '../modules/message/messageRoutes.ts';
import superAdminRoutes from '../modules/superAdmin/superAdminRoutes.ts';
import userRoutes from '../modules/user/userRoutes.ts';

export function createV1(): express.Router {
  const v1 = express.Router();

  v1.use(authRoutes);
  v1.use(userRoutes);
  v1.use(groupRoutes);
  v1.use(groupAdminRoutes);
  v1.use(itemRoutes);
  v1.use(loanRoutes);
  v1.use(messageRoutes);
  v1.use(adminRoutes);
  v1.use(superAdminRoutes);
  if (DEMO_MODE) v1.use(demoRoutes);
  return v1;
}
