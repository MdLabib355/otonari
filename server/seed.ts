// Resets the database and deletes the old photos. Run from the project root:
//   npm run seed         fills it with the Nagasaki demo data (CLAUDE.md section 9)
//   npm run seed:empty   only the two groups: for a demo with real people, who all join themselves
// Safe to run any time, even while the server is running: it always starts from empty tables.
// Everyone gets a new token, so open browser windows will be sent back to the join page.

import { closeDatabase } from './core/database.ts';
import { seed } from './seedData.ts';

await seed(process.argv.includes('--empty'));
await closeDatabase();
