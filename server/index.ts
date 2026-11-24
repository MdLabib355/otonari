// Otonari API server (Express).
// Development: Vite serves the React app on :5173 and forwards /api and /uploads to this server.
// `npm run build`, then `npm start`: this server also serves the built React app, on one port.
// Docker: nginx serves the React app and forwards /api and /uploads (client/nginx.conf).

import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createV1 } from './api/v1.ts';
import { addNewColumns, createTables, query, waitForDatabase } from './core/database.ts';
import { DEMO_MODE } from './core/settings.ts';
import { ensureSuperAdmin } from './modules/auth/superAdmin.ts';
import { countGroups } from './modules/group/groupModel.ts';
import { startReminders } from './modules/loan/reminders.ts';
import { seed, seedCatalogItems } from './seedData.ts';

const PORT = process.env.PORT || 3001;
const uploadsDir = path.join(import.meta.dirname, 'uploads');
const clientDist = path.join(import.meta.dirname, '..', 'client', 'dist');

const app = express();
app.set('trust proxy', 1); // behind nginx or on Render, every request comes through one proxy
app.use(cors());
app.use(express.json());

// Handover and return photos, e.g. /uploads/3f9c1a.jpg
app.use('/uploads', express.static(uploadsDir));

// Not versioned: it only says that the server and its database are running.
app.get('/api/health', async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

// The API, one line per version. Older versions stay here for as long as clients use them.
app.use('/api/v1', createV1());

// API routes are mounted above this line.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Production only (client/dist exists after `npm run build`): serve the built React app.
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Errors end up here.
app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
});

// An empty database (e.g. after a fresh deploy) gets the demo data, exactly like `npm run seed`.
await waitForDatabase();
await createTables();
await addNewColumns();
await seedCatalogItems();
if ((await countGroups()) === 0) {
  console.log('The database is empty, so it gets the demo data.');
  await seed(!DEMO_MODE); // without demo mode: only the two groups
}
await ensureSuperAdmin();

app.listen(PORT, (error) => {
  if (error) {
    console.error(`Otonari server could not start on port ${PORT}: ${error.message}`);
    console.error('Is another app (or another copy of this server) already using that port?');
    process.exit(1);
  }
  console.log(`Otonari server running on http://localhost:${PORT} (demo mode: ${DEMO_MODE ? 'on' : 'off'})`);
  startReminders();
});
