// Version 1 of the API: everything under /api/v1.
// A change that would break older clients (a renamed field, a removed route) goes into a new v2.ts, which
// can reuse the routes that stay the same. New routes and new fields can simply be added here.

import express from 'express';
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

  // Each module's routes use full paths (e.g. '/join'). Login is checked per route with requireUser
  // (see core/auth.ts).
  v1.use(groupRoutes);
  v1.use(groupAdminRoutes);
  v1.use(userRoutes);
  v1.use(itemRoutes);
  v1.use(loanRoutes);
  v1.use(messageRoutes);
  v1.use(superAdminRoutes);

  // Demo-only routes ("continue as a neighbor"): only when DEMO_MODE=true in server/.env.
  if (process.env.DEMO_MODE === 'true') {
    v1.use(demoRoutes);
  }
  return v1;
}
