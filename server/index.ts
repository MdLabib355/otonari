// Otonari API server (Express).
// Development: Vite serves the React app on :5173 and forwards /api and /uploads to this server.
// Production (`npm run build`, then `npm start`): this server also serves the built React app,
// so the whole app runs on one port.

import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createV1 } from './api/v1.ts';
import { startReminders } from './modules/loan/reminders.ts';
import { countGroups } from './modules/group/groupModel.ts';

// Load server/.env by its full path, because `npm start` runs from the project root
// while `npm run dev` runs from the server folder.
// Note: the imports above run BEFORE this line, so other files must read process.env
// inside their functions, not at the top of the file.
dotenv.config({ path: path.join(import.meta.dirname, '.env'), quiet: true });

const PORT = process.env.PORT || 3001;
const uploadsDir = path.join(import.meta.dirname, 'uploads');
const clientDist = path.join(import.meta.dirname, '..', 'client', 'dist');

const app = express();
app.set('trust proxy', 1); // on Render, every request comes through one proxy
app.use(cors());
app.use(express.json());

// Handover and return photos, e.g. /uploads/3f9c1a.jpg
app.use('/uploads', express.static(uploadsDir));

// Not versioned: it only says that the server is running.
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// The API, one line per version. Older versions stay here for as long as clients use them.
app.use('/api/v1', createV1());

// API routes are mounted above this line.
// Unknown API URLs get a JSON 404, never the React page (that would confuse fetch()).
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Production only (client/dist exists after `npm run build`): serve the built React app.
// Any other URL, e.g. /join?code=SAKURA-2611 from the QR poster, gets index.html,
// and React Router shows the right page.
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Errors end up here (Express knows it's the error handler because it has 4 parameters).
// Client mistakes like broken JSON keep their status (e.g. 400); anything unexpected becomes
// a 500, with the details printed in this terminal instead of sent to the browser.
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
if (countGroups() === 0) {
  console.log('The database is empty, so it gets the demo data.');
  await import('./seed.ts'); // importing it runs it
}

// Express 5 also calls this function when the server can NOT start (e.g. the port is taken).
app.listen(PORT, (error) => {
  if (error) {
    console.error(`Otonari server could not start on port ${PORT}: ${error.message}`);
    console.error('Is another app (or another copy of this server) already using that port?');
    process.exit(1);
  }
  const demo = process.env.DEMO_MODE === 'true' ? 'on' : 'off';
  console.log(`Otonari server running on http://localhost:${PORT} (demo mode: ${demo})`);
  startReminders();
});
