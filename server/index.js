// Otonari API server (Express 5 + PostgreSQL).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { closeDatabase, query } from './db/pool.js';
import { initDatabase } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { errorHandler, securityHeaders } from './middleware/security.js';
import { servePhoto } from './services/photos.js';
import { startReminders, stopReminders } from './services/reminders.js';
import demoRoutes from './routes/demo.js';
import groupRoutes from './routes/groups.js';
import inboxRoutes from './routes/inbox.js';
import itemRoutes from './routes/items.js';
import loanRoutes from './routes/loans.js';

const clientDist = path.join(import.meta.dirname, '..', 'client', 'dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/uploads/:filename', servePhoto);

  app.get('/api/health', async (req, res) => {
    try {
      await query('SELECT 1');
      res.json({ ok: true, db: 'ok', demo_mode: process.env.DEMO_MODE === 'true' });
    } catch {
      res.status(503).json({ ok: false, db: 'error', demo_mode: process.env.DEMO_MODE === 'true' });
    }
  });

  app.use('/api', groupRoutes);
  app.use('/api', itemRoutes);
  app.use('/api', loanRoutes);
  app.use('/api', inboxRoutes);

  if (process.env.DEMO_MODE === 'true') {
    app.use('/api', demoRoutes);
  }

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  dotenv.config({ path: path.join(import.meta.dirname, '.env'), quiet: true });
  const PORT = Number(process.env.PORT) || 3001;

  await initDatabase();
  const countRes = await query('SELECT COUNT(*)::int AS count FROM groups');
  if (countRes.rows[0].count === 0) {
    console.log('The database is empty, so it gets the demo data.');
    await seedDatabase();
  }

  const app = createApp();
  const server = app.listen(PORT, (error) => {
    if (error) {
      console.error(`Otonari server could not start on port ${PORT}: ${error.message}`);
      process.exit(1);
    }
    const demo = process.env.DEMO_MODE === 'true' ? 'on' : 'off';
    console.log(`Otonari server running on http://localhost:${PORT} (demo mode: ${demo})`);
    startReminders();
  });

  const shutdown = async () => {
    stopReminders();
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
